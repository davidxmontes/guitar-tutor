"""
Agent API routes — synchronous and SSE streaming endpoints.
"""

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agent.agent import ThreadNotFoundError, get_agent
from app.agent.parser import build_api_requests_from_response
from app.models.agent import (
    AgentRequest,
    AgentResponse,
    ApiRequests,
    ChordApiRequest,
    ScaleApiRequest,
    ResumeRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Shared helpers ---

def _build_agent_response(result: dict) -> AgentResponse:
    """Build an AgentResponse from a raw agent result dict."""
    if result.get("interrupted"):
        return AgentResponse(
            answer="",
            interrupted=True,
            interrupt_data=result.get("interrupt_data"),
            visualizations=False,
            out_of_scope=False,
            actions=[],
            memory_status=result.get("memory_status", "fresh"),
        )

    api_requests_data = _parse_api_requests(result)

    return AgentResponse(
        answer=result["answer"],
        scale=result.get("scale"),
        chord_choices=result.get("chord_choices", []),
        visualizations=result.get("visualizations", False),
        out_of_scope=result.get("out_of_scope", False),
        interrupted=False,
        api_requests=api_requests_data,
        actions=result.get("actions", []),
        memory_status=result.get("memory_status", "fresh"),
    )


def _parse_api_requests(result: dict) -> ApiRequests | None:
    """Parse chord/scale names into structured API request objects."""
    has_chords = bool(result.get("chord_choices"))
    has_scale = bool(result.get("scale"))

    if (not has_chords and not has_scale) or result.get("out_of_scope"):
        return None

    parsed = build_api_requests_from_response(
        chord_choices=result.get("chord_choices", []),
        scale=result.get("scale"),
        include_scale=True,
    )

    chord_requests = [ChordApiRequest(**c) for c in parsed.get("chords", [])]
    scale_request = ScaleApiRequest(**parsed["scale"]) if parsed.get("scale") else None

    return ApiRequests(chords=chord_requests, scale=scale_request)


def _history_to_dicts(request: AgentRequest) -> list[dict]:
    return [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]


def _bootstrap_to_dicts(request: AgentRequest) -> list[dict]:
    """Choose bootstrap history with deprecated conversation_history fallback."""
    if request.bootstrap_history:
        return [{"role": msg.role, "content": msg.content} for msg in request.bootstrap_history]
    # Deprecated fallback for older clients.
    return _history_to_dicts(request)


def _ui_context_dict(obj) -> dict:
    if not obj:
        return {}
    return obj.model_dump(exclude_none=True)


# --- Synchronous endpoints ---

@router.post("/agent/chat", response_model=AgentResponse)
async def chat_with_agent(request: AgentRequest):
    """Chat with the Guitar Tutor agent."""
    logger.info(f"Chat request: thread={request.thread_id}, message={request.message[:80]}")
    agent = get_agent()
    try:
        result = agent.chat(
            message=request.message,
            conversation_history=_history_to_dicts(request),
            bootstrap_history=_bootstrap_to_dicts(request),
            require_existing_thread=request.require_existing_thread,
            ui_context=_ui_context_dict(request.ui_context),
            thread_id=request.thread_id,
        )
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "THREAD_NOT_FOUND",
                "detail": str(exc),
                "thread_id": exc.thread_id,
            },
        )
    return _build_agent_response(result)


@router.get("/agent/health")
async def agent_health():
    """Check if the agent is properly configured and ready."""
    try:
        agent = get_agent()
        return {"status": "ready", "model": agent.model_name}
    except ValueError as e:
        return {"status": "not_configured", "error": str(e)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.post("/agent/resume", response_model=AgentResponse)
async def resume_agent_chat(request: ResumeRequest):
    """Resume agent chat after user answers a clarifying question."""
    logger.info(f"Resume request: thread={request.thread_id}")
    agent = get_agent()
    try:
        result = agent.resume_chat(
            human_response=request.response,
            thread_id=request.thread_id,
            ui_context=_ui_context_dict(request.ui_context),
        )
    except ThreadNotFoundError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "THREAD_NOT_FOUND",
                "detail": str(exc),
                "thread_id": exc.thread_id,
            },
        )
    return _build_agent_response(result)


# --- SSE streaming endpoints ---

@router.post("/agent/chat/stream")
async def stream_chat_with_agent(request: AgentRequest):
    """SSE streaming endpoint for agent chat."""
    logger.info(f"Stream chat request: thread={request.thread_id}, message={request.message[:80]}")

    def event_generator():
        try:
            agent = get_agent()
            for event in agent.stream_chat(
                message=request.message,
                conversation_history=_history_to_dicts(request),
                bootstrap_history=_bootstrap_to_dicts(request),
                require_existing_thread=request.require_existing_thread,
                ui_context=_ui_context_dict(request.ui_context),
                thread_id=request.thread_id,
            ):
                event_type = event["event"]
                data = event["data"]

                # Enrich the final answer with parsed API requests
                if event_type == "answer":
                    data["api_requests"] = _serialize_api_requests(data)

                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

            yield "event: done\ndata: {}\n\n"
        except ThreadNotFoundError as exc:
            payload = {
                "code": "THREAD_NOT_FOUND",
                "detail": str(exc),
                "thread_id": exc.thread_id,
            }
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"
        except Exception as e:
            logger.exception(f"SSE stream error: {e}")
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/agent/resume/stream")
async def stream_resume_agent_chat(request: ResumeRequest):
    """SSE streaming endpoint for resuming agent chat."""
    logger.info(f"Stream resume request: thread={request.thread_id}")

    def event_generator():
        try:
            agent = get_agent()
            for event in agent.stream_resume(
                human_response=request.response,
                ui_context=_ui_context_dict(request.ui_context),
                thread_id=request.thread_id,
            ):
                event_type = event["event"]
                data = event["data"]

                if event_type == "answer":
                    data["api_requests"] = _serialize_api_requests(data)

                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

            yield "event: done\ndata: {}\n\n"
        except ThreadNotFoundError as exc:
            payload = {
                "code": "THREAD_NOT_FOUND",
                "detail": str(exc),
                "thread_id": exc.thread_id,
            }
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"
        except Exception as e:
            logger.exception(f"SSE resume stream error: {e}")
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _serialize_api_requests(result: dict) -> dict | None:
    """Parse and serialize API requests for SSE JSON output."""
    api_requests = _parse_api_requests(result)
    if api_requests is None:
        return None
    return api_requests.model_dump()
