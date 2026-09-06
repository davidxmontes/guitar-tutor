# V2 exploration is two focused workspace kinds

Musical exploration in V2 is carved into two Workspace kinds, Harmony and
Progression, each deeply supporting one musical job. Harmony explores harmonic
vocabulary — a tonal centre, the scales and chords it implies, chord
construction, voicings, and fretboard relationships — plus a Scratch Sequence
for auditioning chords together. Progression develops chord sequences over
time: order, movement, alternatives, timing, assigned voicings, voice leading,
and comparison. A guitarist recognises both jobs without knowing the
architecture exists.

This supersedes ADR-0001. The single composable ConceptWorkspace, where the
Tutor freely combined generic Blocks over one uniform model, is removed: one
undifferentiated surface with no enforced hierarchy produced a pile of widgets
rather than a teaching experience. `concept` as a Workspace kind, the
ConceptStudy Artifact, and the ConceptWorkspace payload are deleted with no
converter; existing saved ConceptStudy artifacts become unsupported.

The boundary between the two kinds is a rule, not a suggestion. Harmony
assembles and auditions harmony; Progression develops it. Harmony's Scratch
Sequence may order chords only to hear them — no durations, no assigned
voicings, no variations. Voicings are explored in Harmony and assigned to a
sequence only in Progression. Crossing that line is the Develop gesture: a
Scratch Sequence becomes a new Progression idea, carrying a frozen snapshot of
where it came from.

Harmony keeps a ScaleFocus / ChordFocus seam internally — which module owns the
primary surface is a function of the current Focus kind — so a later split into
separate `scale` and `chord` kinds is a reorganisation, not a rewrite. Phrase,
Rhythm, and Song are recognised as future kinds and deliberately not built now;
three kinds is enough to prove the model, and adding a fourth should be boring.
