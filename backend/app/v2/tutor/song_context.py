"""Owned, bounded SongStudy selections for explanation-only Tutor turns."""
import json
from math import isfinite
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.v2.models import Artifact, SongStudyPayload
from app.v2.song_shapes import _displayed_beats
from app.v2.workspace import StrictModel


class SongBeatSelection(StrictModel):
    type: Literal['beat']
    measureIndex: int = Field(ge=0, strict=True)
    beatIndex: int = Field(ge=0, strict=True)


class SongRangeSelection(StrictModel):
    type: Literal['range']
    startMeasureIndex: int = Field(ge=0, strict=True)
    endMeasureIndex: int = Field(ge=0, strict=True)

    @model_validator(mode='after')
    def ordered(self):
        if self.endMeasureIndex < self.startMeasureIndex:
            raise ValueError('Choose an ordered measure range')
        return self


class SongTutorContext(StrictModel):
    artifact_id: str = Field(min_length=1, max_length=128)
    selection: Annotated[SongBeatSelection | SongRangeSelection, Field(discriminator='type')]


class SongTutorTerminal(StrictModel):
    message: str


def resolve_song_context(artifact: Artifact, selection: SongBeatSelection | SongRangeSelection) -> dict:
    payload = SongStudyPayload.model_validate(artifact.payload)
    measures = payload.tab_data.get('measures') or []
    is_beat = isinstance(selection, SongBeatSelection)
    start = selection.measureIndex if is_beat else selection.startMeasureIndex
    end = start if is_beat else selection.endMeasureIndex
    if end >= len(measures):
        raise ValueError('The selected measure is outside this song')
    selected, positions = [], set()
    signature = None
    try:
        for measure in measures[:start]:
            signature = measure.get("signature") or (measure.get("header") or {}).get("timeSignature") or signature
        for index in range(start, end + 1):
            measure = measures[index]
            signature = measure.get("signature") or (measure.get("header") or {}).get("timeSignature") or signature
            beats = _displayed_beats(measure)
            if is_beat and selection.beatIndex >= len(beats):
                raise ValueError('The selected beat is outside this measure')
            indices = [selection.beatIndex] if is_beat else range(len(beats))
            chosen = [{'beat_index': beat, 'raw': beats[beat]} for beat in indices]
            positions.update((index, beat) for beat in indices)
            selected.append({'measure_index': index, 'header': measure.get('header'),
                             'signature': signature, 'marker': measure.get('marker'), 'beats': chosen})
    except (TypeError, AttributeError) as exc:
        raise ValueError('This selection has incomplete score data; choose another passage') from exc
    automations = payload.tab_data.get('automations') or {}
    if not isinstance(automations, dict):
        raise ValueError('This selection has invalid tempo data')
    tempo = automations.get('tempo') or []
    if not isinstance(tempo, list) or any(
        not isinstance(change, dict) or type(change.get('measure')) is not int or change['measure'] < 0
        or type(change.get('position')) not in (int, float) or not isfinite(change['position'])
        for change in tempo
    ):
        raise ValueError('This selection has invalid tempo data')
    preceding = [change for change in tempo if change['measure'] < start]
    tempo = ([max(preceding, key=lambda change: (change['measure'], change['position']))] if preceding else []) + [
        change for change in tempo if start <= change['measure'] <= end]
    shapes = []
    for event in payload.shape_events:
        sources = [source.model_dump() for source in event.sources if (source.measure_index, source.beat_index) in positions]
        if sources:
            shapes.append(event.model_dump() | {'sources': sources})
    context = {
        'artifact_id': artifact.id, 'artifact_revision': artifact.updated_at, 'song_id': payload.song_id,
        'title': payload.title, 'artist': payload.artist, 'track': payload.track.model_dump(),
        'selection': selection.model_dump(), 'tuning': payload.track.tuning if payload.track.tuning is not None else payload.tab_data.get('tuning'),
        'capo': payload.tab_data.get('capo'), 'measures': selected, 'shapes': shapes,
        'tempo': tempo,
        'notation': 'Measure and beat indices and raw note strings are zero-based. Raw strings run highest to lowest; tuning is MIDI. Shape strings are one-based. Durations are fractions of a whole note. Raw technique fields are preserved; do not invent missing data or assume capo has already been applied.',
    }
    if len(json.dumps(context, ensure_ascii=False).encode('utf-8')) > 24000:
        raise ValueError('This selection exceeds the 24 KB Tutor context limit; select fewer beats or measures')
    return context
