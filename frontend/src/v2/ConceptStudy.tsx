import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { playScale } from '../utils/audio';
import { TutorChat } from './TutorChat';
import type {
  ConceptId,
  ConceptRelationship,
  ConceptStudyArtifact,
  ConceptSuggestion,
  OpenConceptStudyResponse,
  TutorFocus,
  V2Branch,
} from '../types/v2';

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CONCEPTS: Array<{ id: ConceptId; label: string }> = [
  { id: 'pentatonic_minor', label: 'Minor pentatonic' },
  { id: 'major_triad', label: 'Major triad' },
  { id: 'minor_triad', label: 'Minor triad' },
  { id: 'perfect_fifth', label: 'Perfect fifth interval' },
  { id: 'dominant_resolution', label: 'Dominant resolution' },
];

export function ConceptStudyPicker({
  sessionId,
  branchId,
  openInNewBranch,
  initial,
  onOpened,
  onCancel,
}: {
  sessionId: string;
  branchId: string;
  openInNewBranch: boolean;
  initial?: ConceptSuggestion;
  onOpened: (opened: OpenConceptStudyResponse) => void;
  onCancel?: () => void;
}) {
  const [root, setRoot] = useState(initial?.root ?? 'A');
  const [conceptId, setConceptId] = useState<ConceptId>(initial?.concept_id ?? 'pentatonic_minor');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      onOpened(await apiClient.createConceptStudy({
        session_id: sessionId,
        branch_id: branchId,
        root,
        concept_id: conceptId,
        open_in_new_branch: openInNewBranch,
      }));
    } catch (err) {
      setError(String(err));
    } finally {
      setOpening(false);
    }
  };

  return (
    <section className="max-w-xl rounded-xl border p-5 space-y-4" style={{ background: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}>
      <div>
        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: 'var(--accent-700)' }}>ConceptStudy</p>
        <h2 className="text-xl font-bold">Choose a theory concept</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Open a focused workspace only when you want the concept to become primary.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm font-medium">Root note
          <select aria-label="Root note" value={root} onChange={(event) => setRoot(event.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            {ROOTS.map((note) => <option key={note}>{note}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Concept
          <select aria-label="Concept" value={conceptId} onChange={(event) => setConceptId(event.target.value as ConceptId)} className="mt-1 block w-full rounded-lg border px-3 py-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            {CONCEPTS.map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" data-testid="concept-study-open" onClick={open} disabled={opening} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent-600)' }}>
          {opening ? 'Opening…' : openInNewBranch ? 'Work on this' : 'Open ConceptStudy'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--border-primary)' }}>Cancel</button>}
      </div>
    </section>
  );
}

function ConceptFretboard({ artifact, relationship, tutorFocus, showIntervals }: {
  artifact: ConceptStudyArtifact;
  relationship: ConceptRelationship | null;
  tutorFocus: TutorFocus | null;
  showIntervals: boolean;
}) {
  const { fret_start: start, fret_end: end, tuning, positions } = artifact.payload;
  const frets = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return (
    <div data-testid="concept-fretboard" className="overflow-x-auto rounded-xl border p-2" style={{ background: '#171b20', borderColor: '#343b44', color: '#f8fafc' }}>
      <p className="text-xs font-semibold mb-2">Frets {start}–{end} · {showIntervals ? 'intervals' : 'notes'}</p>
      <div className="min-w-[340px]">
        {tuning.map((openNote, index) => {
          const string = index + 1;
          return (
            <div key={string} data-testid="concept-fretboard-string" className="grid items-center h-10" style={{ gridTemplateColumns: `36px repeat(${frets.length}, minmax(54px, 1fr))` }}>
              <strong className="text-xs text-center" style={{ color: '#b7c0c9' }}>{openNote}</strong>
              {frets.map((fret) => {
                const primary = positions.find((position) => position.string === string && position.fret === fret);
                const comparison = relationship?.positions.find((position) => position.string === string && position.fret === fret);
                const tutor = tutorFocus?.notes.some((position) => position.string === string && position.fret === fret);
                const position = primary ?? comparison;
                return (
                  <div key={fret} className="h-full border-l flex items-center justify-center relative" style={{ borderColor: '#59626d' }}>
                    {position && <span data-testid={comparison && !primary ? 'concept-comparison-note' : 'concept-primary-note'} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: primary ? 'var(--accent-600)' : 'transparent', border: comparison && !primary ? '2px solid #60a5fa' : '1px solid #6ee7b7', color: 'white' }}>{showIntervals ? position.interval : position.note}</span>}
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
      .then((loaded) => { if (!cancelled) setArtifact(loaded); })
      .catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [branch.current_artifact_id]);

  const relationship = useMemo(
    () => artifact?.payload.relationships.find((item) => item.id === comparisonId) ?? null,
    [artifact, comparisonId],
  );

  const setPractice = async (next: Record<string, unknown> | null) => {
    try {
      onBranchChange(await apiClient.updateV2Branch(sessionId, branch.id, { selection: next }));
    } catch (err) {
      setError(String(err));
    }
  };

  if (error) return <p role="alert">{error}</p>;
  if (!artifact) return <p role="status">Loading ConceptStudy…</p>;
  const payload = artifact.payload;

  return (
    <div data-testid="concept-study-workspace" className="flex flex-col xl:flex-row gap-4 items-start">
      <main className="flex-1 min-w-0 space-y-5 w-full">
        <header className="flex flex-wrap justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border-primary)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: 'var(--accent-700)' }}>ConceptStudy · saved</p>
            <h2 className="text-2xl font-bold">{payload.display_name}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{payload.explanation}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" data-testid="concept-hear" onClick={() => playScale(payload.positions)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-primary)' }}>Hear</button>
            {!practiceState && <button type="button" data-testid="concept-enter-practice" onClick={() => setPractice({ type: 'concept_practice', tempo: 80, loop: true })} className="rounded-lg px-3 py-2 text-sm text-white" style={{ background: 'var(--accent-600)' }}>Practice</button>}
          </div>
        </header>

        {practiceState && <section data-testid="concept-practice" className="rounded-xl border p-4" style={{ background: '#fff6db', borderColor: '#edd48d', color: '#422006' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold">Contextual practice</h3><p className="text-sm">{tempo} BPM · Loop on · play the shape up and back</p></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPractice({ ...practiceState, tempo: Math.max(40, tempo - 5) })} className="rounded border px-3 py-2" aria-label="Slow practice by 5 BPM">−5</button>
              <button type="button" data-testid="concept-practice-faster" onClick={() => setPractice({ ...practiceState, tempo: Math.min(200, tempo + 5) })} className="rounded border px-3 py-2" aria-label="Speed practice by 5 BPM">+5</button>
              <button type="button" data-testid="concept-practice-start" onClick={() => playScale(payload.positions, 60 / tempo)} className="rounded px-3 py-2 text-white" style={{ background: '#1b1e23' }}>Start</button>
              <button type="button" data-testid="concept-exit-practice" onClick={() => setPractice(null)} className="rounded border px-3 py-2">Exit</button>
            </div>
          </div>
        </section>}

        <section className="space-y-3" aria-labelledby="theory-lenses-title">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 id="theory-lenses-title" className="font-bold">Theory lenses</h3>
            <div className="flex rounded-lg border p-1" style={{ borderColor: 'var(--border-primary)' }}>
              <button type="button" aria-pressed={!showIntervals} onClick={() => setShowIntervals(false)} className="rounded px-3 py-1.5 text-sm">Notes</button>
              <button type="button" aria-pressed={showIntervals} onClick={() => setShowIntervals(true)} className="rounded px-3 py-1.5 text-sm">Intervals</button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {payload.notes.map((note) => <div key={note.note} data-testid="concept-study-note" className="rounded-lg border px-3 py-2 text-center min-w-14" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}><strong>{note.note}</strong><small data-testid="concept-study-interval" className="block" style={{ color: 'var(--text-secondary)' }}>{note.interval}</small></div>)}
          </div>
          <ConceptFretboard artifact={artifact} relationship={relationship} tutorFocus={tutorFocus} showIntervals={showIntervals} />
        </section>

        <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
          <h3 className="font-bold">Related harmony · what changes?</h3>
          {payload.relationships.map((item) => <div key={item.id} className="mt-2"><button type="button" data-testid="concept-compare" aria-pressed={comparisonId === item.id} onClick={() => setComparisonId((current) => current === item.id ? null : item.id)} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border-primary)' }}>{comparisonId === item.id ? 'Hide comparison' : item.label}</button>{comparisonId === item.id && <p data-testid="concept-relationship" className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{item.explanation}</p>}</div>)}
        </section>
      </main>
      <TutorChat sessionId={sessionId} branchId={branch.id} tutorThreadId={branch.tutor_thread_id} onFocusChange={setTutorFocus} onWorkOnConcept={onWorkOnConcept} emptyMessage="Ask about this concept." />
    </div>
  );
}
