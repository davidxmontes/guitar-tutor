import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import type { ExerciseArtifact, TutorFocus, V2Branch } from '../types/v2';
import { PracticeControls } from './PracticeControls';
import { usePractice } from './usePractice';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import { VoicingComparison } from './VoicingComparison';
import { TutorChat } from './TutorChat';

export function ExerciseWorkspace({ sessionId, branch }: { sessionId: string; branch: V2Branch }) {
  const [artifact, setArtifact] = useState<ExerciseArtifact | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let live = true; apiClient.getExercise(branch.current_artifact_id!).then(item => { if (live) setArtifact(item); }).catch(() => { if (live) setError(true); }); return () => { live = false; }; }, [branch.current_artifact_id]);
  if (error) return <p role="alert">Could not load this exercise.</p>;
  if (!artifact) return <p role="status">Loading exercise…</p>;
  return <ExercisePlayer key={artifact.id} artifact={artifact} sessionId={sessionId} branch={branch} />;
}

function ExercisePlayer({ artifact, sessionId, branch }: { artifact: ExerciseArtifact; sessionId: string; branch: V2Branch }) {
  const { steps, title, intent, created_from } = artifact.payload;
  const durations = useMemo(() => steps.map(step => step.beats), [steps]);
  const practice = usePractice(durations, artifact.payload.tempo);
  const [selected, setSelected] = useState(0);
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);
  const index = practice.active ? Math.max(0, practice.position.index) : selected;
  const next = practice.active ? practice.position.next : index + 1 < steps.length ? index + 1 : null;
  const chord = (i: number) => ({ root: '', quality: '', voicing: steps[i].positions, tuning: steps[i].tuning });
  return <div data-testid="exercise-workspace" className="flex flex-col gap-4 xl:flex-row text-[var(--text-primary)]">
    <main className="min-w-0 flex-1 space-y-4">
      <header><p className="text-xs font-bold text-[var(--text-secondary)]">Exercise · saved</p><h2 className="text-2xl font-bold">{title}</h2><p>{intent}</p><p className="text-xs text-[var(--text-secondary)]">Created from {created_from.title} · independent copy</p></header>
      <PracticeControls practice={practice} available={steps.length > 0} label="exercise" />
      <div aria-label="Exercise sequence" className="flex gap-3 overflow-x-auto pb-2">{steps.map((step, i) => <button key={i} data-testid="exercise-step" type="button" aria-pressed={i === index} disabled={practice.active} onClick={() => setSelected(i)} className="min-w-32 shrink-0 rounded-lg border p-3 text-left" style={{ borderColor: i === index ? 'var(--accent-600)' : 'var(--border-primary)', background: i === index ? 'var(--accent-50)' : 'var(--card-bg)', color: i === index ? 'var(--accent-900)' : 'var(--text-primary)' }}>
        <strong className="block text-sm">{i + 1}. {step.label}</strong><span className="block text-xs">{step.beats} beats · {i === index ? 'Current' : i === next ? 'Next' : ''}</span>
        {step.positions.length ? <PhysicalChordDiagram positions={step.positions} tuning={step.tuning} /> : <span>Rest</span>}
      </button>)}</div>
      <VoicingComparison active={chord(index)} comparison={null} focus={practice.active ? null : tutorFocus} upcoming={next === null ? null : chord(next)} />
    </main>
    <div style={{ display: practice.focused ? 'none' : 'contents' }}><TutorChat sessionId={sessionId} branchId={branch.id} tutorThreadId={branch.tutor_thread_id} onFocusChange={setTutorFocus} emptyMessage="Ask about this drill." /></div>
  </div>;
}
