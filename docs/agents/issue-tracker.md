# Issue tracker: GitHub

Specs and tickets live in this repository's GitHub Issues. Use the `gh` CLI
from this checkout so the remote determines the repository.

## Conventions

- Title parent specifications `Spec: …` and apply `ready-for-agent` when the
  specification is settled.
- Publish implementation tickets as GitHub sub-issues of their parent spec.
- Use GitHub's native `blocked_by` dependencies for ticket ordering.
- Read the complete issue body and comments before acting on it.
- Pull requests are not an incoming triage surface for this solo project.

When a skill says to publish to the issue tracker, create or update a GitHub
issue. When it asks for a ticket, fetch the issue body, comments, labels,
sub-issues, and dependency state.
