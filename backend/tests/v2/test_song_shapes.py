from app.v2.song_shapes import project_song_shapes


DROP_D = [64, 59, 55, 50, 45, 38]


def beat(*positions, label=None):
    value = {"notes": [{"string": string, "fret": fret} for string, fret in positions]}
    if label:
        value["chord"] = {"text": label}
    return value


def test_projects_every_chord_like_shape_in_order_with_exact_source_data():
    tab_data = {
        "measures": [
            {
                "voices": [
                    {
                        "beats": [
                            beat((0, 0), (1, 1), (2, 0), (3, 2), (4, 3), label="C"),
                            beat((0, 3), (1, 3), (2, 4)),
                            beat((1, 5), (2, 4)),
                            beat((5, 3)),
                        ]
                    }
                ]
            },
            {
                "voices": [
                    {
                        "beats": [
                            beat((0, 5), (1, 5), (2, 5), (3, 7)),
                            beat((0, 5), (1, 5), (2, 5), (3, 7)),
                            beat((0, 8), (2, 7), (4, 9)),
                            beat((1, 5), (2, 4)),
                        ]
                    }
                ]
            },
        ]
    }

    events = project_song_shapes(tab_data, DROP_D, 0, 1)

    assert [event.label for event in events] == ["C", None, None, None, None, None]
    assert [position.model_dump() for position in events[0].positions] == [
        {"string": 1, "fret": 0},
        {"string": 2, "fret": 1},
        {"string": 3, "fret": 0},
        {"string": 4, "fret": 2},
        {"string": 5, "fret": 3},
    ]
    assert [position.model_dump() for position in events[2].positions] == [
        {"string": 2, "fret": 5},
        {"string": 3, "fret": 4},
    ]
    assert [source.model_dump() for source in events[3].sources] == [
        {"measure_index": 1, "beat_index": 0},
        {"measure_index": 1, "beat_index": 1},
    ]
    assert [position.model_dump() for position in events[4].positions] == [
        {"string": 1, "fret": 8},
        {"string": 3, "fret": 7},
        {"string": 5, "fret": 9},
    ]
    assert events[5].positions == events[2].positions
    assert all(event.tuning == DROP_D for event in events)


def test_range_projection_uses_the_displayed_voice_and_excludes_single_notes():
    tab_data = {
        "measures": [
            {"voices": [{"beats": [beat((0, 1), (1, 2))]}]},
            {
                "voices": [
                    {"beats": [beat((0, 9)), beat((0, 10))]},
                    {"beats": [beat((1, 3), (2, 4)), beat((1, 5), (2, 6))]},
                ]
            },
            {"voices": [{"beats": [beat((0, 12), (1, 12))]}]},
        ]
    }

    events = project_song_shapes(tab_data, DROP_D, 1, 1)

    assert [[source.model_dump() for source in event.sources] for event in events] == [
        [{"measure_index": 1, "beat_index": 0}],
        [{"measure_index": 1, "beat_index": 1}],
    ]


def test_missing_tuning_returns_no_shapes_instead_of_inventing_it():
    tab_data = {"measures": [{"voices": [{"beats": [beat((0, 1), (1, 2))]}]}]}

    assert project_song_shapes(tab_data, None, 0, 0) == []


def test_same_shape_after_a_lead_beat_remains_a_later_recurrence():
    shape = ((0, 3), (1, 3))
    tab_data = {
        "measures": [
            {"voices": [{"beats": [beat(*shape), beat((0, 5)), beat(*shape)]}]},
        ]
    }

    events = project_song_shapes(tab_data, DROP_D)

    assert len(events) == 2
    assert [source.beat_index for event in events for source in event.sources] == [0, 2]
