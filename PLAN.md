# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [x] Fix torpedoes that veer off and search instead of running to a selected target; debug from the exported convoy save with a regression that fails on r83 (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 01:03 EST).
- [ ] Show Install Game only on installable touch devices and never on desktop (context: docs/plan_context/owner-feedback-2026-11-27.md).
- [ ] Hide keyboard hints and shortcut remapping on touch-only devices, keeping the touch ROV inversion setting (context: docs/plan_context/owner-feedback-2026-11-27.md).
- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [ ] Move wreck-survey completion criteria into the Elm mission definition, shared by the briefing, rules, progress text and ROV photos.
- [ ] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks.
- [ ] Rebuild the desktop helm in Elm: controls only on Periscope & Controls and ROV, vertical speed and depth, heading-up compass with drag-to-steer rim (context: docs/plan_context/owner-feedback-2026-11-27.md).
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## New gameplay

- [ ] Let the sub rest on the seafloor to reduce detection, with touchdown damage by descent rate and hull wear when moving while bottomed (context: docs/plan_context/owner-feedback-2026-11-27.md).
- [ ] Add TorpedoCam, an Orbit-dependent option to follow the player’s torpedoes in the water (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
