import { useState, type KeyboardEvent } from 'react';
import type { V2Branch } from '../types/v2';

interface BranchNavigationProps {
  branches: V2Branch[];
  activeBranchId: string | null;
  onSelect: (branchId: string) => void;
  onClose: (branchId: string) => Promise<void>;
  onReopen: (branchId: string) => Promise<void>;
}

export function BranchNavigation({
  branches,
  activeBranchId,
  onSelect,
  onClose,
  onReopen,
}: BranchNavigationProps) {
  const [busyBranchId, setBusyBranchId] = useState<string | null>(null);
  const openBranches = branches.filter((branch) => !branch.closed);
  const closedBranches = branches.filter((branch) => branch.closed);
  const activeBranch = openBranches.find((branch) => branch.id === activeBranchId) ?? null;

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % openBranches.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + openBranches.length) % openBranches.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = openBranches.length - 1;
    else return;

    event.preventDefault();
    const next = openBranches[nextIndex];
    onSelect(next.id);
    document.getElementById(`workspace-tab-${next.id}`)?.focus();
  };

  const runBranchAction = async (branchId: string, action: (id: string) => Promise<void>) => {
    setBusyBranchId(branchId);
    try {
      await action(branchId);
    } finally {
      setBusyBranchId(null);
    }
  };

  return (
    <div className="learning-branches my-4 space-y-3">
      {openBranches.length > 0 ? (
        <>
          <div
            data-testid="v2-desktop-tabs"
            aria-label="Open workspaces"
            role="tablist"
            className="learning-branch-tabs hidden sm:flex"
          >
            {openBranches.map((branch, index) => (
              <button
                key={branch.id}
                id={`workspace-tab-${branch.id}`}
                type="button"
                role="tab"
                data-testid="v2-branch-tab"
                aria-controls={`workspace-panel-${branch.id}`}
                aria-selected={branch.id === activeBranch?.id}
                tabIndex={branch.id === activeBranch?.id ? 0 : -1}
                onClick={() => onSelect(branch.id)}
                onKeyDown={(event) => moveTabFocus(event, index)}
                className="learning-branch-tab max-w-64 truncate whitespace-nowrap"
              >
                {branch.title}
              </button>
            ))}
          </div>

          <label className="block sm:hidden">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Current workspace
            </span>
            <select
              aria-label="Current workspace"
              value={activeBranch?.id ?? ''}
              onChange={(event) => onSelect(event.target.value)}
              className="w-full"
            >
              {openBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.title}</option>)}
            </select>
          </label>

          {activeBranch && openBranches.length > 1 && (
            <div className="flex justify-end">
              <button
                type="button"
                data-testid="v2-close-active-branch"
                aria-label={`Close ${activeBranch.title}`}
                disabled={busyBranchId !== null}
                onClick={() => runBranchAction(activeBranch.id, onClose)}
                className="music-button"
              >
                {busyBranchId === activeBranch.id ? 'Closing…' : 'Close this workspace'}
              </button>
            </div>
          )}
        </>
      ) : (
        <p role="status" className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
          No workspace is open. Reopen one below to continue.
        </p>
      )}

      {closedBranches.length > 0 && (
        <section
          data-testid="v2-closed-workspaces"
          aria-labelledby="closed-workspaces-heading"
          className="rounded-xl border p-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}
        >
          <h2 id="closed-workspaces-heading" className="text-sm font-bold">Closed work</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {closedBranches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                aria-label={`Reopen ${branch.title}`}
                disabled={busyBranchId !== null}
                onClick={() => runBranchAction(branch.id, onReopen)}
                className="music-button"
              >
                {busyBranchId === branch.id ? 'Reopening…' : `Reopen ${branch.title}`}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
