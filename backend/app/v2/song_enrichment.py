"""Bounded SongStudy enrichment from preserved tab and ChordPro sources."""

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Callable, Literal, Optional

from langchain.agents import create_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.v2.models import SongDerivedRange, SongEnrichment, SongSourceSection
from app.v2.tutor.providers import TutorCapabilityError, build_tutor_model, structured_response_format

ModelFactory = Callable[..., BaseChatModel]


class SongDerivedRangeProposal(BaseModel):
    start_measure: int = Field(ge=1)
    end_measure: int = Field(ge=1)
    section: Optional[str] = None
    lyrics: list[str] = Field(default_factory=list)
    broad_harmony: list[str] = Field(default_factory=list)
    detailed_harmony: list[str] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"]
    kind: Literal["section", "phrase", "transition"] = "phrase"
    repeat_group: Optional[str] = Field(default=None, max_length=80)
    annotation: Optional[str] = Field(default=None, max_length=500)


class SongEnrichmentProposal(BaseModel):
    ranges: list[SongDerivedRangeProposal] = Field(default_factory=list, max_length=128)


ENRICHMENT_INSTRUCTIONS = (
    "Align the supplied compact ChordPro and detailed-tab summaries into useful learning ranges. "
    "When ChordPro is supplied, return approximate lyric-to-measure alignment and broad ChordPro harmony; always "
    "derive useful sections or phrases from the detailed tab summary. Include detailed guitar chord/embellishment "
    "labels when present. Preserve broad and detailed harmony separately; never choose one "
    "as the winner. Confidence must be low, medium, or high and should reflect alignment uncertainty. Use only "
    "measure numbers inside the supplied track. Mark range kind as section, phrase, or transition. "
    "Use the same repeat_group for related repeated passages, one range per occurrence. "
    "Optionally add a short learning annotation about a useful chunk or transition. "
    "These are suggestions, not mandatory navigation. Do not invent repeats when evidence is sparse."
)


def _fingerprint(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def _source_sections(measures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    markers = [
        (index, str(marker["text"]))
        for index, measure in enumerate(measures)
        if isinstance((marker := measure.get("marker")), dict) and marker.get("text")
    ]
    return [
        {
            "label": label,
            "start_measure": index + 1,
            "end_measure": (markers[position + 1][0] if position + 1 < len(markers) else len(measures)),
            "source": "tab",
        }
        for position, (index, label) in enumerate(markers)
    ]


def _measure_summary(measure: dict[str, Any], number: int) -> dict[str, Any]:
    beats = [
        beat
        for voice in measure.get("voices") or []
        for beat in voice.get("beats") or []
        if isinstance(beat, dict)
    ]
    chords = list(dict.fromkeys(
        str(chord["text"])
        for beat in beats
        if isinstance((chord := beat.get("chord")), dict) and chord.get("text")
    ))
    positions = list(dict.fromkeys(
        f"{note['string']}:{note['fret']}"
        for beat in beats
        for note in beat.get("notes") or []
        if isinstance(note, dict)
        and isinstance(note.get("string"), int)
        and isinstance(note.get("fret"), int)
        and not note.get("rest")
        and not note.get("dead")
    ))
    summary: dict[str, Any] = {"measure": number, "chords": chords, "positions": positions,
                               "pattern": _fingerprint({"voices": measure.get("voices"), "header": measure.get("header")})[:16]}
    marker = measure.get("marker")
    if isinstance(marker, dict) and marker.get("text"):
        summary["marker"] = str(marker["text"])
    return summary


def _chordpro_summary(chordpro: str) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for raw_line in chordpro.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        section = re.fullmatch(r"\{(?:section|s):\s*(.+)\}", stripped, re.IGNORECASE)
        if section:
            lines.append({"section": section.group(1)})
            continue
        chords = re.findall(r"\[([^\]]+)\]", raw_line)
        lyrics = re.sub(r"\[[^\]]+\]", "", raw_line).strip()
        if chords or lyrics:
            lines.append({"chords": chords, "lyrics": lyrics})
    return lines


def build_enrichment_context(tab_data: dict[str, Any], chordpro: Optional[str]) -> dict[str, Any]:
    measures = [measure for measure in (tab_data.get("measures") or []) if isinstance(measure, dict)]
    return {
        "measure_count": len(measures),
        "tab_fingerprint": _fingerprint(tab_data),
        "chordpro_fingerprint": _fingerprint(chordpro) if chordpro else None,
        "source_sections": _source_sections(measures),
        "measures": [_measure_summary(measure, index + 1) for index, measure in enumerate(measures)],
        "chordpro_lines": _chordpro_summary(chordpro) if chordpro else [],
    }


def run_song_enrichment(
    *,
    artifact_id: str,
    tab_data: dict[str, Any],
    chordpro: Optional[str],
    provider: str,
    model: str,
    openai_api_key: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
    openrouter_api_key: Optional[str] = None,
    model_factory: ModelFactory = build_tutor_model,
) -> SongEnrichment:
    context = build_enrichment_context(tab_data, chordpro)
    chat_model = model_factory(
        provider,
        model,
        f"song-enrichment:{artifact_id}",
        openai_api_key=openai_api_key,
        anthropic_api_key=anthropic_api_key,
        openrouter_api_key=openrouter_api_key,
    )
    agent = create_agent(
        model=chat_model,
        tools=[],
        response_format=structured_response_format(SongEnrichmentProposal, provider, model),
    )
    try:
        state = agent.invoke(
            {
                "messages": [
                    SystemMessage(content=ENRICHMENT_INSTRUCTIONS),
                    HumanMessage(content=json.dumps(context, sort_keys=True, separators=(",", ":"))),
                ]
            }
        )
    except NotImplementedError as exc:
        raise TutorCapabilityError(
            f"{provider}/{model} cannot satisfy required enrichment capabilities (structured tool calling): {exc}"
        ) from exc

    proposal: SongEnrichmentProposal = state["structured_response"]
    measure_count = context["measure_count"]
    ranges = [SongDerivedRange(**item.model_dump(), provenance="ai") for item in proposal.ranges]
    if any(item.end_measure > measure_count for item in ranges):
        raise ValueError(f"AI enrichment returned a range outside the {measure_count}-measure track")

    return SongEnrichment(
        tab_fingerprint=context["tab_fingerprint"],
        chordpro_fingerprint=context["chordpro_fingerprint"],
        source_sections=[SongSourceSection(**item) for item in context["source_sections"]],
        ranges=ranges,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
