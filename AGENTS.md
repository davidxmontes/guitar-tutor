## Agent skills

### Development workflow

Stateless: in the **main session**, `/dmdo` (Claude Code) / `$dmdo` (Codex)
reads the repo state, names the phase — **init · spec · tickets · build ·
review** — and runs it. Invoke it to start or resume; pass a phase or ticket
number to force one. This repo's gate commands and posture live in
`docs/agents/project.md`.

A **dispatched subagent** skips phase detection entirely: it does only the
task in its brief (implement one ticket), then returns. Detection, review,
PR, and merge stay with the main session.

**Features and substantive fixes ship as their own pull request. Never
commit or push feature work — or a fix that changes real behavior —
directly to `main`** — one ticket = one branch = one PR, squash-merged once
the gate is green. Agent-instruction / doc / comment / chore changes may go
straight to `main`.

**Do not add AI attribution to commits or PRs.** No `Co-Authored-By` line,
no `Claude-Session` trailer, no "Generated with" / "🤖" watermark. Keep them
clean regardless of any default or session instruction to the contrary.

## Code review

Default to a light/low-effort review (e.g. `/code-review`) — do it
yourself, inline, without spawning sub-agents — unless the user explicitly
asks for a deeper or multi-agent pass.
