import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { playChord } from '../utils/audio';
import type { ProgressionArtifact, V2Branch } from '../types/v2';
import { PhysicalChordDiagram } from './PhysicalChordDiagram';
import { TutorChat } from './TutorChat';

function symbol(root: string, quality: string) {
  return `${root}${quality === 'major' ? '' : quality}`;
}

export function ProgressionWorkspace({ sessionId, branch, onBranchChange }: {
  sessionId: string;
  branch: V2Branch;
  onBranchChange: (branch: V2Branch) => void;
}) {
  const [artifact, setArtifact] = useState<ProgressionArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedIndex = branch.selection?.type === 'progression_chord' && typeof branch.selection.index === 'number'
    ? branch.selection.index
    : 0;

  useEffect(() => {
    if (!branch.current_artifact_id) return;
    let cancelled = false;
    apiClient.getProgression(branch.current_artifact_id)
      .then((loaded) => { if (!cancelled) setArtifact(loaded); })
      .catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [branch.current_artifact_id]);

  const selectChord = async (index: number) => {
    try {
      onBranchChange(await apiClient.updateV2Branch(sessionId, branch.id, {
        selection: { type: 'progression_chord', index },
        focus: { type: 'progression_chord', index },
      }));
    } catch (err) {
      setError(String(err));
    }
  };

  if (error) return <p role="alert">{error}</p>;
  if (!artifact) return <p role="status">Loading progression…</p>;
  const sourceTitle = typeof artifact.payload.inspired_by?.artifact_title === 'string'
    ? artifact.payload.inspired_by.artifact_title
    : null;

  return (
    <div data-testid="progression-workspace" className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <main className="min-w-0 flex-1 space-y-5">
        <header className="border-b pb-4" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent-700)' }}>Progression</p>
          <h2 className="text-2xl font-bold">{artifact.payload.title}</h2>
          {sourceTitle && <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Inspired by {sourceTitle}</p>}
        </header>

        {artifact.payload.chords.length === 0 ? (
          <p role="status">This progression has no chords yet.</p>
        ) : (
          <section aria-label="Progression sequence">
            <h3 className="mb-2 text-sm font-bold">Chord sequence</h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {artifact.payload.chords.map((chord, index) => {
                const label = symbol(chord.root, chord.quality);
                return (
                  <button
                    key={`${label}-${index}`}
                    type="button"
                    data-testid="progression-chord"
                    aria-pressed={selectedIndex === index}
                    onClick={() => selectChord(index)}
                    className="min-h-11 min-w-32 flex-shrink-0 rounded-lg border p-3 text-left"
                    style={{
                      borderColor: selectedIndex === index ? 'var(--accent-500)' : 'var(--border-primary)',
                      background: selectedIndex === index ? 'var(--accent-50)' : 'var(--card-bg)',
                    }}
                  >
                    <strong className="block text-sm">{label}</strong>
                    {chord.voicing ? (
                      <PhysicalChordDiagram positions={chord.voicing} tuning={chord.tuning ?? 'unknown'} label={label} />
                    ) : (
                      <span className="mt-2 block text-xs" style={{ color: 'var(--text-muted)' }}>No voicing selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={() => {
            const chord = artifact.payload.chords[selectedIndex];
            if (chord?.voicing) playChord(chord.voicing);
          }}
          disabled={!artifact.payload.chords[selectedIndex]?.voicing}
          className="min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Hear selected chord
        </button>
      </main>
      <TutorChat
        sessionId={sessionId}
        branchId={branch.id}
        tutorThreadId={branch.tutor_thread_id}
        onFocusChange={() => {}}
        emptyMessage="Ask about this progression."
      />
    </div>
  );
}
