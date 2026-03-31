import unittest
from unittest.mock import patch

from app.agent.agent import GuitarTutorAgent
from app.models.songsterr import SongsterrRecord


def _make_agent() -> GuitarTutorAgent:
    agent = object.__new__(GuitarTutorAgent)
    agent.tool_calling_enabled = True
    agent.recent_turn_window = 10
    return agent


def _song_record(*, song_id: int, artist: str, title: str) -> SongsterrRecord:
    return SongsterrRecord.model_validate(
        {
            "songId": song_id,
            "artistId": 1,
            "artist": artist,
            "title": title,
            "hasChords": True,
            "hasPlayer": True,
            "tracks": [],
            "defaultTrack": 0,
            "popularTrack": 0,
        }
    )


class GuitarTutorAgentSongToolTests(unittest.TestCase):
    def test_plan_song_intent_sanitizes_model_output(self) -> None:
        agent = _make_agent()
        agent._project_ui_context_for_prompt = lambda ui_context: ui_context
        agent._format_messages_for_prompt = lambda messages: "None"
        agent._invoke_structured = lambda schema, messages, fallback: {
            "song_search_query": " wonderwall oasis ",
            "focus_measure_number": "12",
        }

        plan = agent._plan_song_intent(
            user_question="Show me how to play Wonderwall",
            messages=[],
            ui_context={},
            running_summary="",
        )

        self.assertEqual(
            plan,
            {
                "song_search_query": "wonderwall oasis",
                "focus_measure_number": 12,
            },
        )

    @patch("app.agent.song_tools.songsterr.search_songs_sync")
    def test_execute_song_actions_does_not_fallback_to_regex_without_llm_plan(self, search_songs_sync) -> None:
        agent = _make_agent()

        tool_context, actions = agent._execute_song_actions(
            "show me how to play wonderwall",
            {},
            song_search_query=None,
            focus_measure_number=None,
        )

        search_songs_sync.assert_not_called()
        self.assertEqual(tool_context, "")
        self.assertEqual(actions, [])

    @patch("app.agent.song_tools.songsterr.resolve_measure_focus_sync", return_value=(4, 1))
    @patch("app.agent.song_tools.songsterr.search_songs_sync")
    def test_execute_song_actions_executes_llm_selected_song_actions(self, search_songs_sync, resolve_measure_focus_sync) -> None:
        agent = _make_agent()
        search_songs_sync.return_value = [_song_record(song_id=7, artist="Oasis", title="Wonderwall")]

        tool_context, actions = agent._execute_song_actions(
            "show me how to play wonderwall",
            {},
            song_search_query="wonderwall oasis",
            focus_measure_number=5,
        )

        search_songs_sync.assert_called_once_with("wonderwall oasis")
        resolve_measure_focus_sync.assert_called_once_with(
            song_id=7,
            track_index=0,
            requested_measure_index=4,
        )
        self.assertEqual(
            actions,
            [
                {"type": "song.search", "query": "wonderwall oasis"},
                {"type": "song.select", "song_id": 7},
                {"type": "song.track.select", "track_index": 0},
                {"type": "song.measure.focus", "measure_index": 4, "beat_index": 1},
            ],
        )
        self.assertIn("Oasis - Wonderwall", tool_context)


if __name__ == "__main__":
    unittest.main()
