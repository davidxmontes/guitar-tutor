"""
Guitar Tutor LangGraph Agent.
Provides music theory and guitar-related answers using a two-node graph:
1. prepare_question - normalizes and validates the user's question
2. generate_answer - generates a structured answer with chord/scale recommendations
"""
from langgraph.checkpoint.memory import MemorySaver

import os
import logging
from typing import List, Optional, TypedDict
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END, MessagesState
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from langgraph.types import Command, interrupt

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


# --- Pydantic Schemas for structured LLM output ---

class PreppedQuestionSchema(TypedDict):
    """Schema for the prepare_question node output."""
    question_for_llm: Optional[str] = Field(None, description="A concise guitar/music-theory question")
    out_of_scope: bool = Field(False, description="Whether the question is out of scope")
    clarifying_question: Optional[str] = Field(None, description="A clarifying question if needed")


class AnswerRequestSchema(TypedDict):
    """Schema for the generate_answer node output."""
    answer: str = Field(..., description="The answer text to return to the user")
    scale: str = Field(..., description="A single recommended scale name relevant to the user question")
    chord_choices: List[str] = Field(..., description="List of chord names recommended")
    visualizations: bool = Field(False, description="Whether visualizations are needed")


class OverallState(MessagesState):
    """Overall state for the agent graph."""
    question_for_llm: Optional[str] = None
    clarifying_question: Optional[str] = None
    answer: str = ""
    scale: Optional[str] = None
    chord_choices: List[str] = []
    visualizations: bool = False
    out_of_scope: bool = False


# --- Prompt Templates ---

PREP_QUESTION_INSTRUCTIONS = """You are the Guitar Tutor question normalizer. You will ONLY prepare a single, concise MUSIC THEORY / GUITAR question for the NEXT node to answer — do NOT answer the question yourself.

Inputs available to you (replace in runtime): {previous_context} (list of recent messages, most recent last) and {user_question} (string).

Output requirements (JSON ONLY): produce exactly one of these three JSON shapes and nothing else. Use canonical chord/scale names when relevant. Keep output ≤ 20 words when possible.

1) Clear music/guitar question. This is used as input to the following LLM node call. Do not use for clarifying_questions/additional input needed from user. Use clarifying_question for that.
{{"question_for_llm": "<≤ 20 words, concise guitar/music-theory question>", "out_of_scope": false}}

2) Need clarification (ask one short question only). This is used for clarifying the question to prepare requesting additional user input.
{{"clarifying_question": "<one short clarifying question>", "out_of_scope": false}}

3) Out of scope
{{"out_of_scope": true}}

- If the user's request is not music, guitar or music theory related, return the out_of_scope JSON above.
- If ambiguous but fixable with one question (e.g., missing root), return a single clarifying_question.
- If you provide a clarifying_question, do not provide an 'answer' as well.
- IMPORTANT: If you produce a clarifying question, it MUST be returned in the `clarifying_question` field and `question_for_llm` MUST be empty or null.
- Prefer concise canonical names for chords/scales (e.g., "C major", "A minor pentatonic").
- Do NOT include voicings, diagrams, notes, or additional metadata.
"""

QUESTION_INSTRUCTIONS = """You are the Guitar Tutor LLM node. Your role is to interpret a user's question and return a focused, helpful, music-theory / guitar-oriented answer.

Hard constraints (must be strictly followed):
- ONLY answer music theory or guitar-related questions.
- When recommending chord(s) or scale(s), LIMIT output to chord or scale NAMES ONLY (e.g., 'C major', 'A minor').
- Always provide a single relevant `scale` string in every response.
- When listing chord options, use the `chord_choices` array with chord names only.
- Keep output concise and structured.

Behavior & output format:
- Decide whether output can be presented visually (chord progression, chords, or scale). If yes, set `visualizations` to true.
- Always include a short, clear `answer` field (1-3 concise paragraphs).
- Always include the `scale` field with a single recommended scale name.
- Include chord recommendations in `chord_choices` array.

Tone & pedagogy:
- Be friendly, clear, and pedagogical. Explain WHY choices work.
- Use short examples in the `answer` field.

Question: {user_question}
"""


