"""Manually confirmed recording passages, bounded by preserved score rhythm."""
from fractions import Fraction
from math import isfinite
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.v2.workspace import StrictModel


class SongVideoAnchor(StrictModel):
    measure_index: int = Field(ge=0, strict=True)
    beat_index: int = Field(ge=0, strict=True)
    edge: Literal["start", "end"]
    video_seconds: float = Field(ge=0, le=86400, allow_inf_nan=False, strict=True)


class SongVideoPassage(StrictModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    label: str = Field(min_length=1, max_length=120)
    anchors: list[SongVideoAnchor] = Field(default_factory=list, max_length=256)

    @field_validator("label")
    @classmethod
    def meaningful_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Give the passage a label")
        return value

    @model_validator(mode="after")
    def increasing_video_time(self):
        if any(a.video_seconds >= b.video_seconds for a, b in zip(self.anchors, self.anchors[1:])):
            raise ValueError("Video timestamps must increase within a passage")
        return self


class SongVideoAlignment(StrictModel):
    video_id: str = Field(min_length=11, max_length=11, pattern=r"^[A-Za-z0-9_-]{11}$")
    recording_confirmed: bool = Field(strict=True)
    timing_source: Literal["songsterr", "estimated"] | None = Field(default=None, exclude_if=lambda value: value is None)
    passages: list[SongVideoPassage] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def confirmed_nonoverlapping_occurrences(self):
        if not self.recording_confirmed and not self.timing_source:
            raise ValueError("Confirm this recording and arrangement before saving")
        if len({passage.id for passage in self.passages}) != len(self.passages):
            raise ValueError("Passage IDs must be unique")
        intervals = sorted((p.anchors[0].video_seconds, p.anchors[-1].video_seconds)
                           for p in self.passages if p.anchors)
        for (previous_start, previous_end), (start, end) in zip(intervals, intervals[1:]):
            # Touching spans are allowed; the following passage owns the boundary.
            if start < previous_end or previous_start == previous_end == start == end:
                raise ValueError("Passages must not overlap in video time")
        return self


def _beat_duration(beat: dict[str, Any]) -> Fraction | None:
    duration = beat.get("duration")
    if not isinstance(duration, (list, tuple)) or len(duration) != 2:
        return None
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in duration):
        return None
    numerator, denominator = duration
    try:
        if numerator <= 0 or denominator <= 0:
            return None
        quarter_notes = 4 * numerator / denominator
        if not isfinite(quarter_notes) or quarter_notes <= 0:
            return None
        return 4 * Fraction(str(numerator)) / Fraction(str(denominator))
    except (OverflowError, ValueError, ZeroDivisionError):
        return None


def validate_video_alignment(alignment: SongVideoAlignment, tab_data: dict[str, Any]) -> None:
    # Local import avoids a cycle through the shared shape models.
    from app.v2.song_shapes import _displayed_beats

    boundaries: dict[tuple[int, int, str], tuple[int, Fraction]] = {}
    segment, position = 0, Fraction(0)
    for measure_index, measure in enumerate(tab_data.get("measures") or []):
        beats = _displayed_beats(measure) if isinstance(measure, dict) else []
        if not beats:
            segment, position = segment + 1, Fraction(0)
        for beat_index, beat in enumerate(beats):
            boundaries[measure_index, beat_index, "start"] = segment, position
            duration = _beat_duration(beat)
            if duration is None:
                # Both edges can be marked exactly, but no span crosses this gap.
                segment, position = segment + 1, Fraction(0)
            else:
                position += duration
            boundaries[measure_index, beat_index, "end"] = segment, position

    for passage in alignment.passages:
        previous = None
        for anchor in passage.anchors:
            boundary = boundaries.get((anchor.measure_index, anchor.beat_index, anchor.edge))
            if boundary is None:
                raise ValueError("Anchor is outside the displayed track")
            if previous is not None:
                if previous[0] != boundary[0]:
                    raise ValueError("Missing rhythm splits this passage; use separate passages around the gap")
                if previous[1] >= boundary[1]:
                    raise ValueError("Score positions must increase within a passage")
            previous = boundary
