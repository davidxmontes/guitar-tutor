"""Deterministic external song/model providers; real routes and store remain in use."""
from app.models.songsterr import SongsterrRecord, SongsterrRevisionResponse
from tests.v2.tutor_fakes import ScriptedTutorModel

SONG = {"songId": 113, "artistId": 1, "artist": "Practice Band", "title": "Study Fixture",
        "tracks": [{"instrumentId": 1, "instrument": "Guitar", "name": "Drop D guitar", "tuning": [64, 59, 55, 50, 45, 38]}]}


async def search_songs(query):
    if query == 'provider error':
        raise ValueError('Song provider unavailable')
    return [SongsterrRecord.model_validate(SONG)] if 'fixture' in query.lower() else []


async def get_song_revision(song_id):
    return SongsterrRevisionResponse.model_validate({**SONG, 'revisionId': 1, 'image': 'fixture'})


async def get_tab_data(*args):
    return {'tuning': [64, 59, 55, 50, 45, 38], 'measures': [
        {'marker': {'text': 'Intro' if i == 0 else 'Verse'} if i in (0, 4) else None,
         'voices': [{'beats': [
             {'duration': [1, 4], 'notes': [{'string': 5, 'fret': i}, {'string': 4, 'fret': i + 2}]},
             {'duration': [1, 8], 'rest': True, 'notes': []}]}]}
        for i in range(8)]}


async def get_chordpro(song_id):
    return '{section: Intro}\n[D]Practice pattern'


def enrichment_factory(*args, **kwargs):
    return ScriptedTutorModel(outcomes=[{'ranges': [{'start_measure': 1, 'end_measure': 2,
        'section': 'Opening phrase', 'lyrics': [], 'broad_harmony': ['D'], 'detailed_harmony': [],
        'confidence': 'medium', 'kind': 'phrase', 'annotation': 'Practice the change slowly.'}]}])
