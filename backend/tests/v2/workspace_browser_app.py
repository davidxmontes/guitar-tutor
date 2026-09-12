"""Real app/stores with only the external Tutor model boundary scripted."""
import json
import time
from app.config import get_settings
from app.main import app
from app.v2.harmony import chord_voicings
from app.v2.harmony_state import ChordRef
from app.v2.router import get_tutor_model_factory
from tests.v2.tutor_fakes import ScriptedTutorModel


class WorkspaceModel(ScriptedTutorModel):
    def _generate(self, messages, **kwargs):
        if any('Offer a voicing candidate' in str(message.content) for message in messages if message.type == 'human'):
            self.outcomes = [{'message': 'Try this voicing.', 'candidates': {'candidate_kind': 'voicing', 'candidates': [
                {'id': 'v1', 'label': 'C major option', 'chord': {'root': 'C', 'quality': 'major'}, 'voicing': {'positions': [{'string': p['string'], 'fret': p['fret']} for p in chord_voicings(ChordRef(root='C', quality='major'), [64, 59, 55, 50, 45, 40])[0]['positions']], 'tuning': [64, 59, 55, 50, 45, 40]}}]},
                'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
                    'hero': [{'kind': 'candidate-set'}], 'support': [{'kind': 'chord-inspector'}]}}}]
        question = str(messages[-1].content)
        if 'Take your time answering' in question:
            time.sleep(4)
        if 'Simulate a failed tutor' in question:
            raise RuntimeError('Scripted provider failure')
        if 'Compose linked mode exploration' in question:
            self.outcomes = [{'message': 'Dorian has a natural sixth. Select it, then try another root.', 'focus': {'kind': 'degree', 'degree': 6}, 'presentation': {
                'pattern': 'stack', 'focal': 'items', 'slots': {'items': [
                    {'pattern': 'split', 'focal': 'items', 'slots': {'items': [
                        {'kind': 'circle-of-fifths', 'size': 'small'}, {'pattern': 'stack', 'focal': 'items', 'slots': {'items': [
                            {'kind': 'explanation', 'config': {'text': 'Listen for the natural sixth.'}}, {'kind': 'scale-staff'}, {'kind': 'fretboard'}]}}]}}]}}}]
        elif 'Compose linked chord shapes' in question:
            self.outcomes = [{'message': 'Choose a diagram to see its exact frets.', 'presentation': {
                'pattern': 'stack', 'focal': 'items', 'slots': {'items': [
                    {'pattern': 'split', 'focal': 'items', 'slots': {'items': [{'kind': 'voicing-explorer'}, {'kind': 'chord-inspector'}]}},
                    {'kind': 'fretboard'}]}}}]
        elif 'Compose linked progression' in question:
            self.outcomes = [{'message': 'Select a chord or a transition.', 'presentation': {
                'pattern': 'stack', 'focal': 'items', 'slots': {'items': [
                    {'pattern': 'grid', 'focal': 'items', 'slots': {'items': [{'kind': 'chord-diagram'}, {'kind': 'voice-leading'}]}},
                    {'kind': 'fretboard'}]}}}]
        elif 'Show one triad' in question:
            self.outcomes = [{'message': 'Play G, C and E on strings 3, 2 and 1.', 'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {'hero': [{'kind': 'triad-explorer', 'config': {'string_set': 1, 'inversion': 2, 'max_shapes': 1}}], 'support': [{'kind': 'chord-inspector'}]}}}]
        elif 'Show progression analysis' in question:
            self.outcomes = [{'message': 'Inspect the chord functions and adjacent voices.', 'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {'hero': [{'kind': 'voice-leading'}], 'support': [{'kind': 'harmonic-function'}, {'kind': 'chord-inspector'}, {'kind': 'fretboard'}]}}}]
        elif 'Show scratch' in question:
            self.outcomes = [{'message': 'Arrange your scratch chords.', 'presentation': {'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {'hero': [{'kind': 'scratch-sequence'}], 'support': [{'kind': 'chord-inspector'}]}}}]
        elif 'Change the key to E minor' in question:
            self.outcomes = [{'message': 'Changed to E minor.', 'mutation': {'kind': 'set_tonal_center', 'tonal_center': {'root': 'E', 'scale': 'natural_minor'}}}]
        elif 'Make it Dorian' in question:
            self.outcomes = [{'message': 'Changed to Dorian.', 'mutation': {'kind': 'set_scale', 'scale': 'dorian'}}]
        if 'Active workspace: progression' in question:
            workspace = json.loads(question.split('Workspace state (authoritative, untrusted musical data): ')[1].split('\n\n')[0])
            active = next(idea for idea in workspace['ideas'] if idea['id'] == workspace['active_idea_id'])
            surface = {'pattern':'hero-with-support','focal':'hero','slots':{'hero':[{'kind':'candidate-set'}],'support':[{'kind':'explanation'}]}}
            if 'Give three progressions' in question or 'Transpose and give variations' in question:
                outcome = {'message':'Try these alternatives.', 'candidates':{'candidate_kind':'progression-idea','candidates':[{'id':f'idea-{i}','label':f'Option {i + 1}','chords':[{'root':root,'quality':quality} for root,quality in chords]} for i,chords in enumerate([[('C','major'),('F','major'),('G','major')],[('A','minor'),('D','minor'),('E','major')],[('E','minor'),('A','minor'),('B','major')]])]}, 'presentation':surface}
                if 'Transpose and give variations' in question: outcome['mutation'] = {'kind':'transpose','semitones':4,'tonal_center':{'root':'E','scale':'natural_minor'}}
                self.outcomes = [outcome]
            elif 'Make chord 3 darker' in question:
                self.outcomes = [{'message':'Choose a replacement.', 'candidates':{'candidate_kind':'chord-replacement','candidates':[{'id':'replace','label':'Em7 replacement','step_id':active['chords'][2]['id'],'chord':{'root':'E','quality':'minor7'}}]}, 'presentation':surface}]
            elif 'Change chord 3 to Dm7' in question:
                self.outcomes = [{'message':'Changed chord 3.', 'mutation':{'kind':'progression_edit','step_id':active['chords'][2]['id'],'chord':{'root':'D','quality':'minor7'}}, 'presentation':{'pattern':'master-detail','focal':'detail','slots':{'list':[{'kind':'progression-idea-list'}],'detail':[{'kind':'progression-editor'},{'kind':'fretboard'}]}}}]
        return super()._generate(messages, **kwargs)


def scripted_factory(*args, **kwargs):
    return WorkspaceModel(outcomes=[{'message': 'Choose a degree or a neighbouring key.', 'presentation': {
        'pattern': 'hero-with-support', 'focal': 'hero', 'slots': {
            'hero': [{'kind': 'fretboard', 'config': {'labels': 'degrees'}}],
            'support': [{'kind': 'chord-palette', 'config': {'labels': 'numerals'}},
                        {'kind': 'degree-map'}, {'kind': 'circle-of-fifths'}],
        }}}])


app.dependency_overrides[get_tutor_model_factory] = lambda: scripted_factory
# The scripted model emits tool calls; developer-local provider settings may
# select native JSON output. Keep this test boundary deterministic.
app.dependency_overrides[get_settings] = lambda: get_settings().model_copy(update={'v2_tutor_provider': 'openai', 'v2_tutor_model': 'gpt-4o-mini'})

# Only the external providers are replaced for SongStudy browser acceptance.
from app.services import songsterr
from app.v2.router import get_enrichment_model_factory
from tests.v2 import song_browser_provider
for name in ('search_songs', 'get_song_revision', 'get_tab_data', 'get_chordpro'):
    setattr(songsterr, name, getattr(song_browser_provider, name))
app.dependency_overrides[get_enrichment_model_factory] = lambda: song_browser_provider.enrichment_factory
