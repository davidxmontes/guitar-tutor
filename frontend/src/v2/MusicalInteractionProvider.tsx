import { useState } from 'react';
import type { ReactNode } from 'react';
import { Interaction } from './musicalInteraction';
import type { MusicalIntent, MusicalPreview } from './musicalInteraction';

export function MusicalInteraction({ onSelect, children, scope }: { scope: string; onSelect: (intent: MusicalIntent) => void; children: ReactNode }) {
  const [hover, setHover] = useState<{ scope: string; value: MusicalPreview } | null>(null);
  const preview = hover?.scope === scope ? hover.value : null;
  const showPreview = (value: MusicalPreview) => setHover(value ? { scope, value } : null);
  return <Interaction.Provider value={{ select: intent => { showPreview(null); onSelect(intent); }, preview, showPreview }}>{children}</Interaction.Provider>;
}

