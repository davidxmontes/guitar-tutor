import { useMemo, useState } from 'react';
import type { ExerciseArtifact } from '../types/v2';
import { PracticeControls } from './PracticeControls';
import { usePractice } from './usePractice';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

export function ExerciseWorkspace({ artifact }: { artifact: ExerciseArtifact }) {
  const { steps, title, intent, created_from } = artifact.payload;
  const durations = useMemo(() => steps.map(step => step.beats), [steps]);
  const practice = usePractice(durations, artifact.payload.tempo, steps);
  const [selected, setSelected] = useState(0);
  const index = practice.active ? Math.max(0, practice.position.index) : selected;
  const step = steps[index];
  return <section data-testid="exercise-workspace" className="space-y-4">
    <header><h2 className="text-2xl font-bold">{title}</h2><p>{intent}</p><p>Created from {'idea' in created_from ? created_from.idea.label : created_from.title} · independent copy</p></header>
    <PracticeControls practice={practice} available={steps.length > 0} label="exercise" />
    <ol hidden={practice.focused} className="flex flex-wrap gap-2">{steps.map((item, i) => <li key={i}><button className="music-button" disabled={practice.active} aria-pressed={i === index} onClick={() => setSelected(i)}>{i + 1}. {item.label} · {item.beats} beats</button></li>)}</ol>
    {step && <div><h3>Current: {step.label}</h3>{step.positions.length ? <PhysicalChordDiagram positions={step.positions} tuning={step.tuning} /> : <p>Rest</p>}</div>}
  </section>;
}
