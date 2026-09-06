# Presentation is Tutor-composed within product-owned contracts

The Tutor composes each teaching surface, but only from primitives the product
defines. Each Workspace kind owns a closed vocabulary of named Blocks and a
static table of what each Block can do; the Tutor cannot grant a Block an
ability or introduce a Block outside the vocabulary. Within that, the Tutor
chooses which Blocks to show, how to configure them, which layout Pattern to
use, and which element is focal.

This supersedes ADR-0004's composition model. `block.sources[]`, the frontend
adapter, `BLOCK_ACCEPTS` as the model, and the free `composition` grid are
removed. The backend still resolves all musical data — the Tutor names a
Block's subject and never fabricates fret positions or tunings.

Three layers stay distinct: capability (product, fixed by Workspace kind ×
Block kind), configuration (Tutor, within a Block's contract, with a few
mechanical view nudges left to the learner as ephemeral overrides), and
composition (Tutor, validated).

Every Composition has exactly one focal element per level, drawn from a closed
set of Patterns, with at most one level of nesting. The renderer produces real
visual hierarchy — the focal element dominates by size and position; a flat
grid of equal cards is not a valid rendering. This, together with two focused
Workspace kinds (ADR-0005), is what makes "the Tutor composes the page" produce
a teaching surface rather than the widget pile the single ConceptWorkspace
became.

A Composition belongs to its Tutor Turn, not to any Working Draft or Artifact.
Revisiting a turn restores its surface; saved music never carries a layout. The
live surface is a pointer to a turn — the latest by default, moved by Restore —
so there is never a second stored copy of the presentation.
