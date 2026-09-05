import type { CircleState, CircleStudyPayload } from '../types/v2';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';

export function CircleStudy({ payload: p, onChange }: { payload: CircleStudyPayload; onChange: (patch: Partial<CircleState>) => void }) {
  const selected = p.chords[p.selected_chord];
  const sequence = p.sequences.find(s => s.id === p.selected_sequence)!;
  const button = 'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-600)]';
  const style = (active: boolean) => ({ background: active ? 'var(--accent-50)' : 'var(--card-bg)', color: active ? 'var(--accent-900)' : 'var(--text-primary)', borderColor: active ? 'var(--accent-600)' : 'var(--border-primary)' });
  return <section data-testid="circle-study" className="space-y-4">
    <div className="relative mx-auto aspect-square w-full max-w-96" aria-label="Circle of Fifths">
      <div aria-hidden="true" className="absolute inset-[12%] rounded-full border-2 border-[var(--border-primary)]" />
      {p.keys.map((key, i) => {
        const angle = i * Math.PI / 6;
        const role = key.root === p.root ? 'I' : key.root === p.neighbor_keys[0] ? 'IV' : key.root === p.neighbor_keys[1] ? 'V' : '';
        return <button key={key.root} type="button" aria-label={`${key.root} major, relative ${key.relative_minor} minor`} aria-pressed={key.root === p.root} onClick={() => onChange({ root: key.root })} className="absolute flex min-h-11 w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg border py-1 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ left: `${50 + 42 * Math.sin(angle)}%`, top: `${50 - 42 * Math.cos(angle)}%`, ...style(key.root === p.root), borderWidth: role ? 2 : 1, borderColor: role ? 'var(--accent-600)' : 'var(--border-primary)' }}>
          <strong className="text-sm">{key.root}{role && <span className="ml-1 text-[9px]">{role}</span>}</strong><span className="text-[10px]">{key.relative_minor}m</span>
        </button>;
      })}
      <div className="absolute inset-[30%] flex flex-col items-center justify-center text-center"><strong className="text-xl">{p.root} major</strong><span className="text-xs">{p.relative_minor} minor</span><span className="mt-1 text-[10px] text-[var(--text-secondary)]">relative minor</span></div>
    </div>
    <p data-testid="circle-signature" className="text-sm text-[var(--text-secondary)]">Key signature: {p.accidentals.length ? p.accidentals.join(' · ') : 'no sharps or flats'} · Neighbors: {p.neighbors.map((name, i) => name === p.neighbor_keys[i] ? name : `${name} (${p.neighbor_keys[i]})`).join(' · ')}</p>
    <div className="flex flex-wrap gap-2" aria-label="Diatonic chords">{p.chords.map((item, i) => <button key={i} data-testid="circle-chord" type="button" aria-pressed={p.selected_chord === i} onClick={() => onChange({ selected_chord: i })} className={button} style={style(p.selected_chord === i)}>{item.numeral}<strong className="block">{item.chord.root}{item.chord.quality === 'minor' ? 'm' : item.chord.quality === 'diminished' ? '°' : ''}</strong></button>)}</div>
    <div className="flex flex-wrap items-center gap-4"><div><h3 className="text-sm font-bold">{selected.numeral} · chord tones</h3><p data-testid="circle-chord-tones">{selected.notes.map(n => n.note).join(' · ')}</p><p className="text-xs text-[var(--text-secondary)]">Reference shape · standard tuning</p></div>{selected.chord.voicing ? <PhysicalChordDiagram positions={selected.chord.voicing} tuning="standard" /> : <p className="text-xs">No physical reference shape available.</p>}</div>
    <div className="flex flex-wrap gap-2" aria-label="Common movements">{p.sequences.map(s => <button key={s.id} type="button" className={button} aria-pressed={s.id === p.selected_sequence} style={style(s.id === p.selected_sequence)} onClick={() => onChange({ selected_sequence: s.id })}>{s.label}</button>)}</div>
    <ol aria-label="Selected harmony sequence" className="flex gap-2 overflow-x-auto">{sequence.degrees.map((degree, i) => <li key={i} className="shrink-0 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">{p.chords[degree].numeral} · {p.chords[degree].chord.root}{p.chords[degree].chord.quality === 'minor' ? 'm' : ''}{i < sequence.degrees.length - 1 ? ' →' : ''}</li>)}</ol>
  </section>;
}
