import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { hearVoicing } from './voicingAudio';
import { VoicingComparison } from './VoicingComparison';
import type { ProgressionArtifact, TutorFocus, VoicingProposal, V2Branch } from '../types/v2';
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
  const [candidates, setCandidates] = useState<VoicingProposal[]>([]);
  const [comparison, setComparison] = useState<VoicingProposal | null>(null);
  const [tutorFocus, setTutorFocus] = useState<TutorFocus | null>(null);
  const [applying, setApplying] = useState(false);
  const [saved, setSaved] = useState(false);
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
      setComparison(null);
      setTutorFocus(null);
      onBranchChange(await apiClient.updateV2Branch(sessionId, branch.id, {
        selection: { type: 'progression_chord', index },
        focus: { type: 'progression_chord', index },
      }));
    } catch (err) {
      setError(String(err));
    }
  };

  if (!artifact) return error ? <p role="alert">{error}</p> : <p role="status">Loading progression…</p>;
  const selectedChord = artifact.payload.chords[selectedIndex];
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
            if (chord?.voicing) hearVoicing(chord);
          }}
          disabled={!artifact.payload.chords[selectedIndex]?.voicing}
          className="min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Hear selected chord
        </button>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Voicing saved. Reopening this progression restores the exact shape and tuning.</p>}
        {selectedChord && <VoicingComparison active={selectedChord} comparison={comparison} focus={tutorFocus} />}
        {candidates.length > 0 && <section aria-label="Voicing candidates">
          <h3 className="mb-2 text-sm font-bold">Try another voicing</h3>
          <div className="flex snap-x gap-3 overflow-x-auto pb-3">
            {candidates.map((candidate, index) => (
              <article key={index} data-testid="voicing-candidate" className="w-52 shrink-0 snap-start rounded-lg border p-3" style={{ background: 'var(--card-bg)', borderColor: 'var(--border-primary)' }}>
                <h4 className="text-sm font-bold">{candidate.label}</h4>
                <p className="text-xs">Candidate · chord {candidate.chord_index + 1}</p>
                <PhysicalChordDiagram positions={candidate.chord.voicing ?? []} tuning={candidate.chord.tuning ?? 'unknown'} label={candidate.label} />
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" aria-label={`Hear ${candidate.label}`} className="min-h-11 rounded border px-2" onClick={() => hearVoicing(candidate.chord)}>Hear</button>
                  <button type="button" aria-label={`Compare ${candidate.label}`} aria-pressed={comparison === candidate} className="min-h-11 rounded border px-2" onClick={async () => { await selectChord(candidate.chord_index); setComparison(candidate); }}>Compare</button>
                  <button type="button" aria-label={`Apply ${candidate.label}`} className="min-h-11 rounded border px-2" disabled={applying || candidate.artifact_id !== artifact.id || candidate.expected_updated_at !== artifact.updated_at} onClick={async () => {
                    setApplying(true); setError(null); setSaved(false);
                    try {
                      setArtifact(await apiClient.applyVoicing(candidate));
                      setSaved(true); setComparison(null);
                    } catch (err) { setError(String(err)); }
                    finally { setApplying(false); }
                  }}>Apply</button>
                </div>
                {candidate.expected_updated_at !== artifact.updated_at && <p className="mt-2 text-xs">Progression changed. Ask for fresh candidates to apply.</p>}
              </article>
            ))}
          </div>
        </section>}
      </main>
      <TutorChat
        sessionId={sessionId}
        branchId={branch.id}
        tutorThreadId={branch.tutor_thread_id}
        onFocusChange={setTutorFocus}
        onVoicingCandidates={setCandidates}
        emptyMessage="Ask about this progression."
      />
    </div>
  );
}
