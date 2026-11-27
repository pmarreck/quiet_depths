# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [ ] Move the remaining helm controls (depth and speed sliders, turn buttons, propulsion) from JavaScript-wired markup into the Elm helm.
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [x] Convert the photo archive, vehicle status, seafloor surface and pressure modules to strict TypeScript (done 2026-11-27 03:25 EST; commit 7b40085).
- [x] Convert the service record, acoustics and contact track-estimate modules to strict TypeScript (done 2026-11-27 03:28 EST; commit 805e3a3).
- [x] Convert the weather, light and sea environment module to strict TypeScript, checked output-identical to the original across 35,876 comparisons (done 2026-11-27 03:31 EST; commit c4d9d6e).
- [x] Convert the ROV tether and patrol report modules to strict TypeScript, checked output-identical to the originals (done 2026-11-27 03:33 EST; commit 7f1b1a3).
- [x] Convert held-input tracking and hostile pursuit to strict TypeScript, checked output-identical to the originals (done 2026-11-27 03:35 EST; commit 20cd0af).
- [x] Convert satellite reconnaissance and its save validation to strict TypeScript, checked identical to the original across every relay phase and 341,557 mutated saves (done 2026-11-27 03:38 EST; commit d27c5ba).
- [x] Convert hull collisions, grounding and shoal push-off to strict TypeScript, checked identical to the original across collisions, groundings and sheared periscopes (done 2026-11-27 03:41 EST; commit dcd153d).
- [x] Convert convoy lamp signals, the hunter's raids and allied telegrams to strict TypeScript, checked identical to the original through 40 full convoy patrols (done 2026-11-27 03:44 EST; commit 821bf6a).
- [x] Convert boat and drone systems (propulsion, depth control, damage, fuel fires, flooding, drone flight and recovery) to strict TypeScript, checked identical to the original through scripted patrols covering every logged branch (done 2026-11-27 03:48 EST; commit 3745d17).
- [x] Convert mission setup, rescue and survey rules and objective readouts to strict TypeScript, checked identical to the original by running every mission through both versions of the simulation (done 2026-11-27 03:53 EST).
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
