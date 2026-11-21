# Quiet Depths code review

Reviewed 2026-11-21 by Codex. The starting revision was
`541c0d3eccb68f2646f79bc0a80efb7c2396f3ad` on a clean checkout. The review
traced the start and resume flows, saved patrols and photo storage, mobile
input and dialog layout, the underwater camera and lighting, and offline
packaging. The changes below address findings from that revision.

## Findings

### DCR-001 — A photo write could prevent autosave

**Medium severity, high confidence.** `persistPatrol` in `src/persistence.js`
saved the service record and photo archive before saving or clearing the live
patrol. A write rejected by the storage quota skipped that patrol operation.
The player could lose recent progress or find a completed patrol offered again.

An injected `QuotaExceededError` reproduced the problem. The patrol is now
saved first, and a terminal patrol is removed first. The two secondary writes
are independent and report partial failure. Tests inject failures into both
secondary writes, verify the main save independently, and confirm a failed
primary write preserves the previous snapshot.

[Persistence code](src/persistence.js#L10)

### DCR-002 — The briefing could offer to continue a finished patrol

**Medium severity, high confidence.** After dismissing the result dialog,
opening the briefing through the brand link used elapsed time to decide
whether to show Continue Saved Patrol. A finished patrol has elapsed time
but cannot accept helm orders. The continue action then reused that terminal
state.

Both the button and the action now require a resumable patrol. A Chromium
smoke test resumed a near-expiry patrol offline, let it expire, then reopened
the briefing and verified that Continue was hidden and could not resume it.
The unit suite also covers active and terminal states for both saved and
current patrols.

[Briefing and start actions](src/app.js#L91)

### DCR-003 — Invalid seed text could start a different patrol

**Low severity, high confidence.** The optional seed field declared a decimal
pattern, but the Begin Patrol action bypassed form validation. Unsigned bit
coercion converted malformed text to zero and wrapped values above
`4294967295`. A player trying to replay a mission could silently get a
different layout.

The start action now validates the exact 32-bit unsigned decimal range.
Invalid input leaves the briefing open and identifies the field. Tests cover
zero, the upper bound, empty input, and malformed or overflowing values.

[Seed parser](src/missions.js#L16)

### DCR-004 — Modal dialogs had no accessible names

**Low severity, high confidence.** The briefing, field guide, settings, photo,
and result dialogs contained headings without using them as their accessible
names. Each dialog now references its own heading, including the dynamic
titles on the photo and result dialogs. A markup check covers all five.

[Dialog markup](src/index.html#L62)

## Coverage and limits

- Traced the JavaScript-to-Elm mission picker, dialog controls, save and
  restore, photo storage, held input cancellation, and the service worker
  precache from the Nix output. Reviewed explicit lifecycle and error paths.
- Checked the underwater renderer's camera pose, shared wave geometry, color
  attenuation, and separation of the visual model from simulation rules.
  The lighting is an approximation with no local water-clarity dataset.
- The starting `./test` passed 212 tests on Linux. The review did not cover
  every simulation balance path or each vendored dependency.
- Chromium loaded the Nix-built game, exposed the briefing heading in its
  accessibility tree, rejected an overflowing seed, and reloaded from the
  service worker while the test server returned errors. A WebGL smoke test
  rendered shallow, midwater, deep, night, and storm conditions.
- The iPhone Duo cover-screen workaround uses screen geometry and viewport
  width. The browser layout check modeled both cover widths, both inner
  orientations, inner Split View, a conventional iPhone, and a narrow
  desktop. Native iPhone Safari and its installed web-app mode remain
  hardware checks.
