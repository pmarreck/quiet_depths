# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Move rescue station keeping and team timings into the Elm mission definitions, shared by the briefings, rules and progress text (done 2026-11-27 03:03 EST; commit e8c9d1f).
- [x] Move convoy tracking range, noise and depth limits and the seeded tracking goal into the Elm mission definition (done 2026-11-27 03:06 EST; commit 5e65857).
- [x] Move reconnaissance photo framing and the seeded photograph goal into the Elm mission definition (done 2026-11-27 03:08 EST; commit 34c206b).
- [x] Move the carrier’s fatal direct-hit count into the Elm mission definition, shared by the briefing and carrier rules (done 2026-11-27 03:10 EST; commit 5a3fb49).
- [x] Move the standard and longer patrol windows and the protected-transit search timing into the Elm patrol definition (done 2026-11-27 03:13 EST; commit 381d117).
- [x] Move rescue survivor counts and casualty pacing into the Elm rescue criteria (done 2026-11-27 03:16 EST; commit 5e48486).
- [x] Move the surface casualty’s settling, foundering and loss depth into the Elm rescue criteria (done 2026-11-27 03:18 EST).
- [ ] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks.
- [x] Rebuild the desktop helm: controls only on Periscope & Controls and ROV, vertical speed and depth, heading-up Elm compass with drag-to-steer rim (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 02:46 EST; commit 1a885be).
- [ ] Move the remaining helm controls (depth and speed sliders, turn buttons, propulsion) from JavaScript-wired markup into the Elm helm.
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## New gameplay

- [x] Let the sub rest on the seafloor to reduce detection, with touchdown damage by descent rate and hull wear when moving while bottomed (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 02:55 EST; commit 52cc880).
- [x] Add TorpedoCam, an Orbit-dependent option to follow the player’s torpedoes in the water (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 02:59 EST; commit 789f3e6).

## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
