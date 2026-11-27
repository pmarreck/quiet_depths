# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Move reconnaissance photo framing and the seeded photograph goal into the Elm mission definition (done 2026-11-27 03:08 EST; commit 34c206b).
- [x] Move the carrier’s fatal direct-hit count into the Elm mission definition, shared by the briefing and carrier rules (done 2026-11-27 03:10 EST; commit 5a3fb49).
- [x] Move the standard and longer patrol windows and the protected-transit search timing into the Elm patrol definition (done 2026-11-27 03:13 EST; commit 381d117).
- [x] Move rescue survivor counts and casualty pacing into the Elm rescue criteria (done 2026-11-27 03:16 EST; commit 5e48486).
- [x] Move the surface casualty’s settling, foundering and loss depth into the Elm rescue criteria (done 2026-11-27 03:18 EST; commit 3b5f2d9).
- [x] Move passing-traffic odds and the holiday restraint on hostile initiative into the Elm patrol definition (done 2026-11-27 03:20 EST; commit 418b4d6).
- [x] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks. Answer: every objective's criteria, briefing numbers, patrol windows, transit timing and encounter odds now come from Elm, with characterization, mutation and document-drift tests; combat and AI tuning remains under the simulation item (done 2026-11-27 03:21 EST).
- [ ] Move the remaining helm controls (depth and speed sliders, turn buttons, propulsion) from JavaScript-wired markup into the Elm helm.
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [x] Convert the shared mechanics, debrief and loss-screen modules to strict TypeScript (done 2026-11-27 03:24 EST; commit 1a7ef42).
- [x] Convert the photo archive, vehicle status, seafloor surface and pressure modules to strict TypeScript (done 2026-11-27 03:25 EST; commit 7b40085).
- [x] Convert the service record, acoustics and contact track-estimate modules to strict TypeScript (done 2026-11-27 03:28 EST).
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
