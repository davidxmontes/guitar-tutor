import { useMemo } from 'react';
import { usePractice } from './usePractice';
import { PracticeControls } from './PracticeControls';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import type { ProgressionIdea, ProgressionResolved } from './progression';

export function ProgressionPractice({ idea, data }: { idea: ProgressionIdea; data: ProgressionResolved }) {
  const guide = useMemo(() => data.steps.map(step => ({ label: `${step.root} ${step.quality}`, beats: step.duration_beats, positions: step.positions, tuning: idea.tuning })), [data.steps, idea.tuning]);
  const durations = useMemo(() => guide.map(step => step.beats), [guide]);
  const practice = usePractice(durations, 80, guide);
  const current = practice.position.index >= 0 ? practice.position.index : 0;
  const step = data.steps[current];
  const next = data.steps[current + 1] ?? (practice.loop ? data.steps[0] : null);
  return <section className="learning-progression-practice" aria-label="Play this progression">
    <div className="learning-practice-heading"><div><h3>Hear it. Then play along.</h3><p>One chord change at a time. Slow it down until each change feels comfortable.</p></div></div>
    <ol className="learning-chord-strip">{data.steps.map((chord, index) => <li key={chord.id} aria-current={practice.active && current === index ? 'step' : undefined}><small>{index + 1} · {chord.function ?? 'No function label'}</small><strong>{chord.root}<span>{chord.quality === 'major' ? '' : chord.quality === 'minor' ? 'm' : ` ${chord.quality}`}</span></strong><span>{chord.duration_beats} {chord.duration_beats === 1 ? 'beat' : 'beats'}</span></li>)}</ol>
    {practice.active && step && <div className="learning-playing-chord" data-testid="playing-chord"><PhysicalChordDiagram positions={step.positions} tuning={idea.tuning} label={`${step.root} ${step.quality}`} /><div><small>{practice.position.count ? 'Get ready for' : 'Current chord'}</small><h3>{step.root} {step.quality}</h3><p>{next ? `Next: ${next.root} ${next.quality}` : 'Last chord'} · {step.duration_beats} beats</p><p className="learning-hint">Aim to place your fingers before the next chord begins. The guide plays the displayed voicing.</p></div></div>}
    <PracticeControls practice={{ ...practice, enter: () => { practice.setAudioMode('both'); practice.enter(); } }} available={data.steps.length > 0} label="progression" allowFocus={false} guideLabel="Synthesized chord guide · follows your voicings and beat lengths" />
  </section>;
}
