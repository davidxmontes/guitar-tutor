"""
Agent API routes.
"""

from fastapi import APIRouter, HTTPException
import logging

from app.models.schemas import (
    AgentRequest,
    AgentResponse,
    AgentMessage,
    ApiRequests,
    ChordApiRequest,
    ScaleApiRequest,
)
from app.agent.agent import get_agent
from app.agent.parser import build_api_requests_from_response

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/agent/chat", response_model=AgentResponse)
async def chat_with_agent(request: AgentRequest):
    """
    Chat with the Guitar Tutor agent.
    
    Args:
        request: AgentRequest containing the user message and optional conversation history
    
    Returns:
        AgentResponse with the agent's answer, structured data, and parsed API requests
    """
    try:
        agent = get_agent()
        
        # Convert conversation history to dict format
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]
        
        result = agent.chat(
            message=request.message,
            conversation_history=history
        )
        
        # Parse chord/scale names into API requests
        # Always build api_requests when we have chords or scale, not just when visualizations=true
        api_requests_data = None
        has_chords = bool(result.get("chord_choices"))
        has_scale = bool(result.get("scale"))
        if (has_chords or has_scale) and not result.get("out_of_scope"):
            parsed = build_api_requests_from_response(
                chord_choices=result.get("chord_choices", []),
                scale=result.get("scale"),
                include_scale=True
            )
            
            # Convert to Pydantic models
            chord_requests = [
                ChordApiRequest(**chord)
                for chord in parsed.get("chords", [])
            ]
            
            scale_request = None
            if parsed.get("scale"):
                scale_request = ScaleApiRequest(**parsed["scale"])
            
            api_requests_data = ApiRequests(
                chords=chord_requests,
                scale=scale_request
            )
        
        return AgentResponse(
            answer=result["answer"],
            scale=result.get("scale"),
            chord_choices=result.get("chord_choices", []),
            visualizations=result.get("visualizations", False),
            out_of_scope=result.get("out_of_scope", False),
            api_requests=api_requests_data,
        )
    
    except ValueError as e:
        # Missing API key or configuration error
        logger.error(f"Agent configuration error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Agent not configured properly. Please check OPENAI_API_KEY."
        )
    
    except Exception as e:
        logger.error(f"Agent error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while processing your request: {str(e)}"
        )


@router.get("/agent/health")
async def agent_health():
    """Check if the agent is properly configured and ready."""
    try:
        agent = get_agent()
        return {"status": "ready", "model": "gpt-4o-mini"}
    except ValueError as e:
        return {"status": "not_configured", "error": str(e)}
    except Exception as e:
        return {"status": "error", "error": str(e)}
