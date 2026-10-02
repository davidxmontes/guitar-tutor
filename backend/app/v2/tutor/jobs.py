"""Process-local Tutor jobs, shared by submission and reconnect polling."""

import asyncio
import logging
from collections.abc import Callable
from time import monotonic
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.v2.tutor.contract import LearningPreferences, TutorResponse
from app.v2.tutor.providers import TutorConfigurationError
from app.v2.tutor.song_context import SongTutorContext


class TutorTurnRequest(BaseModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    session_id: str
    branch_id: str
    message: str = Field(min_length=1, max_length=12000)
    learning_preferences: LearningPreferences = Field(default_factory=LearningPreferences)
    song_context: SongTutorContext | None = None
    web_search: bool = False


class TutorJob(BaseModel):
    id: str
    message: str
    song_context: SongTutorContext | None = None
    web_search: bool = False
    status: Literal["running", "completed", "failed"] = "running"
    result: TutorResponse | None = None
    error: str | None = None


class TutorJobs:
    """Call start/latest on the event loop after authorizing the Branch.

    Only the turn execution runs in a worker thread; registry and job changes
    stay on the event loop.
    """

    def __init__(self) -> None:
        # ponytail: one Render process, like the current memory session store.
        # Use a durable queue/store before adding workers or surviving restarts.
        self._jobs: dict[tuple[str, str, str], tuple[TutorJob, float]] = {}
        self._tasks: set[asyncio.Task] = set()

    def _expire(self) -> None:
        for key, (job, created) in list(self._jobs.items()):
            if job.status != "running" and monotonic() - created > 86400:
                del self._jobs[key]

    def latest(self, user_id: str, session_id: str, branch_id: str) -> TutorJob | None:
        self._expire()
        entry = self._jobs.get((user_id, session_id, branch_id))
        return entry[0] if entry else None

    def start(self, user_id: str, data: TutorTurnRequest, run_turn: Callable[[], TutorResponse]) -> TutorJob:
        previous = self.latest(user_id, data.session_id, data.branch_id)
        if previous and (previous.status == "running" or previous.id == data.request_id):
            if previous.message != data.message or previous.song_context != data.song_context or previous.web_search != data.web_search:
                raise HTTPException(status_code=409, detail="A Tutor question is already in progress.")
            return previous
        key = (user_id, data.session_id, data.branch_id)
        if len(self._jobs) >= 1000 and key not in self._jobs:
            raise HTTPException(status_code=429, detail="The Tutor is busy. Please try again shortly.")
        job = TutorJob(id=data.request_id or str(uuid4()), message=data.message, song_context=data.song_context, web_search=data.web_search)
        self._jobs[key] = (job, monotonic())
        task = asyncio.create_task(self._finish(job, run_turn))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job

    async def _finish(self, job: TutorJob, run_turn: Callable[[], TutorResponse]) -> None:
        try:
            job.result = await run_in_threadpool(run_turn)
            job.status = "completed"
        except Exception as exc:
            cause = exc
            while cause.__cause__ is not None:
                cause = cause.__cause__
            logging.getLogger(__name__).warning("Tutor job %r failed: %s: %.2000s", job.id, type(cause).__name__, cause)
            if isinstance(cause, TutorConfigurationError):
                job.error = "Tutor is not configured on this server. Add an API key for the selected Tutor provider, then try again."
            elif isinstance(exc, HTTPException) and exc.status_code == 409:
                job.error = "The music changed while the Tutor was working. Please ask again."
            elif isinstance(exc, HTTPException) and exc.status_code == 422:
                job.error = "The Tutor returned a suggestion this view could not apply. Your question is kept; please try again."
            elif getattr(cause, 'status_code', None) == 429:
                job.error = "The Tutor provider is busy. Your question is kept; please try again shortly."
            else:
                job.error = "The Tutor could not finish this turn. Please try again."
            job.status = "failed"
