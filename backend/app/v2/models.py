"""V2 domain models — Session, Branch, and the artifact-kind vocabulary.

Session = an ongoing exploration containing multiple branches.
Branch = one independent working context (current artifact reference,
selection, focus, recent ideas, tutor-thread identity).
Artifact = a durable musical thing (SongStudy, Progression, ConceptStudy,
Exercise) saved/reopened independently of the branch that created it.
Artifact CRUD itself lands in later tickets; this ticket only needs the
kind vocabulary validated on a branch's current-artifact reference.
"""

from typing import Any, Literal, Optional, get_args

from pydantic import BaseModel, Field

ArtifactKind = Literal["song_study", "progression", "concept_study", "exercise"]

ARTIFACT_KINDS: tuple[str, ...] = get_args(ArtifactKind)


class Branch(BaseModel):
    id: str
    session_id: str
    tutor_thread_id: str
    current_artifact_kind: Optional[ArtifactKind] = None
    current_artifact_id: Optional[str] = None
    selection: Optional[dict[str, Any]] = None
    focus: Optional[dict[str, Any]] = None
    recent_ideas: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str
    updated_at: str


class Session(BaseModel):
    id: str
    user_id: str
    branches: list[Branch]
    created_at: str
    updated_at: str
