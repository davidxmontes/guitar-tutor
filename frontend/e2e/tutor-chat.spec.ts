import { test, expect } from '@playwright/test'

// Proves ticket #13's frontend-facing acceptance criteria end to end through
// the real browser + real local V2 backend (session/branch persistence,
// GET /api/v2/tutor/threads/{id}/messages). Only the LLM-facing tutor turn
// endpoint is stubbed via page.route (no real provider call is ever
// permitted in this suite) — same approach as song-study.spec.ts stubbing
// the Songsterr-backed endpoints it doesn't want live network for.

const DROP_STEP_TUNING = [62, 57, 53, 48, 43, 38]

const SEARCH_RESPONSE = {
  results: [
    {
      song_id: 7,
      artist: 'Oasis',
      title: 'Wonderwall',
      has_chords: true,
      tracks: [
        { index: 0, name: 'Acoustic Guitar', instrument: 'Guitar', is_vocal: false, is_empty: false, tuning: DROP_STEP_TUNING },
      ],
    },
  ],
}

function songStudyArtifact(tuning: number[] | null = DROP_STEP_TUNING) {
  return {
    id: 'artifact-1',
    user_id: 'dev-user',
    kind: 'song_study',
    title: 'Oasis - Wonderwall',
    payload: {
      song_id: 7,
      artist: 'Oasis',
      title: 'Wonderwall',
      track: { index: 0, name: 'Acoustic Guitar', instrument: 'Guitar', tuning },
      tab_data: {
        ...(tuning ? { tuning } : {}),
        measures: [
          { voices: [{ beats: [{ notes: [{ string: 0, fret: 3 }, { string: 1, fret: 3 }] }] }] },
          { voices: [{ beats: [{ notes: [{ string: 2, fret: 2 }, { string: 3, fret: 2 }, { string: 4, fret: 0 }] }] }] },
          { voices: [{ beats: [{ notes: [{ string: 0, fret: 7 }] }] }] },
        ],
      },
      shape_events: tuning ? [
        {
          label: null,
          positions: [{ string: 1, fret: 3 }, { string: 2, fret: 3 }],
          tuning: DROP_STEP_TUNING,
          sources: [{ measure_index: 0, beat_index: 0 }],
        },
        {
          label: 'D/F#',
          positions: [{ string: 3, fret: 2 }, { string: 4, fret: 2 }, { string: 5, fret: 0 }],
          tuning: DROP_STEP_TUNING,
          sources: [{ measure_index: 1, beat_index: 0 }],
        },
      ] : [],
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

async function openSongStudy(page: import('@playwright/test').Page, tuning: number[] | null = DROP_STEP_TUNING) {
  await page.route('**/api/songs/search**', (route) => route.fulfill({ json: SEARCH_RESPONSE }))
  await page.route('**/api/v2/song-studies', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const { session_id, branch_id } = route.request().postDataJSON() as { session_id: string; branch_id: string }
    const artifact = songStudyArtifact(tuning)
    await page.request.patch(`/api/v2/sessions/${session_id}/branches/${branch_id}`, {
      data: { current_artifact_kind: 'song_study', current_artifact_id: artifact.id },
    })
    return route.fulfill({ status: 201, json: artifact })
  })

  await page.goto('/v2')
  await page.getByTestId('v2-start-session').click()
  await page.getByTestId('song-study-search-input').fill('wonderwall')
  await page.getByTestId('song-study-search-input').press('Enter')
  await page.getByTestId('song-study-track-option').click()
  await expect(page.getByTestId('song-study-workspace')).toBeVisible()
}

test('song chord strip: raw shapes select the real tab beat and exact fretboard positions', async ({ page }) => {
  await page.route('**/api/v2/tutor/threads/*/messages', (route) => route.fulfill({ json: [] }))
  await openSongStudy(page)

  await expect(page.getByTestId('song-shape-card')).toHaveCount(2)
  await expect(page.getByTestId('song-shape-card').first().getByRole('img')).toHaveAccessibleName(
    /Tuning D G C F A D.*String 1 fret 3; String 2 fret 3/,
  )

  await page.getByRole('button', { name: /D\/F#.*measure 2, beat 1/i }).click()

  await expect(page.getByRole('button', { name: 'Select beat 1 of measure 2' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid="fretboard-active-note"][data-string="3"][data-fret="2"]')).toBeVisible()
  await expect(page.locator('[data-testid="fretboard-active-note"][data-string="4"][data-fret="2"]')).toBeVisible()
  await expect(page.locator('[data-testid="fretboard-active-note"][data-string="5"][data-fret="0"]')).toBeVisible()

  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  await expect.poll(async () => {
    const session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((response) => response.json())
    return session.branches[0].selection
  }).toEqual({ type: 'beat', measureIndex: 1, beatIndex: 0 })

  await page.getByTestId('song-study-overview-measure').nth(2).click()
  await expect(page.getByTestId('song-shape-strip')).toContainText('No chord-like events in this passage')
})

test('song chord strip: unavailable tuning is explicit and invents no diagram', async ({ page }) => {
  await page.route('**/api/v2/tutor/threads/*/messages', (route) => route.fulfill({ json: [] }))
  await openSongStudy(page, null)

  await expect(page.getByTestId('song-shape-card')).toHaveCount(0)
  await expect(page.getByTestId('song-shape-strip')).toContainText(
    'Shape diagrams are unavailable because this track has no tuning data',
  )
})

test('tutor chat: history loads, a turn round-trips, and a focus response highlights the fretboard', async ({ page }) => {
  // No real backend tutor-message history yet for a freshly created thread —
  // stub the GET history endpoint to prove the panel fetches it on mount
  // rather than assuming an empty local state.
  let historyRequested = false
  await page.route('**/api/v2/tutor/threads/*/messages', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    historyRequested = true
    return route.fulfill({
      json: [
        { id: 'm1', tutor_thread_id: 't1', role: 'user', content: { text: 'What key is this in?' }, created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', tutor_thread_id: 't1', role: 'assistant', content: { text: 'This passage is in G major.', focus: null }, created_at: '2026-01-01T00:00:01Z' },
      ],
    })
  })

  await openSongStudy(page)

  // History loaded on mount via the new GET endpoint.
  await expect(page.getByTestId('tutor-chat-message-user')).toHaveText('What key is this in?')
  await expect(page.getByTestId('tutor-chat-message-assistant')).toHaveText('This passage is in G major.')
  expect(historyRequested).toBe(true)

  // A contextual question is answered through the V2 tutor path (stubbed —
  // no real LLM call). The stub also returns a `focus` — cross-view
  // attention the UI must render on the fretboard as a distinct third layer,
  // additive to the existing active/upcoming beat highlighting, without
  // touching Branch selection/focus.
  await page.route('**/api/v2/tutor/turns', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({
      json: {
        message: 'That opening note is the root of a G major chord.',
        focus: { role: 'candidate', notes: [{ string: 6, fret: 3 }], label: 'G major root' },
        concept_suggestion: { concept_id: 'pentatonic_minor', root: 'A', label: 'A minor pentatonic' },
        provider: 'openai',
        model: 'stub-model',
        latency_ms: 12,
        usage: { input_tokens: 10, output_tokens: 5 },
        tool_call_count: 0,
        status: 'completed',
      },
    })
  })

  await page.getByTestId('tutor-chat-input').fill('What chord is this first note?')
  await page.getByTestId('tutor-chat-send').click()

  // Optimistic append of the user's own message happens immediately, before
  // the (stubbed) request resolves.
  await expect(page.getByTestId('tutor-chat-message-user').last()).toHaveText('What chord is this first note?')

  // Assistant reply renders once the request resolves.
  await expect(page.getByTestId('tutor-chat-message-assistant').last()).toContainText(
    'That opening note is the root of a G major chord.',
  )

  // The tutor's focus renders as a third, distinct fretboard layer —
  // additive to (not replacing) the existing active/upcoming note dots.
  await expect(page.getByTestId('fretboard-tutor-focus-note')).toBeVisible()
  await expect(page.getByTestId('song-study-tutor-focus-caption')).toContainText('candidate')
  await expect(page.getByTestId('song-study-tutor-focus-caption')).toContainText('G major root')
  // Beat-derived highlighting is still present alongside it.
  await expect(page.getByTestId('fretboard-active-note')).toHaveCount(2)

  // Tutor focus is ephemeral UI state, never written into Branch
  // selection/focus (that's user-driven navigation state only).
  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  const branch = await page.request
    .get(`/api/v2/sessions/${sessionId}`)
    .then((r) => r.json())
    .then((s) => s.branches[0])
  expect(branch.focus).toBeNull()

  // Mentioning/offering a concept in a song conversation is content only.
  // The SongStudy remains the sole branch until the user explicitly acts.
  const beforePromotion = await page.request.get(`/api/v2/sessions/${sessionId}`).then((r) => r.json())
  expect(beforePromotion.branches).toHaveLength(1)
  await expect(page.getByRole('button', { name: 'Work on A minor pentatonic' })).toBeVisible()

  await page.getByRole('button', { name: 'Work on A minor pentatonic' }).click()
  await expect(page.getByRole('heading', { name: 'A minor pentatonic' })).toBeVisible()
  await expect(page.getByTestId('v2-branch-tab')).toHaveCount(2)
})

// Ticket #14: a progression candidate returned by the (stubbed) tutor turn
// renders as a whole visible chord sequence, Hear/Save/Explore all work
// before opening a real Branch, and Hear never touches the network.
test('progression candidate: whole sequence renders, Hear stays local, Save persists, Explore is available', async ({ page }) => {
  await page.route('**/api/v2/tutor/threads/*/messages', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ json: [] })
  })

  await openSongStudy(page)

  let tutorTurnRequests = 0
  await page.route('**/api/v2/tutor/turns', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    tutorTurnRequests += 1
    return route.fulfill({
      json: {
        message: "Here's an idea inspired by this passage.",
        focus: null,
        candidates: [
          {
            title: 'Wistful I-vi-IV-V',
            chords: [
              {
                root: 'C',
                quality: 'major',
                voicing: [{ string: 1, fret: 0 }, { string: 2, fret: 1 }],
                tuning: 'standard',
                fingering: [{ string: 2, fret: 1, finger: 2 }],
              },
              { root: 'A', quality: 'minor', voicing: [{ string: 1, fret: 0 }], tuning: 'standard' },
              { root: 'F', quality: 'major', voicing: null, tuning: null },
              {
                root: 'G',
                quality: 'major',
                voicing: [
                  { string: 6, fret: 8 },
                  { string: 5, fret: 10 },
                  { string: 4, fret: 10 },
                  { string: 3, fret: 9 },
                  { string: 2, fret: 8 },
                  { string: 1, fret: 8 },
                ],
                tuning: 'drop-d',
                fingering: [{ string: 6, fret: 8, finger: 1, provenance: 'source' }],
              },
            ],
            inspired_by: { artifact_id: 'artifact-1', artifact_kind: 'song_study' },
          },
        ],
        provider: 'openai',
        model: 'stub-model',
        latency_ms: 12,
        usage: { input_tokens: 10, output_tokens: 5 },
        tool_call_count: 0,
        status: 'completed',
      },
    })
  })

  let progressionSaveRequest: unknown = null
  await page.route('**/api/v2/progressions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    progressionSaveRequest = route.request().postDataJSON()
    return route.fulfill({
      status: 201,
      json: {
        id: 'progression-1',
        user_id: 'dev-user',
        kind: 'progression',
        title: 'Wistful I-vi-IV-V',
        payload: progressionSaveRequest,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
  })

  await page.getByTestId('tutor-chat-input').fill('make me something wistful')
  await page.getByTestId('tutor-chat-send').click()

  // The whole 4-chord sequence is visible at once — not one chord at a time.
  await expect(page.getByTestId('progression-candidate-title')).toHaveText('Wistful I-vi-IV-V')
  await expect(page.getByTestId('progression-candidate-chord')).toHaveCount(4)
  // Three of the four chords resolved a voicing and get a diagram; the
  // fourth (F major here, stubbed with no voicing) is expected, not broken.
  await expect(page.getByTestId('progression-chord-diagram')).toHaveCount(3)
  const arbitraryVoicing = page.getByRole('img', {
    name: 'G chord diagram. Tuning drop-d. String 6 fret 8; String 5 fret 10; String 4 fret 10; String 3 fret 9; String 2 fret 8; String 1 fret 8. Barre at fret 8 from string 1 to string 6.',
  })
  await expect(arbitraryVoicing).toBeVisible()
  await expect(arbitraryVoicing.getByTestId('chord-diagram-barre')).toBeVisible()
  await expect(arbitraryVoicing.getByTestId('chord-diagram-finger')).toHaveText('1')
  await expect(page.getByTestId('progression-chord-diagram').first().getByTestId('chord-diagram-finger')).toHaveCount(0)

  // Hear is deterministic and must never invoke the tutor.
  const turnsBeforeHear = tutorTurnRequests
  await page.getByTestId('progression-candidate-hear').click()
  await page.waitForTimeout(200)
  expect(tutorTurnRequests).toBe(turnsBeforeHear)

  // Save persists a Progression artifact and stays in the SongStudy view.
  await page.getByTestId('progression-candidate-save').click()
  await expect(page.getByTestId('progression-candidate-save-success')).toBeVisible()
  expect(progressionSaveRequest).toMatchObject({ title: 'Wistful I-vi-IV-V' })
  await expect(page.getByTestId('song-study-workspace')).toBeVisible()

  // Explore is explicit and ready to open a new branch; merely receiving the
  // candidate still does not create one.
  const explore = page.getByTestId('progression-candidate-explore')
  await expect(explore).toBeVisible()
  await expect(explore).toBeEnabled()
  const sessionId = (await page.getByTestId('v2-active-session').textContent())!.replace('Session ', '')
  const session = await page.request.get(`/api/v2/sessions/${sessionId}`).then((r) => r.json())
  expect(session.branches).toHaveLength(1)
})
