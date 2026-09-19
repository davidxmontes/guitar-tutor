import { MusicIcon } from './MusicIcon';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ViewConfig } from './Composition';
import { CompositionView } from './Composition';
import { comparisonComposition } from './compare';
import type { ComparePeer } from './compare';
import type { NoteLayer } from '../types/music';

export function Explanation({ text, subject }: { text: string; subject?: string }) {
  return <section aria-label={subject ? `Explanation: ${subject}` : 'Explanation'}>
    {subject && <h3>{subject}</h3>}<div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
  </section>;
}

export function NoteGroupOverlay({ group, children }: { group: NoteLayer; children: (layer: NoteLayer) => ReactNode }) {
  return <div aria-label={`Highlight: ${group.label}`}>{children(group)}</div>;
}

export function CandidateSet({ candidates, onPlay, onKeep, onDevelop, onDismiss, disabled = false }: {
  disabled?: boolean;
  candidates: { id: string; label: string; description?: string }[];
  onPlay: (id: string) => void; onKeep: (id: string) => void;
  onDevelop?: (id: string) => void; onDismiss: (id: string) => void;
}) {
  return <section aria-label="Candidates">
    {!candidates.length && <p>No current candidates.</p>}
    {candidates.map(candidate => <div key={candidate.id} role="group" aria-label={`Candidate: ${candidate.label}`}>
      <h3>{candidate.label}</h3>{candidate.description && <p>{candidate.description}</p>}
      <div className="music-controls">
        {([['Play', onPlay], ['Keep', onKeep], ['Develop', onDevelop], ['Dismiss', onDismiss]] as const).map(([label, handler]) =>
          handler && <button disabled={disabled} key={label} type="button" className="music-button" onClick={() => handler(candidate.id)}>{label}</button>)}
      </div>
    </div>)}
  </section>;
}

export function WorkspaceHeader({ title, focus, onBack, children }: { title: string; focus: string; onBack?: () => void; children: ReactNode }) {
  return <header className="learning-workspace-header" aria-label={`${title} workspace controls`}><div className="music-controls">{children}</div>
    <nav aria-label="Focus breadcrumb"><span>Looking at</span> {focus} {onBack && <button type="button" className="music-button music-icon-button" aria-label="Back" title="Back to the whole workspace" onClick={onBack}><MusicIcon name="back" /></button>}</nav>
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
