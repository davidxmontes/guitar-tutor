from pydantic import TypeAdapter

from app.models.agent import (
    AgentAction,
    ProgressionSetAction,
    ProgressionSlotSchema,
)


def test_progression_slot_without_positions():
    slot = ProgressionSlotSchema(root="A", quality="minor")
    assert slot.root == "A"
    assert slot.quality == "minor"
    assert slot.positions is None


def test_progression_slot_with_positions():
    slot = ProgressionSlotSchema(
        root="E",
        quality="major",
        positions=[{"string": 1, "fret": 0}, {"string": 2, "fret": 0}],
    )
    assert len(slot.positions) == 2
    assert slot.positions[0].string == 1
    assert slot.positions[0].fret == 0


def test_progression_set_action_serializes():
    action = ProgressionSetAction(
        type="progression.set",
        chords=[ProgressionSlotSchema(root="C", quality="major")],
        key_root="C",
        key_mode="major",
    )
    data = action.model_dump()
    assert data["type"] == "progression.set"
    assert data["key_root"] == "C"
    assert data["key_mode"] == "major"
    assert len(data["chords"]) == 1
    assert data["chords"][0]["root"] == "C"


def test_progression_set_action_optional_key_fields():
    action = ProgressionSetAction(
        type="progression.set",
        chords=[ProgressionSlotSchema(root="G", quality="dominant7")],
    )
    assert action.key_root is None
    assert action.key_mode is None


def test_progression_set_action_is_valid_agent_action():
    raw = {
        "type": "progression.set",
        "chords": [{"root": "C", "quality": "major"}, {"root": "G", "quality": "dominant7"}],
        "key_root": "C",
        "key_mode": "major",
    }
    adapter = TypeAdapter(AgentAction)
    action = adapter.validate_python(raw)
    assert action.type == "progression.set"
    assert len(action.chords) == 2
