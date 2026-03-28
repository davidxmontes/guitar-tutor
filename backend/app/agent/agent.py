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


class AnswerMetadataSchema(TypedDict):
    """Schema for answer metadata extraction (scale, chords, visualizations)."""
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

1) Clear music/guitar question — STRONGLY PREFERRED. Use your best judgment to fill in any gaps.
{{"question_for_llm": "<≤ 20 words, concise guitar/music-theory question>", "out_of_scope": false}}

2) Need clarification — LAST RESORT ONLY. Use this ONLY when you truly cannot proceed (e.g., the question is so vague that any assumption would be misleading).
{{"clarifying_question": "<one short clarifying question>", "out_of_scope": false}}

3) Out of scope
{{"out_of_scope": true}}

Best judgment guidelines:
- PREFER producing a question_for_llm over asking for clarification. Make reasonable assumptions and move forward.
- If the user omits a key (e.g., "what scale should I use for blues?"), pick the most common one (e.g., A or E for blues) and note your assumption in the question, like: "What scale to use for blues in A? (assumed A — adjust if needed)"
- If the user omits details like tuning, assume standard tuning. If they omit a genre, infer from context.
- Only use clarifying_question when the request is genuinely too vague to make ANY reasonable assumption.
- If the user's request is not music, guitar or music theory related, return the out_of_scope JSON above.
- If you provide a clarifying_question, do not provide a question_for_llm as well.
- IMPORTANT: If you produce a clarifying question, it MUST be returned in the `clarifying_question` field and `question_for_llm` MUST be empty or null.
- Prefer concise canonical names for chords/scales (e.g., "C major", "A minor pentatonic").
- Do NOT include voicings, diagrams, notes, or additional metadata.
"""

ANSWER_TEXT_INSTRUCTIONS = """You are the Guitar Tutor. Answer the user's guitar/music theory question.

Hard constraints:
- ONLY answer music theory or guitar-related questions.
- Mention relevant chords and scales by name (e.g., "C major", "A minor pentatonic").
- Keep output concise: 1-3 paragraphs.

Tone & pedagogy:
- Be friendly, clear, and pedagogical. Explain WHY choices work.
- Use short examples where helpful.
- If the question contains an assumption note (e.g., "assumed A — adjust if needed"), briefly mention it at the end of your answer in a natural way, like: "I went with A here — feel free to ask about a different key!" Keep it short and conversational, not a disclaimer.

Question: {user_question}
"""

ANSWER_METADATA_INSTRUCTIONS = """Given this guitar/music question and answer, extract structured metadata. Return ONLY the requested fields.

Question: {user_question}
Answer: {answer}

