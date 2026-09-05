import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { playScale } from '../utils/audio';
import { TutorChat } from './TutorChat';
import type {
  ConceptId,
  ConceptRelationship,
  ConceptStudyArtifact,
  ConceptStudyPayload,
  ConceptSuggestion,
  OpenConceptStudyResponse,
  ScaleConceptId,
  StudyCatalog,
  TutorFocus,
  V2Branch,
} from '../types/v2';

function ConceptFretboard({ payload, relationship, tutorFocus, showIntervals }: {
  payload: ConceptStudyPayload;
  relationship: ConceptRelationship | null;
  tutorFocus: TutorFocus | null;
  showIntervals: boolean;
}) {
  const { fret_start: start, fret_end: end, tuning, positions } = payload;
  const frets = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return (
    <div data-testid="concept-fretboard" className="overflow-x-auto rounded-xl border p-2" style={{ background: '#171b20', borderColor: '#343b44', color: '#f8fafc' }}>
      <p className="text-xs font-semibold mb-2">Frets {start}–{end} · {showIntervals ? 'intervals' : 'notes'}</p>
      <div className="min-w-[300px]">
        {tuning.map((openNote, index) => {
          const string = index + 1;
          return (
            <div key={string} data-testid="concept-fretboard-string" className="grid items-center h-10" style={{ gridTemplateColumns: `32px repeat(${frets.length}, minmax(48px, 1fr))` }}>
              <strong className="text-xs text-center">{openNote}</strong>
              {frets.map((fret) => {
                const primary = positions.find((position) => position.string === string && position.fret === fret);
                const comparison = relationship?.positions.find((position) => position.string === string && position.fret === fret);
                const tutor = tutorFocus?.notes.some((position) => position.string === string && position.fret === fret);
                const position = primary ?? comparison;
                return (
                  <div key={fret} className="h-full border-l flex items-center justify-center relative" style={{ borderColor: '#59626d' }}>
                    {position && <span data-testid={comparison && !primary ? 'concept-comparison-note' : 'concept-primary-note'} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: primary ? 'var(--accent-600)' : 'transparent', border: comparison && !primary ? '2px solid #a98ff0' : '1px solid #6ee7b7', color: 'white' }}>{showIntervals ? position.interval : position.note}</span>}
                    {tutor && <span data-testid="concept-tutor-focus-note" className="absolute w-9 h-9 rounded-full border-2 border-amber-400 pointer-events-none" />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {tutorFocus && <p data-testid="concept-tutor-focus-caption" className="text-xs mt-2 text-amber-300">Tutor focus — {tutorFocus.role}{tutorFocus.label ? `: ${tutorFocus.label}` : ''}</p>}
    </div>
  );
}

function Visualization({ payload, relationship, showIntervals, tutorFocus, onInterval }: {
  payload: ConceptStudyPayload;
  relationship: ConceptRelationship | null;
  showIntervals: boolean;
  tutorFocus: TutorFocus | null;
  onInterval?: (semitones: number) => void;
}) {
  if (payload.visualization === 'interval') {
    return (
      <section data-testid="study-interval-visualization" className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {payload.intervals.map((interval) => (
            <button key={interval.semitones} type="button" aria-pressed={payload.selected_interval === interval.semitones} onClick={() => onInterval?.(interval.semitones)} className="rounded-lg border p-3 text-left" style={{ borderColor: payload.selected_interval === interval.semitones ? 'var(--accent-600)' : 'var(--border-primary)', background: payload.selected_interval === interval.semitones ? 'var(--accent-50)' : 'var(--card-bg)' }}>
              <strong className="block">{interval.label} · {interval.note}</strong>
              <small style={{ color: 'var(--text-secondary)' }}>{interval.name}</small>
            </button>
          ))}
        </div>
        <ConceptFretboard payload={payload} relationship={null} tutorFocus={tutorFocus} showIntervals={showIntervals} />
      </section>
    );
  }
  return (
    <section data-testid="study-scale-visualization" className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {payload.notes.map((note) => <div key={note.note} data-testid="concept-study-note" className="rounded-lg border px-3 py-2 text-center min-w-14" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}><strong>{note.note}</strong><small data-testid="concept-study-interval" className="block" style={{ color: 'var(--text-secondary)' }}>{note.interval}</small></div>)}
      </div>
      <ConceptFretboard payload={payload} relationship={relationship} tutorFocus={tutorFocus} showIntervals={showIntervals} />
    </section>
  );
}

export function ConceptStudyPicker({ sessionId, branch, onOpened, onCancel, onWorkOnConcept }: {
  sessionId: string;
  branch: V2Branch;
  onOpened: (opened: OpenConceptStudyResponse) => void;
  onCancel?: () => void;
  onWorkOnConcept: (suggestion: ConceptSuggestion) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<StudyCatalog | null>(null);
  const [root, setRoot] = useState('A');
  const [conceptId, setConceptId] = useState<ConceptId>('pentatonic_minor');
  const [payload, setPayload] = useState<ConceptStudyPayload | null>(null);
  const [overlay, setOverlay] = useState<'notes' | 'intervals'>('notes');
  const [comparisonId, setComparisonId] = useState<ScaleConceptId | null>(null);
  const [selectedInterval, setSelectedInterval] = useState(7);
  const [savedArtifact, setSavedArtifact] = useState<ConceptStudyArtifact | null>(null);
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getStudyCatalog().then(setCatalog).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiClient.getStudyVisualization({ root, concept_id: conceptId, comparison_id: comparisonId, overlay, selected_interval: selectedInterval })
      .then((next) => { if (!cancelled) setPayload(next); })
      .catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [root, conceptId, comparisonId, overlay, selectedInterval]);

  const chooseConcept = (next: ConceptId) => {
    setSavedArtifact(null);
    setComparisonId(null);
    setConceptId(next);
  };
  const chooseRoot = (next: string) => { setSavedArtifact(null); setRoot(next); };
  const chooseOverlay = (next: 'notes' | 'intervals') => { setSavedArtifact(null); setOverlay(next); };
  const chooseInterval = (next: number) => { setSavedArtifact(null); setSelectedInterval(next); };
  const relationship = payload?.visualization === 'scale' && comparisonId ? payload.relationships[0] : null;

  const promote = async (promotion: 'save' | 'work_on_this') => {
    setBusy(true);
    setError(null);
    try {
      if (promotion === 'work_on_this' && savedArtifact) {
        onOpened(await apiClient.workOnSavedConcept(savedArtifact.id, sessionId, branch.id));
        return;
      }
      const opened = await apiClient.createConceptStudy({
        session_id: sessionId,
        branch_id: branch.id,
        root,
        concept_id: conceptId,
        comparison_id: comparisonId,
        overlay,
        selected_interval: selectedInterval,
        promotion,
      });
      if (promotion === 'save') setSavedArtifact(opened.artifact);
      else onOpened(opened);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && (!catalog || !payload)) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!catalog || !payload) return <p role="status">Loading Study…</p>;

  return (
    <section className="grid min-w-0 lg:grid-cols-[220px_minmax(0,1fr)_300px] rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
      <aside className="min-w-0 p-3 border-b lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <h2 className="text-xl font-black">Study</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Browse first · save when it matters</p>
        <div className="flex lg:block gap-3 overflow-x-auto pb-2">
          {catalog.groups.map((group) => <section key={group.id} className="min-w-48 lg:min-w-0 mb-3"><h3 className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: 'var(--text-secondary)' }}>{group.display_name}</h3>{group.concepts.map((concept) => <button key={concept.id} type="button" data-testid={`study-concept-${concept.id}`} aria-pressed={conceptId === concept.id} onClick={() => chooseConcept(concept.id)} className="block w-full rounded-lg px-2 py-2 text-left text-sm mb-1" style={{ background: conceptId === concept.id ? 'var(--accent-50)' : 'transparent', color: conceptId === concept.id ? 'var(--accent-700)' : 'var(--text-primary)' }}><strong className="block">{concept.display_name}</strong><small style={{ color: 'var(--text-secondary)' }}>{concept.description}</small></button>)}</section>)}
        </div>
      </aside>

      <main className="p-4 min-w-0 space-y-4">
        <header className="flex flex-wrap justify-between gap-3">
          <div><p className="text-[10px] uppercase tracking-widest font-black" style={{ color: 'var(--accent-700)' }}>{payload.visualization} study</p><h2 className="text-2xl font-black">{payload.display_name}</h2><p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Exploring · nothing changes until you save it</p></div>
          <div className="flex flex-wrap gap-2 items-start"><button type="button" data-testid="study-save" disabled={busy} onClick={() => promote('save')} className="rounded-lg border px-3 py-2 text-sm font-semibold">Save</button><button type="button" data-testid="study-work-on-this" disabled={busy} onClick={() => promote('work_on_this')} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: 'var(--accent-600)' }}>Work on this</button>{onCancel && <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-2 text-sm">Close</button>}</div>
        </header>
        {savedArtifact && <p data-testid="study-saved-status" role="status" className="text-sm font-semibold" style={{ color: 'var(--accent-700)' }}>Saved to My Stuff · keep exploring or work on this</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Root note">
          {catalog.roots.map((note) => <button key={note} type="button" data-testid={`study-root-${note}`} aria-pressed={root === note} onClick={() => chooseRoot(note)} className="shrink-0 w-9 h-9 rounded-lg border text-sm font-bold" style={{ background: root === note ? '#171b20' : 'var(--card-bg)', color: root === note ? 'white' : 'var(--text-primary)' }}>{note}</button>)}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" data-testid="study-overlay-notes" aria-pressed={overlay === 'notes'} onClick={() => chooseOverlay('notes')} className="rounded-full border px-3 py-1.5 text-sm">Notes</button>
          <button type="button" data-testid="study-overlay-intervals" aria-pressed={overlay === 'intervals'} onClick={() => chooseOverlay('intervals')} className="rounded-full border px-3 py-1.5 text-sm">Intervals</button>
          {payload.visualization === 'scale' && <button type="button" data-testid="study-toggle-comparison" aria-pressed={Boolean(comparisonId)} onClick={() => { setSavedArtifact(null); setComparisonId((current) => current ? null : payload.relationships[0].id as ScaleConceptId); }} className="rounded-full border px-3 py-1.5 text-sm">{comparisonId ? 'Hide comparison' : payload.relationships[0].label}</button>}
        </div>
        <Visualization payload={payload} relationship={relationship} showIntervals={overlay === 'intervals'} tutorFocus={tutorFocus} onInterval={chooseInterval} />
        {relationship && <p data-testid="concept-relationship" className="text-sm rounded-lg border p-3" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>{relationship.explanation}</p>}
      </main>

      <TutorChat sessionId={sessionId} branchId={branch.id} tutorThreadId={branch.tutor_thread_id} onFocusChange={setTutorFocus} onWorkOnConcept={onWorkOnConcept} emptyMessage="Ask about the concept you are exploring." />
    </section>
  );
}

export function ConceptStudyPanel({ sessionId, branch, onBranchChange, onWorkOnConcept }: {
  sessionId: string;
  branch: V2Branch;
  onBranchChange: (branch: V2Branch) => void;
  onWorkOnConcept: (suggestion: ConceptSuggestion) => Promise<void>;
}) {
  const [artifact, setArtifact] = useState<ConceptStudyArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIntervals, setShowIntervals] = useState(false);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);
  const practiceState = branch.selection?.type === 'concept_practice' ? branch.selection : null;
  const tempo = typeof practiceState?.tempo === 'number' ? practiceState.tempo : 80;

  useEffect(() => {
    if (!branch.current_artifact_id) return;
    let cancelled = false;
    apiClient.getConceptStudy(branch.current_artifact_id)
      .then((loaded) => {
        if (cancelled) return;
        setArtifact(loaded);
        setShowIntervals(loaded.payload.overlay === 'intervals');
        setComparisonId(loaded.payload.visualization === 'scale' ? loaded.payload.comparison_id : null);
      })
      .catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [branch.current_artifact_id]);

  const relationship = useMemo(() => artifact?.payload.visualization === 'scale' ? artifact.payload.relationships.find((item) => item.id === comparisonId) ?? null : null, [artifact, comparisonId]);
  const setPractice = async (next: Record<string, unknown> | null) => {
    try { onBranchChange(await apiClient.updateV2Branch(sessionId, branch.id, { selection: next })); }
    catch (err) { setError(String(err)); }
  };

  if (error) return <p role="alert">{error}</p>;
  if (!artifact) return <p role="status">Loading ConceptStudy…</p>;
  const payload = artifact.payload;

  return (
    <div data-testid="concept-study-workspace" className="flex flex-col xl:flex-row gap-4 items-start">
      <main className="flex-1 min-w-0 space-y-5 w-full">
        <header className="flex flex-wrap justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border-primary)' }}><div><p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: 'var(--accent-700)' }}>ConceptStudy · saved</p><h2 className="text-2xl font-bold">{payload.display_name}</h2><p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{payload.explanation}</p></div><div className="flex gap-2"><button type="button" data-testid="concept-hear" onClick={() => playScale(payload.positions)} className="rounded-lg border px-3 py-2 text-sm">Hear</button>{!practiceState && <button type="button" data-testid="concept-enter-practice" onClick={() => setPractice({ type: 'concept_practice', tempo: 80 })} className="rounded-lg px-3 py-2 text-sm text-white" style={{ background: 'var(--accent-600)' }}>Practice</button>}</div></header>
        {practiceState && <section data-testid="concept-practice" className="rounded-xl border p-4" style={{ background: '#fff6db', borderColor: '#edd48d', color: '#422006' }}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Contextual practice</h3><p className="text-sm">{tempo} BPM · one ascending pass</p></div><div className="flex gap-2"><button type="button" onClick={() => setPractice({ ...practiceState, tempo: Math.max(40, tempo - 5) })} className="rounded border px-3 py-2" aria-label="Slow practice by 5 BPM">−5</button><button type="button" data-testid="concept-practice-faster" onClick={() => setPractice({ ...practiceState, tempo: Math.min(200, tempo + 5) })} className="rounded border px-3 py-2" aria-label="Speed practice by 5 BPM">+5</button><button type="button" data-testid="concept-practice-start" onClick={() => playScale(payload.positions, 60 / tempo)} className="rounded px-3 py-2 text-white" style={{ background: '#1b1e23' }}>Start</button><button type="button" data-testid="concept-exit-practice" onClick={() => setPractice(null)} className="rounded border px-3 py-2">Exit</button></div></div></section>}
        <div className="flex gap-2"><button type="button" aria-pressed={!showIntervals} onClick={() => setShowIntervals(false)} className="rounded-full border px-3 py-1.5 text-sm">Notes</button><button type="button" aria-pressed={showIntervals} onClick={() => setShowIntervals(true)} className="rounded-full border px-3 py-1.5 text-sm">Intervals</button></div>
        <Visualization payload={payload} relationship={relationship} showIntervals={showIntervals} tutorFocus={tutorFocus} />
        {payload.visualization === 'scale' && <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)' }}><h3 className="font-bold">What changes?</h3><button type="button" data-testid="concept-compare" aria-pressed={Boolean(comparisonId)} onClick={() => setComparisonId((current) => current ? null : payload.relationships[0].id)} className="rounded-lg border px-3 py-2 text-sm font-semibold mt-2">{comparisonId ? 'Hide comparison' : payload.relationships[0].label}</button>{relationship && <p data-testid="concept-relationship" className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{relationship.explanation}</p>}</section>}
      </main>
      <TutorChat sessionId={sessionId} branchId={branch.id} tutorThreadId={branch.tutor_thread_id} onFocusChange={setTutorFocus} onWorkOnConcept={onWorkOnConcept} emptyMessage="Ask about this concept." />
    </div>
  );
}
