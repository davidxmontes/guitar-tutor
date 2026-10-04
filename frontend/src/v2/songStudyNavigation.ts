const SECTION_CHUNK_SIZE = 8;

export type SongSection = { label: string; startIndex: number; endIndex: number };

export function buildSongSections(measures: Array<{ marker?: { text?: string } | null }>): SongSection[] {
  const markers = measures
    .map((measure, index) => ({ index, label: measure.marker?.text }))
    .filter((marker): marker is { index: number; label: string } => Boolean(marker.label));

  if (!markers.length) {
    const sections: SongSection[] = [];
    for (let startIndex = 0; startIndex < measures.length; startIndex += SECTION_CHUNK_SIZE) {
      const endIndex = Math.min(startIndex + SECTION_CHUNK_SIZE, measures.length) - 1;
      sections.push({ label: `Measures ${startIndex + 1}–${endIndex + 1}`, startIndex, endIndex });
    }
    return sections;
  }

  const sections: SongSection[] = [];
  if (markers[0].index > 0) {
    sections.push({ label: `Measures 1–${markers[0].index}`, startIndex: 0, endIndex: markers[0].index - 1 });
  }
  markers.forEach((marker, index) => {
    sections.push({
      label: marker.label,
      startIndex: marker.index,
      endIndex: (markers[index + 1]?.index ?? measures.length) - 1,
    });
  });
  return sections;
}

export function selectMeasureRange(anchor: number | null, measureIndex: number, extend: boolean) {
  if (extend && anchor !== null) {
    return { start: Math.min(anchor, measureIndex), end: Math.max(anchor, measureIndex), anchor: null };
  }
  return { start: measureIndex, end: measureIndex, anchor: measureIndex };
}

export function defaultPassageLabel(section: string, startMeasure: number, endMeasure: number) {
  const measures = ` · M${startMeasure}${endMeasure > startMeasure ? `–${endMeasure}` : ''}`;
  const available = 120 - measures.length;
  const name = section.length > available ? `${section.slice(0, available - 1).trimEnd()}…` : section;
  return `${name}${measures}`;
}
