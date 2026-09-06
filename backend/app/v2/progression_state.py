"""Progression ideas: stable steps, idea-level tuning, explicit tonal context."""
from typing import Annotated, Literal
from uuid import uuid4
from pydantic import Field, model_validator
from app.v2.workspace import StrictModel, Identifier, NoteGroup
from app.v2.harmony_state import ChordRef, TonalCenter, Tuning, VoicingValue, Provenance, STANDARD_TUNING


class ProgressionStep(ChordRef):
    id: Identifier = Field(default_factory=lambda: uuid4().hex)
    voicing: VoicingValue | None = None
    duration_beats: int = Field(default=4, ge=1, le=64, strict=True)


class ProgressionArtifactPayload(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    tonal_center: TonalCenter | None = None
    tuning: Tuning = Field(default_factory=lambda: STANDARD_TUNING.copy())
    chords: list[ProgressionStep] = Field(default_factory=list)
    provenance: Provenance | None = None

    @model_validator(mode='after')
    def valid_steps(self):
        if len({step.id for step in self.chords}) != len(self.chords):
            raise ValueError('Duplicate step ID')
        if any(step.voicing and step.voicing.tuning != self.tuning for step in self.chords):
            raise ValueError('Assigned voicing must use the idea tuning')
        return self


class ProgressionIdeaDraft(StrictModel):
    id: Identifier = Field(default_factory=lambda: uuid4().hex)
    label: str = Field(min_length=1, max_length=200)
    tonal_center: TonalCenter | None = None
    tuning: Tuning = Field(default_factory=lambda: STANDARD_TUNING.copy())
    chords: list[ProgressionStep] = Field(default_factory=list)
    kept_note_groups: list[NoteGroup] = Field(default_factory=list)
    artifact_id: str | None = None
    base_revision_id: str | None = None
    dirty: bool = True
    provenance: Provenance | None = None

    @model_validator(mode='after')
    def valid_idea(self):
        artifact_payload(self)
        if bool(self.artifact_id) != bool(self.base_revision_id):
            raise ValueError('Artifact and base revision must be paired')
        if len({group.id for group in self.kept_note_groups}) != len(self.kept_note_groups):
            raise ValueError('Duplicate note group ID')
        return self


def artifact_payload(idea: ProgressionIdeaDraft) -> ProgressionArtifactPayload:
    return ProgressionArtifactPayload(title=idea.label, tonal_center=idea.tonal_center,
        tuning=idea.tuning, chords=idea.chords, provenance=idea.provenance)


class StepFocus(StrictModel):
    kind: Literal['step']
    step_id: Identifier


class TransitionFocus(StrictModel):
    kind: Literal['transition']
    from_step_id: Identifier
    to_step_id: Identifier


ProgressionFocus = Annotated[StepFocus | TransitionFocus, Field(discriminator='kind')]


class ProgressionWorkspaceState(StrictModel):
    ideas: list[ProgressionIdeaDraft] = Field(default_factory=list)
    active_idea_id: str | None = None
    focus: ProgressionFocus | None = None

    @model_validator(mode='after')
    def valid_workspace(self):
        if len({idea.id for idea in self.ideas}) != len(self.ideas):
            raise ValueError('Duplicate idea ID')
        active = next((idea for idea in self.ideas if idea.id == self.active_idea_id), None)
        if (self.ideas and active is None) or (not self.ideas and self.active_idea_id is not None):
            raise ValueError('Active idea must exist')
        if self.focus and not valid_focus(self.focus.model_dump(), active):
            raise ValueError('Focus referent must exist and transitions must be adjacent')
        return self


def valid_focus(focus, idea) -> bool:
    ids = [step.id if hasattr(step, 'id') else step['id'] for step in (idea.chords if hasattr(idea, 'chords') else idea.get('chords', []))] if idea else []
    if focus['kind'] == 'step':
        return focus['step_id'] in ids
    return any(a == focus['from_step_id'] and b == focus['to_step_id'] for a, b in zip(ids, ids[1:]))


def reconcile_focus(data: dict, previous_active: str | None) -> ProgressionWorkspaceState:
    data = dict(data)
    active = next((idea for idea in data['ideas'] if idea['id'] == data['active_idea_id']), None)
    if data['active_idea_id'] != previous_active or (data.get('focus') and not valid_focus(data['focus'], active)):
        data['focus'] = None
    return ProgressionWorkspaceState.model_validate(data)
