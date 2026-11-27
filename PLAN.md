# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [x] Fix torpedoes that veer off and search instead of running to a selected target; debug from the exported convoy save with a regression that fails on r83 (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 01:03 EST; commit ba09d65).
- [x] Show Install Game only on installable touch devices and never on desktop (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 01:13 EST; commit 59c7970).
- [x] Hide keyboard hints and shortcut remapping on touch-only devices, keeping the touch ROV inversion setting (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 01:13 EST; commit 59c7970).
- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Move wreck-survey completion criteria into the Elm mission definition, shared by the briefing, rules, progress text and ROV photos (done 2026-11-27 01:24 EST; commit 2a6d92b).
- [x] Move rescue station keeping and team timings into the Elm mission definitions, shared by the briefings, rules and progress text (done 2026-11-27 03:24 EST).
- [ ] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks.
- [x] Rebuild the desktop helm: controls only on Periscope & Controls and ROV, vertical speed and depth, heading-up Elm compass with drag-to-steer rim (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 02:47 EST; commit 1a885be).
- [ ] Move the remaining helm controls (depth and speed sliders, turn buttons, propulsion) from JavaScript-wired markup into the Elm helm.
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## New gameplay

- [x] Let the sub rest on the seafloor to reduce detection, with touchdown damage by descent rate and hull wear when moving while bottomed (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 03:05 EST; commit 52cc880).
- [x] Add TorpedoCam, an Orbit-dependent option to follow the player’s torpedoes in the water (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 03:12 EST; commit 789f3e6).

## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
