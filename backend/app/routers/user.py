"""User profile routes — progressions, favorites, conversation threads."""

from fastapi import APIRouter, Depends, status

from app.dependencies.auth import get_current_user
from app.models.user import (
    AddFavoriteRequest,
    ConversationThread,
    FavoriteSong,
    SavedProgression,
    SaveProgressionRequest,
)
from app.services import user_service

router = APIRouter()


@router.get("/user/progressions", response_model=list[SavedProgression])
def get_progressions(user_id: str = Depends(get_current_user)):
    return user_service.list_progressions(user_id)


@router.post("/user/progressions", response_model=SavedProgression, status_code=status.HTTP_201_CREATED)
def post_progression(
    data: SaveProgressionRequest,
    user_id: str = Depends(get_current_user),
):
    return user_service.save_progression(user_id, data)


@router.delete("/user/progressions/{progression_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_progression(
    progression_id: str,
    user_id: str = Depends(get_current_user),
):
    user_service.delete_progression(user_id, progression_id)


@router.get("/user/favorites", response_model=list[FavoriteSong])
def get_favorites(user_id: str = Depends(get_current_user)):
    return user_service.list_favorites(user_id)


@router.post("/user/favorites", response_model=FavoriteSong, status_code=status.HTTP_201_CREATED)
def post_favorite(
    data: AddFavoriteRequest,
    user_id: str = Depends(get_current_user),
):
    return user_service.add_favorite(user_id, data)


@router.delete("/user/favorites/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_favorite(
    song_id: int,
    user_id: str = Depends(get_current_user),
):
    user_service.remove_favorite(user_id, song_id)


@router.get("/user/threads", response_model=list[ConversationThread])
def get_threads(user_id: str = Depends(get_current_user)):
    return user_service.list_threads(user_id)
