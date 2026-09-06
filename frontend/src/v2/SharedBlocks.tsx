import type { ReactNode } from 'react';
import type { ViewConfig } from './Composition';
import { CompositionView } from './Composition';
import { comparisonComposition } from './compare';
import type { ComparePeer } from './compare';
import type { NoteLayer } from './Fretboard';

export function Explanation({ text, subject }: { text: string; subject?: string }) {
  return <section aria-label={subject ? `Explanation: ${subject}` : 'Explanation'}>
    {subject && <h3>{subject}</h3>}<p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
  </section>;
}

export function NoteGroupOverlay({ group, children }: { group: NoteLayer; children: (layer: NoteLayer) => ReactNode }) {
  return <div aria-label={`Highlight: ${group.label}`}>{children(group)}</div>;
}

export function CandidateSet({ candidates, onPlay, onKeep, onDevelop, onDismiss }: {
  candidates: { id: string; label: string }[];
  onPlay: (id: string) => void; onKeep: (id: string) => void;
  onDevelop?: (id: string) => void; onDismiss: (id: string) => void;
}) {
  return <section aria-label="Candidates">
    {candidates.map(candidate => <div key={candidate.id} role="group" aria-label={`Candidate: ${candidate.label}`}>
      <h3>{candidate.label}</h3>
      <div className="music-controls">
        {([['Play', onPlay], ['Keep', onKeep], ['Develop', onDevelop], ['Dismiss', onDismiss]] as const).map(([label, handler]) =>
          handler && <button key={label} type="button" className="music-button" onClick={() => handler(candidate.id)}>{label}</button>)}
      </div>
    </div>)}
  </section>;
}

export function WorkspaceHeader({ title, focus, onBack, children }: { title: string; focus: string; onBack?: () => void; children: ReactNode }) {
  return <header><h2>{title}</h2><div className="music-controls">{children}</div>
    <nav aria-label="Focus breadcrumb">{onBack && <button type="button" className="music-button" onClick={onBack}>Back</button>} {focus}</nav>
  </header>;
}

export function ComparisonView({ peers, onClear, renderPeer }: { peers: ComparePeer[]; onClear: () => void; renderPeer: (peer: ComparePeer, config: ViewConfig, nudge: (value: ViewConfig) => void) => ReactNode }) {
  if (peers.length < 2) return null;
  return <section data-testid="comparison-view" aria-label="Comparison">
    <button type="button" className="music-button" onClick={onClear}>Clear comparison</button>
    <CompositionView composition={comparisonComposition(peers)} liveTurnId={peers.map(peer => peer.id).join('|')}
      renderBlock={(block, _path, nudge) => <div data-testid="comparison-peer">{renderPeer(block.subject as ComparePeer, block.config ?? {}, nudge)}</div>} />
  </section>;
}
