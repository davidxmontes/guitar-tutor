import { useState } from 'react';
import type { ReactNode } from 'react';
import './Composition.css';

export type ViewConfig = { labels?: 'notes' | 'degrees'; fret_window?: [number, number] };
export type BlockSpec = {
  kind: string;
  subject?: unknown;
  config?: Record<string, unknown>;
  emphasis?: 'normal' | 'muted';
};
export type Composition = {
  pattern: 'hero-with-support' | 'comparison' | 'master-detail' | 'explanation-led';
  slots: Record<string, (BlockSpec | Composition)[]>;
  focal: string;
  per_block_config?: Record<string, Record<string, unknown>>;
};
type Props = {
  composition: Composition;
  liveTurnId: string;
  renderBlock: (block: BlockSpec, path: string, nudge: (value: ViewConfig) => void) => ReactNode;
};

/** Accepts a backend-validated Composition. A live pointer change remounts
 * viewer state; musical edits with the same pointer preserve view nudges. */
export function CompositionView(props: Props) {
  return <Viewer key={props.liveTurnId} {...props} />;
}

function Viewer({ composition, renderBlock }: Props) {
  const [overrides, setOverrides] = useState<Record<string, ViewConfig>>({});
  function layout(surface: Composition, prefix = '', inherited: Composition['per_block_config'] = {}): ReactNode {
    const config = { ...Object.fromEntries(Object.entries(surface.per_block_config ?? {}).map(([path, value]) => [prefix + path, value])), ...inherited };
    // Focal first in reading order as well as visually, including mobile.
    const slots = Object.entries(surface.slots).sort(([a], [b]) => Number(b === surface.focal) - Number(a === surface.focal));
    return (
      <div className={`composition composition--${surface.pattern}`} data-testid="composition">
        {slots.filter(([, blocks]) => blocks.length).map(([slot, blocks]) => (
          <section key={slot} data-focal={slot === surface.focal} className="composition-slot"
            aria-label={slot === surface.focal ? `Main focus: ${slot}` : `Supporting: ${slot}`}>
            <span className="composition-label">{slot === surface.focal ? 'Main focus' : 'Supporting context'}</span>
            <div className={`composition-content ${slot === 'peers' ? 'composition-peers' : ''}`}>
              {blocks.map((block, index) => {
                const path = `${prefix}${slot}.${index}`;
                if ('pattern' in block) return <div key={path}>{layout(block, path + '.', config)}</div>;
                const resolved = { ...block, config: { ...block.config, ...config[path], ...overrides[path] } };
                return <div key={path} className="composition-block" data-emphasis={block.emphasis ?? 'normal'}>
                  {renderBlock(resolved, path, (value) => {
                    if (block.kind !== 'fretboard') return;
                    const safe: ViewConfig = {};
                    if (value.labels === 'notes' || value.labels === 'degrees') safe.labels = value.labels;
                    if (value.fret_window && value.fret_window.length === 2 && value.fret_window.every(Number.isInteger)
                      && value.fret_window[0] >= 0 && value.fret_window[0] <= value.fret_window[1] && value.fret_window[1] <= 24) {
                      safe.fret_window = value.fret_window;
                    }
                    setOverrides((previous) => ({ ...previous, [path]: { ...previous[path], ...safe } }));
                  })}
                </div>;
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }
  return layout(composition);
}
