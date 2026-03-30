import { useMemo } from 'react';

interface ChordProViewProps {
  chordpro: string;
}

type ParsedLine =
  | { kind: 'blank' }
  | { kind: 'section'; text: string }
  | { kind: 'meta'; key: string; value: string }
  | { kind: 'lyrics'; chords?: string; lyrics: string };

function parseChordPro(chordpro: string): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  const directiveRegex = /^\{(\w+):\s*(.+)\}$/;
  const chordTokenRegex = /(\[[^\]]+\])/;

  for (const raw of chordpro.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) {
      parsed.push({ kind: 'blank' });
      continue;
    }

    const directive = trimmed.match(directiveRegex);
    if (directive) {
      const [, key, value] = directive;
      if (key.toLowerCase() === 'section') {
        parsed.push({ kind: 'section', text: value });
      } else {
        parsed.push({ kind: 'meta', key, value });
      }
      continue;
    }

    let chordLine = '';
    let lyricLine = '';
    let lyricPos = 0;

    for (const part of raw.split(chordTokenRegex)) {
      const isChord = part.startsWith('[') && part.endsWith(']');
      if (isChord) {
        const chordName = part.slice(1, -1);
        while (chordLine.length < lyricPos) chordLine += ' ';
        chordLine += `${chordName} `;
      } else {
        lyricLine += part;
        lyricPos += part.length;
      }
    }

    parsed.push({
      kind: 'lyrics',
      chords: chordLine.trimEnd() || undefined,
      lyrics: lyricLine,
    });
  }

  return parsed;
}

export function ChordProView({ chordpro }: ChordProViewProps) {
  const lines = useMemo(() => parseChordPro(chordpro), [chordpro]);

  return (
    <section
      className="rounded-xl border p-3 md:p-4"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="mb-3">
        <h3 className="text-sm md:text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          ChordPro View
        </h3>
      </div>

      <div
        className="font-mono text-[12px] leading-5 rounded-lg border p-3 max-h-[480px] overflow-auto"
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
        }}
      >
        {lines.map((line, idx) => {
          if (line.kind === 'blank') {
            return <div key={idx} className="h-3" />;
          }

          if (line.kind === 'section') {
            return (
              <div key={idx} className="py-1">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                  style={{
                    borderColor: 'var(--accent-600)',
                    color: 'var(--accent-600)',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                  }}
                >
                  {line.text}
                </span>
              </div>
            );
          }

          if (line.kind === 'meta') {
            return (
              <div key={idx} className="text-[11px] pb-1" style={{ color: 'var(--text-muted)' }}>
                {line.key}: {line.value}
              </div>
            );
          }

          return (
            <div key={idx} className="pb-1">
              {line.chords && (
                <div className="whitespace-pre" style={{ color: 'var(--accent-600)' }}>
                  {line.chords}
                </div>
              )}
              <div className="whitespace-pre">{line.lyrics}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