class GuitarTutorAgent:
    """Guitar Tutor Agent using LangGraph."""
    
    def __init__(self, model_name: str = "gpt-4o-mini", temperature: float = 0):
        """Initialize the agent with the specified model."""
        self.memory = MemorySaver()

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        self.llm = ChatOpenAI(model=model_name, temperature=temperature)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """Build and compile the LangGraph state machine."""
        builder = StateGraph(OverallState)
        
        builder.add_node("prepare_question", self._prepare_question)
        builder.add_node("clarify_input", self._clarify_input)
        builder.add_node("generate_answer", self._generate_answer)
        
        builder.add_edge(START, "prepare_question")
        builder.add_edge("prepare_question", "clarify_input")  # Check if clarification needed
        # clarify_input routes itself using Command
        builder.add_edge("generate_answer", END)
        
        return builder.compile(checkpointer=self.memory)
    
    def _prepare_question(self, state: dict) -> dict:
        """Prepare and normalize the user's question."""

        structured_llm = self.llm.with_structured_output(PreppedQuestionSchema)
        
        messages = state.get('messages', [])
        # Only use the last 4 messages for context (last 3 messages + current)
        recent_messages = messages[-4:] if len(messages) > 4 else messages
        previous_context = "\n".join([msg.content for msg in recent_messages[:-1]]) if len(recent_messages) > 1 else "None"
        last_question_text = messages[-1].content if messages else ""

        system_message = SystemMessage(
            content=PREP_QUESTION_INSTRUCTIONS.format(
                previous_context=previous_context,
                user_question=last_question_text
            )
        )
        
        # Only pass system message - context is already embedded in it
        result = structured_llm.invoke([system_message])
        
        # Normalize result
        if isinstance(result, dict):
            q = result
        else:
            q = result.model_dump() if hasattr(result, 'model_dump') else result.dict()
        
        logger.info(f"Prepared question: {q}")
        
        return {
            "question_for_llm": q.get("question_for_llm"),
            "clarifying_question": q.get("clarifying_question"),
            "out_of_scope": q.get("out_of_scope", False),
        }

    def _clarify_input(self, state: dict) -> Command:
        """Handle clarifying questions if needed."""
        clarifying_question = state.get("clarifying_question")
        
        # If there's no clarifying question, skip this node
        if not clarifying_question:
            return Command(goto="generate_answer")
        
        # Interrupt() must come first - get human's response
        human_input = interrupt({
            "clarifying_question": clarifying_question,
            "action": "Please answer this question to continue"
        })
        
        # Append human's response to messages and clear the clarifying question
        return Command(
            update={
                "messages": [HumanMessage(content=human_input.get("response", ""))],
                "clarifying_question": None
            },
            goto="prepare_question"  # Re-run to now prepare the actual question
        )

    def _generate_answer(self, state: dict) -> dict:
        """Generate a structured answer based on the prepared question."""
        messages = state.get('messages', [])
        question_for_llm = state.get("question_for_llm")
        clarifying_question = state.get("clarifying_question")
        out_of_scope = state.get("out_of_scope", False)
        
        # Handle out of scope questions
        if out_of_scope:
            refusal_msg = "I only help with guitar & music theory — please ask about chords, scales, fretboard shapes, voicings, or music theory concepts."
            return {
                "messages": [AIMessage(content=refusal_msg)],
                "answer": refusal_msg,
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": True,
            }
        
        # Handle clarifying questions
        if clarifying_question and not question_for_llm:
            return {
                "messages": [AIMessage(content=clarifying_question)],
                "answer": clarifying_question,
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
            }
        
        # Generate answer for valid questions
        structured_llm = self.llm.with_structured_output(AnswerRequestSchema)
        
        question_text = question_for_llm if question_for_llm else (
            messages[-1].content if messages else ""
        )
        
        system_message = SystemMessage(
            content=QUESTION_INSTRUCTIONS.format(user_question=question_text)
        )
        
        human_msg = HumanMessage(content=question_text)
        result = structured_llm.invoke([system_message, human_msg])
        
        # Normalize result
        if isinstance(result, dict):
            q = result
        else:
            q = result.model_dump() if hasattr(result, 'model_dump') else result.dict()
        
        answer_text = q.get("answer", "")
        
        return {
            "messages": [AIMessage(content=answer_text)],
            "answer": answer_text,
            "scale": q.get("scale"),
            "chord_choices": q.get("chord_choices", []),
            "visualizations": q.get("visualizations", False),
            "out_of_scope": False,
        }
    
    def chat(
        self,
        message: str,
        conversation_history: List[dict] = None,
        thread_id: Optional[str] = "1",
    ) -> dict:
        """
        Process a user message and return the agent's response.
        
        Args:
            message: The user's message
            conversation_history: Optional list of previous messages
            thread_id: Thread ID for conversation tracking
        
        Returns:
            dict with keys: answer, scale, chord_choices, visualizations, out_of_scope, 
            interrupted (bool), interrupt_data (if interrupted)
        """
        config = {"configurable": {"thread_id": thread_id}}
        
        # Build messages list from conversation history
        messages = []
        
        if conversation_history:
            for msg in conversation_history:
                if msg.get("role") == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                elif msg.get("role") == "assistant":
                    messages.append(AIMessage(content=msg["content"]))
        
        # Add the current message
        messages.append(HumanMessage(content=message))
        
        # Stream the graph to handle interrupts
        output = None
        for event in self.graph.stream({"messages": messages}, config=config, stream_mode="values"):
            output = event
        
        # Check if interrupted
        state_snapshot = self.graph.get_state(config)
        is_interrupted = False
        interrupt_data = None
        
        if state_snapshot.tasks:
            for task in state_snapshot.tasks:
                if task.interrupts:
                    is_interrupted = True
                    interrupt_data = task.interrupts[0].value
                    break
        
        # If interrupted, return interrupt info
        if is_interrupted:
            return {
                "interrupted": True,
                "interrupt_data": interrupt_data,
                "answer": "",
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
            }
        
        # Convert messages to serializable format for debug output
        debug_messages = []
        for msg in output.get("messages", []):
            debug_messages.append({
                "type": type(msg).__name__,
                "content": msg.content,
            })
        
        return {
            "interrupted": False,
            "answer": output.get("answer", ""),
            "scale": output.get("scale"),
            "chord_choices": output.get("chord_choices", []),
            "visualizations": output.get("visualizations", False),
            "out_of_scope": output.get("out_of_scope", False),
            "debug_state": {
                "messages": debug_messages,
                "question_for_llm": output.get("question_for_llm"),
                "clarifying_question": output.get("clarifying_question"),
                "answer": output.get("answer"),
                "scale": output.get("scale"),
                "chord_choices": output.get("chord_choices", []),
                "visualizations": output.get("visualizations", False),
                "out_of_scope": output.get("out_of_scope", False),
            },
        }

    def resume_chat(
        self,
        human_response: str,
        thread_id: Optional[str] = "1",
    ) -> dict:
        """Resume from an interrupt with human input."""
        config = {"configurable": {"thread_id": thread_id}}
        
        # Resume with the human response
        output = None
        for event in self.graph.stream(
            Command(resume={"response": human_response}),
            config=config,
            stream_mode="values"
        ):
            output = event
        
        # Convert messages to serializable format
        debug_messages = []
        for msg in output.get("messages", []):
            debug_messages.append({
                "type": type(msg).__name__,
                "content": msg.content,
            })
        
        return {
            "interrupted": False,
            "answer": output.get("answer", ""),
            "scale": output.get("scale"),
            "chord_choices": output.get("chord_choices", []),
            "visualizations": output.get("visualizations", False),
            "out_of_scope": output.get("out_of_scope", False),
            "debug_state": {
                "messages": debug_messages,
                "question_for_llm": output.get("question_for_llm"),
                "clarifying_question": output.get("clarifying_question"),
            },
        }

    def check_interrupt(self, thread_id: str = "1") -> Optional[dict]:
        """Check if there's an active interrupt for the given thread."""
        config = {"configurable": {"thread_id": thread_id}}
        state_snapshot = self.graph.get_state(config)
        
        # Check if there are pending tasks with interrupts
        if state_snapshot.tasks:
            for task in state_snapshot.tasks:
                if task.interrupts:
                    return task.interrupts[0].value  # Return the interrupt data
        
        return None


# Singleton instance (lazy initialization)
_agent_instance: Optional[GuitarTutorAgent] = None


def get_agent() -> GuitarTutorAgent:
    """Get or create the singleton agent instance."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = GuitarTutorAgent()
    return _agent_instance