Extract:
- scale: the single most relevant scale name (e.g., "A minor pentatonic")
- chord_choices: list of chord names mentioned or recommended (e.g., ["C", "Am", "F", "G"])
- visualizations: true if the answer involves chords, scales, or progressions that can be shown on a fretboard
"""

# Node names for status tracking
_NODE_FIELDS = {
    "question_for_llm": "prepare_question",
    "answer": "generate_answer",
    "clarifying_question": "prepare_question",
}


class GuitarTutorAgent:
    """Guitar Tutor Agent using LangGraph."""

    def __init__(self, model_name: str = "gpt-4o-mini", temperature: float = 0,
                 base_url: str | None = None, api_key: str | None = None):
        self.memory = MemorySaver()
        self.model_name = model_name

        resolved_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not resolved_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")

        llm_kwargs: dict = {"model": model_name, "temperature": temperature, "api_key": resolved_key}
        if base_url:
            llm_kwargs["base_url"] = base_url

        self.llm = ChatOpenAI(**llm_kwargs)
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

        q = self._invoke_structured(PreppedQuestionSchema, [system_message],
                                    fallback={"question_for_llm": last_question_text, "out_of_scope": False})

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

        messages = state.get("messages", [])
        question_text = question_for_llm if question_for_llm else (
            messages[-1].content if messages else ""
        )

        # Call 1: Generate answer text (regular LLM — streamed via stream_mode="messages")
        text_system = SystemMessage(
            content=ANSWER_TEXT_INSTRUCTIONS.format(user_question=question_text)
        )
        response = self.llm.invoke([text_system, HumanMessage(content=question_text)])
        answer_text = response.content

        # Call 2: Extract metadata (structured output — quick, not streamed)
        metadata_system = SystemMessage(
            content=ANSWER_METADATA_INSTRUCTIONS.format(
                user_question=question_text, answer=answer_text
            )
        )
        meta = self._invoke_structured(AnswerMetadataSchema, [metadata_system],
                                       fallback={"scale": None, "chord_choices": [], "visualizations": False})

        return {
            "messages": [AIMessage(content=answer_text)],
            "answer": answer_text,
            "scale": meta.get("scale"),
            "chord_choices": meta.get("chord_choices", []),
            "visualizations": meta.get("visualizations", False),
            "out_of_scope": False,
        }

    # --- Shared helpers ---

    def _invoke_structured(self, schema, messages: list, *, fallback: dict) -> dict:
        """Invoke structured output with error handling and fallback."""
        try:
            structured_llm = self.llm.with_structured_output(schema)
            result = structured_llm.invoke(messages)
            if result is None:
                logger.warning("Structured output returned None, using fallback")
                return fallback
            return result if isinstance(result, dict) else (
                result.model_dump() if hasattr(result, "model_dump") else result.dict()
            )
        except Exception as e:
            logger.error(f"Structured output failed ({schema.__name__}): {e}")
            return fallback

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

    def _iter_stream(self, graph_input, config) -> Generator[dict, None, None]:
        """Shared streaming logic: yields status, token, interrupt, and answer events."""
        last_output = None
        in_answer_node = False
        answer_tokens_started = False

        for mode, event in self.graph.stream(
            graph_input, config=config, stream_mode=["messages", "values"]
        ):
            if mode == "messages":
                chunk, metadata = event
                node = metadata.get("langgraph_node", "")
                has_content = chunk.content and not getattr(chunk, "tool_call_chunks", None)
                # Only yield tokens from the generate_answer node, and only after
                # we've confirmed via the values stream that we're in that node.
                # Skip JSON-like chunks from the structured metadata call.
                if node == "generate_answer" and in_answer_node and has_content:
                    text = chunk.content
                    if not answer_tokens_started:
                        stripped = text.strip()
                        if stripped.startswith("{") or stripped.startswith("["):
                            continue
                        answer_tokens_started = True
                    yield {"event": "token", "data": {"text": text}}
            elif mode == "values":
                node = self._identify_node(event)
                if node == "generate_answer":
                    in_answer_node = True
                logger.debug(f"Stream event from node: {node}")
                yield {"event": "status", "data": {"node": node}}
                last_output = event

        interrupt_data = self._check_for_interrupt(config)
        if interrupt_data:
            yield {"event": "interrupt", "data": interrupt_data}
            return

        if last_output:
            yield {"event": "answer", "data": self._extract_result(last_output)}

    def stream_chat(
        self,
        message: str,
        conversation_history: List[dict] = None,
        thread_id: Optional[str] = "1",
    ) -> Generator[dict, None, None]:
        """Stream chat processing as SSE event dicts."""
        config = {"configurable": {"thread_id": thread_id}}
        messages = self._build_messages(conversation_history or [], message)
        yield from self._iter_stream({"messages": messages}, config)

    def stream_resume(
        self,
        human_response: str,
        thread_id: Optional[str] = "1",
    ) -> Generator[dict, None, None]:
        """Stream resume processing as SSE event dicts."""
        config = {"configurable": {"thread_id": thread_id}}
        yield from self._iter_stream(
            Command(resume={"response": human_response}), config
        )


# Singleton instance (lazy initialization)
_agent_instance: Optional[GuitarTutorAgent] = None


def get_agent() -> GuitarTutorAgent:
    """Get or create the singleton agent instance."""
    from app.config import get_settings

    global _agent_instance
    if _agent_instance is None:
        settings = get_settings()
        logger.info(
            f"Initializing agent: provider={settings.llm_provider}, "
            f"model={settings.llm_model_name}, base_url={settings.llm_base_url}"
        )
        _agent_instance = GuitarTutorAgent(
            model_name=settings.llm_model_name,
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
        )
    return _agent_instance
