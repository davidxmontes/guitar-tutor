"""V2 foundation routes — Session create/list/resume, Branch working-state updates.

Everything here requires an authenticated user (or the AUTH_DEV_BYPASS dev
user). Artifact CRUD, tutor endpoints, etc. land in later V2 tickets — this
is only the Session/Branch persistence contract ticket #11 establishes.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies.auth import get_current_user
from app.v2.models import ArtifactKind, Branch, Session
from app.v2.store import NotFoundError, V2Store, get_v2_store

router = APIRouter()


class UpdateBranchRequest(BaseModel):
    current_artifact_kind: Optional[ArtifactKind] = None
    current_artifact_id: Optional[str] = None
    selection: Optional[dict[str, Any]] = None
    focus: Optional[dict[str, Any]] = None
    recent_ideas: Optional[list[dict[str, Any]]] = None


@router.post("/sessions", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    return store.create_session(user_id)


@router.get("/sessions", response_model=list[Session])
async def list_sessions(
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    return store.list_sessions(user_id)


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    try:
        return store.get_session(session_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/sessions/{session_id}/branches/{branch_id}", response_model=Branch)
async def update_branch(
    session_id: str,
    branch_id: str,
    data: UpdateBranchRequest,
    user_id: str = Depends(get_current_user),
    store: V2Store = Depends(get_v2_store),
):
    # exclude_unset (not `is not None`): a client explicitly clearing a field
    # to null must reach the store as null, distinct from simply omitting it.
    fields = data.model_dump(exclude_unset=True)
    try:
        return store.update_branch(session_id, branch_id, user_id, **fields)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
