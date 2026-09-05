import type { ProgressionChord, TutorFocus, VoicingProposal } from '../types/v2';
import { midiToNoteName } from '../utils/tuning';
import { voicingTuning } from './voicingAudio';

export function VoicingComparison({ active, comparison, focus, upcoming }: {
  active: ProgressionChord;
  comparison: VoicingProposal | null;
  focus: TutorFocus | null;
  upcoming?: ProgressionChord;
}) {
  const tuning = voicingTuning(active);
  if (!tuning) return <p>No tuning available for this chord.</p>;
  const groups = [
    { role: 'active', label: 'Active', notes: active.voicing ?? [], tuning, color: '#15803d' },
    ...(comparison ? [{ role: 'comparison', label: comparison.label, notes: comparison.chord.voicing ?? [], tuning: voicingTuning(comparison.chord) ?? tuning, color: '#0369a1' }] : []),
    ...(upcoming ? [{ role: 'upcoming', label: 'Upcoming', notes: upcoming.voicing ?? [], tuning: voicingTuning(upcoming) ?? tuning, color: '#0369a1' }] : []),
    ...(focus ? [{ role: 'context', label: focus.label ?? 'Tutor focus', notes: focus.notes, tuning, color: '#a16207' }] : []),
  ];
  const end = Math.min(36, Math.max(12, ...groups.flatMap(g => g.notes.map(p => p.fret))));
  return (
    <section data-testid="voicing-fretboard" aria-label="Voicing relationship fretboard" className="space-y-2">
      <h3 className="text-sm font-bold">Fretboard · compare shapes</h3>
      <p className="text-xs">● Active · ◇ {upcoming ? 'Upcoming chord' : comparison?.label ?? 'Choose a candidate to compare'}{focus ? ' · Tutor focus' : ''}</p>
      <div className="overflow-x-auto rounded-lg bg-stone-900 p-3">
        <svg role="img" aria-label="Exact positions on six strings; circles are active, diamonds are comparison" width={(end + 2) * 42} height="220">
          {Array.from({ length: end + 1 }, (_, fret) => <g key={fret}>
            <text x={60 + fret * 42} y="16" textAnchor="middle" fill="#d6d3d1" fontSize="11">{fret}</text>
            <line x1={80 + fret * 42} x2={80 + fret * 42} y1="28" y2="206" stroke="#57534e" />
          </g>)}
          {tuning.map((midi, index) => <g key={index}>
            <text x="8" y={48 + index * 30} fill="#e7e5e4" fontSize="11">{midiToNoteName(midi)}</text>
            <line x1="40" x2={(end + 2) * 42} y1={44 + index * 30} y2={44 + index * 30} stroke="#78716c" />
          </g>)}
          {groups.map(group => <g key={group.role} data-role={group.role}>
            {group.notes.filter(p => p.string >= 1 && p.string <= 6 && p.fret >= 0 && p.fret <= 36).map((p, i) => {
              const x = 60 + p.fret * 42;
              const y = 44 + (p.string - 1) * 30;
              return <g key={i}>
                <title>{group.label}: string {p.string}, fret {p.fret}, {midiToNoteName(group.tuning[p.string - 1] + p.fret, true)}</title>
                {group.role === 'comparison' || group.role === 'upcoming' ? <path d={`M${x} ${y-14} l14 14 l-14 14 l-14 -14 Z`} fill="none" stroke="#7dd3fc" strokeWidth="3" /> : <circle cx={x} cy={y} r="11" fill={group.color} />}
                <text x={x} y={y+4} textAnchor="middle" fill="white" fontSize="10">{midiToNoteName(group.tuning[p.string - 1] + p.fret)}</text>
              </g>;
            })}
          </g>)}
        </svg>
      </div>
      {comparison && <p className="text-xs">{comparison.label}: {comparison.chord.voicing?.map(p => `string ${p.string} fret ${p.fret}`).join(' · ')}</p>}
    </section>
  );
}
