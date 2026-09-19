import { useEffect, useRef, useState } from 'react';
import type { PracticeState } from './usePractice';
import { PracticeControls } from './PracticeControls';
import type { ProgressionResolved } from './progression';
import type { ProgressionIdea } from '../types/v2';

export function ProgressionPractice({ idea, data, selectedId, busy, onSelect, edit, practice }: { idea: ProgressionIdea; data: ProgressionResolved; selectedId?: string; busy: boolean; onSelect: (id: string) => void; edit: (value: Record<string, unknown>) => Promise<void>; practice: PracticeState }) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  function move(id: string, target: string) {
    if (busy || id === target) return;
    const order = idea.chords.map(chord => chord.id);
    const from = order.indexOf(id), to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1); order.splice(to, 0, id);
    void edit({ order, focus: { kind: 'step', step_id: id } });
  }
  const sequence = useRef<HTMLOListElement>(null);
  const current = practice.position.index >= 0 ? practice.position.index : 0;
  const step = data.steps[current];
  const next = data.steps[current + 1] ?? (practice.loop ? data.steps[0] : null);
  const visibleId = practice.active ? step?.id : selectedId;
  useEffect(() => {
    const list = sequence.current;
    const button = list?.querySelector('[aria-pressed="true"]');
    if (!list || !button) return;
    const bounds = list.getBoundingClientRect();
    const selected = button.getBoundingClientRect();
    const delta = selected.left < bounds.left ? selected.left - bounds.left : Math.max(0, selected.right - bounds.right);
    if (delta) list.scrollBy({ left: delta });
  }, [visibleId]);
  return <><section className="learning-progression-practice" aria-label="Play this progression">
    <div className="learning-practice-heading"><div><h3>{idea.label}</h3></div>{!practice.active && <PracticeControls practice={{ ...practice, enter: () => { practice.setAudioMode('both'); practice.enter(); } }} available={data.steps.length > 0} label="progression" allowFocus={false} />}</div>
    {practice.active && step && <p className="progression-playback-context" data-testid="playing-chord">{practice.position.count ? 'Get ready for' : 'Current chord'}: <strong>{step.root} {step.quality}</strong> · {next ? `Next: ${next.root} ${next.quality}` : 'Last chord'}. Select any chord to stop and inspect it.</p>}
    {practice.active && <PracticeControls practice={practice} available={data.steps.length > 0} label="progression" allowFocus={false} guideLabel="Synthesized chord guide · follows your voicings and beat lengths" />}
  </section>
    <nav className="progression-chord-navigation" aria-label="Chords in this progression"><ol ref={sequence} className="learning-chord-strip">{data.steps.map((chord, index) => <li key={chord.id} data-drop-target={dropTarget === chord.id} onDragOver={event => { if (dragged && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(chord.id); } }} onDrop={event => { event.preventDefault(); if (dragged) move(dragged, chord.id); setDragged(null); setDropTarget(null); }} aria-current={practice.active && current === index ? 'step' : undefined}><button type="button" draggable={!busy} title="Drag to reorder · Alt + arrow keys to move" onDragStart={event => { setDragged(chord.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', chord.id); }} onDragEnd={() => { setDragged(null); setDropTarget(null); }} aria-label={`Chord ${index + 1}: ${chord.root} ${chord.quality}`} aria-pressed={practice.active ? index === current : chord.id === selectedId} aria-disabled={busy} onClick={() => { if (!busy) { practice.exit(); onSelect(chord.id); } }} onKeyDown={event => {
      const target = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? data.steps.length - 1 : null;
      if (target === null) return;
      event.preventDefault();
      if (busy || !data.steps[target]) return;
      if (event.altKey) { move(chord.id, data.steps[target].id); return; }
      sequence.current?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[target]?.focus();
      practice.exit(); onSelect(data.steps[target].id);
    }}><small>{index + 1} · {chord.function ?? 'No function label'}</small><strong>{chord.root}<span>{chord.quality === 'major' ? '' : chord.quality === 'minor' ? 'm' : ` ${chord.quality}`}</span></strong><span>{chord.duration_beats} {chord.duration_beats === 1 ? 'beat' : 'beats'}</span></button><button className="progression-remove" type="button" aria-label={`Remove chord ${index + 1}: ${chord.root} ${chord.quality}`} title="Remove chord" disabled={busy} onClick={() => void edit({ remove: chord.id })}>×</button></li>)}</ol></nav>
  </>;
}
