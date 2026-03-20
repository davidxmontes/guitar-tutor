"""
Guitar Tutor LangGraph Agent.
Provides music theory and guitar-related answers using a three-node graph:
1. prepare_question - normalizes and validates the user's question
2. clarify_input - handles interrupt/resume for clarifying questions
3. generate_answer - generates a structured answer with chord/scale recommendations
"""

import logging
import os
from typing import Generator, List, Optional, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import Command, interrupt
from pydantic import Field

load_dotenv()

logger = logging.getLogger(__name__)


# --- Structured output schemas ---

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


# --- Prompt templates ---

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

# Node names for status tracking
_NODE_FIELDS = {
    "question_for_llm": "prepare_question",
    "answer": "generate_answer",
    "clarifying_question": "prepare_question",
}


class GuitarTutorAgent:
    """Guitar Tutor Agent using LangGraph."""

    def __init__(self, model_name: str = "gpt-4o-mini", temperature: float = 0):
        self.memory = MemorySaver()

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")

        self.llm = ChatOpenAI(model=model_name, temperature=temperature)
        self.graph = self._build_graph()

    # --- Graph construction ---

    def _build_graph(self) -> StateGraph:
        builder = StateGraph(OverallState)

        builder.add_node("prepare_question", self._prepare_question)
        builder.add_node("clarify_input", self._clarify_input)
        builder.add_node("generate_answer", self._generate_answer)

        builder.add_edge(START, "prepare_question")
        builder.add_edge("prepare_question", "clarify_input")
        builder.add_edge("generate_answer", END)

        return builder.compile(checkpointer=self.memory)

    # --- Graph nodes ---

    def _prepare_question(self, state: dict) -> dict:
        structured_llm = self.llm.with_structured_output(PreppedQuestionSchema)

        messages = state.get("messages", [])
        recent_messages = messages[-4:] if len(messages) > 4 else messages
        previous_context = (
            "\n".join([msg.content for msg in recent_messages[:-1]])
            if len(recent_messages) > 1
            else "None"
        )
        last_question_text = messages[-1].content if messages else ""

        system_message = SystemMessage(
            content=PREP_QUESTION_INSTRUCTIONS.format(
                previous_context=previous_context,
                user_question=last_question_text,
            )
        )

        result = structured_llm.invoke([system_message])

        q = result if isinstance(result, dict) else (
            result.model_dump() if hasattr(result, "model_dump") else result.dict()
        )

        logger.info(f"Prepared question: {q}")

        return {
            "question_for_llm": q.get("question_for_llm"),
            "clarifying_question": q.get("clarifying_question"),
            "out_of_scope": q.get("out_of_scope", False),
        }

    def _clarify_input(self, state: dict) -> Command:
        clarifying_question = state.get("clarifying_question")

        if not clarifying_question:
            return Command(goto="generate_answer")

        human_input = interrupt({
            "clarifying_question": clarifying_question,
            "action": "Please answer this question to continue",
        })

        return Command(
            update={
                "messages": [HumanMessage(content=human_input.get("response", ""))],
                "clarifying_question": None,
            },
            goto="prepare_question",
        )

    def _generate_answer(self, state: dict) -> dict:
        question_for_llm = state.get("question_for_llm")
        clarifying_question = state.get("clarifying_question")
        out_of_scope = state.get("out_of_scope", False)

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

        if clarifying_question and not question_for_llm:
            return {
                "messages": [AIMessage(content=clarifying_question)],
                "answer": clarifying_question,
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
            }

        structured_llm = self.llm.with_structured_output(AnswerRequestSchema)
        messages = state.get("messages", [])

        question_text = question_for_llm if question_for_llm else (
            messages[-1].content if messages else ""
        )

        system_message = SystemMessage(
            content=QUESTION_INSTRUCTIONS.format(user_question=question_text)
        )

        result = structured_llm.invoke([system_message, HumanMessage(content=question_text)])

        q = result if isinstance(result, dict) else (
            result.model_dump() if hasattr(result, "model_dump") else result.dict()
        )

        answer_text = q.get("answer", "")

        return {
            "messages": [AIMessage(content=answer_text)],
            "answer": answer_text,
            "scale": q.get("scale"),
            "chord_choices": q.get("chord_choices", []),
            "visualizations": q.get("visualizations", False),
            "out_of_scope": False,
        }

    # --- Shared helpers ---

    @staticmethod
    def _build_messages(conversation_history: List[dict], message: str) -> list:
        messages = []
        if conversation_history:
            for msg in conversation_history:
                if msg.get("role") == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                elif msg.get("role") == "assistant":
                    messages.append(AIMessage(content=msg["content"]))
        messages.append(HumanMessage(content=message))
        return messages

    def _check_for_interrupt(self, config: dict) -> Optional[dict]:
        state_snapshot = self.graph.get_state(config)
        if state_snapshot.tasks:
            for task in state_snapshot.tasks:
                if task.interrupts:
                    return task.interrupts[0].value
        return None

    @staticmethod
    def _extract_result(output: dict) -> dict:
        return {
            "interrupted": False,
            "answer": output.get("answer", ""),
            "scale": output.get("scale"),
            "chord_choices": output.get("chord_choices", []),
            "visualizations": output.get("visualizations", False),
            "out_of_scope": output.get("out_of_scope", False),
        }

    @staticmethod
    def _identify_node(event: dict) -> str:
        """Identify which node produced this state update."""
        for field, node in _NODE_FIELDS.items():
            if event.get(field):
                return node
        return "processing"

    # --- Public API: synchronous ---

    def chat(
        self,
        message: str,
        conversation_history: List[dict] = None,
        thread_id: Optional[str] = "1",
    ) -> dict:
        config = {"configurable": {"thread_id": thread_id}}
        messages = self._build_messages(conversation_history or [], message)

        output = None
        for event in self.graph.stream({"messages": messages}, config=config, stream_mode="values"):
            output = event

        interrupt_data = self._check_for_interrupt(config)
        if interrupt_data:
            return {
                "interrupted": True,
                "interrupt_data": interrupt_data,
                "answer": "",
                "scale": None,
                "chord_choices": [],
                "visualizations": False,
                "out_of_scope": False,
            }

        return self._extract_result(output)

    def resume_chat(
        self,
        human_response: str,
        thread_id: Optional[str] = "1",
    ) -> dict:
        config = {"configurable": {"thread_id": thread_id}}

        output = None
        for event in self.graph.stream(
            Command(resume={"response": human_response}),
            config=config,
            stream_mode="values",
        ):
            output = event

        return self._extract_result(output)

    def check_interrupt(self, thread_id: str = "1") -> Optional[dict]:
        config = {"configurable": {"thread_id": thread_id}}
        return self._check_for_interrupt(config)

    # --- Public API: streaming (SSE) ---

    def stream_chat(
        self,
        message: str,
        conversation_history: List[dict] = None,
        thread_id: Optional[str] = "1",
    ) -> Generator[dict, None, None]:
        """Stream chat processing as SSE event dicts."""
        config = {"configurable": {"thread_id": thread_id}}
        messages = self._build_messages(conversation_history or [], message)

        last_output = None
        for event in self.graph.stream({"messages": messages}, config=config, stream_mode="values"):
            node = self._identify_node(event)
            logger.debug(f"Stream event from node: {node}")
            yield {"event": "status", "data": {"node": node}}
            last_output = event

        interrupt_data = self._check_for_interrupt(config)
        if interrupt_data:
            yield {"event": "interrupt", "data": interrupt_data}
            return

        if last_output:
            yield {"event": "answer", "data": self._extract_result(last_output)}

    def stream_resume(
        self,
        human_response: str,
        thread_id: Optional[str] = "1",
    ) -> Generator[dict, None, None]:
        """Stream resume processing as SSE event dicts."""
        config = {"configurable": {"thread_id": thread_id}}

        last_output = None
        for event in self.graph.stream(
            Command(resume={"response": human_response}),
            config=config,
            stream_mode="values",
        ):
            node = self._identify_node(event)
            logger.debug(f"Stream event from node: {node}")
            yield {"event": "status", "data": {"node": node}}
            last_output = event

        if last_output:
            yield {"event": "answer", "data": self._extract_result(last_output)}


# Singleton instance (lazy initialization)
_agent_instance: Optional[GuitarTutorAgent] = None


def get_agent() -> GuitarTutorAgent:
    """Get or create the singleton agent instance."""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = GuitarTutorAgent()
    return _agent_instance
