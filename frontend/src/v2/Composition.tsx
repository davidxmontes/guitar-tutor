import { useState } from 'react';
import type { ReactNode } from 'react';
import type { BlockSpec, Composition } from '../types/v2';
import './Composition.css';

export type ViewConfig = { labels?: 'notes' | 'degrees'; fret_window?: [number, number] };
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
    const free = ['stack', 'split', 'grid'].includes(surface.pattern);
    // Focal first in reading order as well as visually, including mobile.
    const slots = Object.entries(surface.slots).sort(([a], [b]) => Number(b === surface.focal) - Number(a === surface.focal));
    return (
      <div className={`composition composition--${surface.pattern}`} data-testid="composition" data-layout={surface.pattern} data-size={surface.size ?? 'fill'}>
        {slots.filter(([, blocks]) => blocks.length).map(([slot, blocks]) => (
          <section key={slot} data-focal={slot === surface.focal} className={`composition-slot ${free ? 'composition-slot--free' : ''}`}
            aria-label={slot === surface.focal ? `Main focus: ${slot}` : `Supporting: ${slot}`}>
            {!free && <span className="composition-label">{slot === surface.focal ? 'Main focus' : 'Supporting context'}</span>}
            <div className={`composition-content ${slot === 'peers' ? 'composition-peers' : ''} ${free ? `composition-items--${surface.pattern}` : ''}`}>
              {blocks.map((block, index) => {
                const path = `${prefix}${slot}.${index}`;
                if ('pattern' in block) return <div key={path} className="composition-child" data-size={block.size ?? 'fill'}>{layout(block, path + '.', config)}</div>;
                const resolved = { ...block, config: { ...block.config, ...config[path], ...overrides[path] } };
                return <div key={path} className="composition-block" data-component={block.kind} data-size={block.size ?? 'medium'} data-emphasis={block.emphasis ?? 'normal'}>
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
