import type { V2Branch } from '../types/v2';

// Ticket #101 shell: a thin placeholder per Workspace kind. The real Harmony
// surface lands in H1, Progression in P1, the presentation runtime in T2.
export function WorkspacePlaceholder({ branch }: { branch: V2Branch }) {
  const kind = branch.active_workspace;
  const heading = kind === 'harmony' ? 'Harmony Workspace' : 'Progression Workspace';
  const blurb =
    kind === 'harmony'
      ? 'Explore a tonal centre, its scales and chords, voicings, and a Scratch Sequence.'
      : 'Develop chord sequences over time — order, movement, timing, and voice leading.';

  return (
    <section
      data-testid={`workspace-placeholder-${kind}`}
      aria-labelledby={`workspace-placeholder-heading-${branch.id}`}
      className="rounded-xl border p-6"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
    >
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        {kind}
      </p>
      <h2 id={`workspace-placeholder-heading-${branch.id}`} className="mt-1 text-xl font-black">
        {heading}
      </h2>
      <p className="mt-2 max-w-prose text-sm" style={{ color: 'var(--text-secondary)' }}>
        {blurb}
      </p>
      <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        The interactive workspace is not built yet — this is a placeholder shell.
      </p>
    </section>
  );
}
