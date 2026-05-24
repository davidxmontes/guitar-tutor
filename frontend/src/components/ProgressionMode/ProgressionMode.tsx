import { KeyPalette } from './KeyPalette';
import { ProgressionTimeline } from './ProgressionTimeline';
import { SlotDetail } from './SlotDetail';

export function ProgressionMode() {
  return (
    <div className="space-y-3">
      <KeyPalette />
      <ProgressionTimeline />
      <SlotDetail />
    </div>
  );
}
