# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Make the carrier's flooding settle and sinking rate follow the catalog's fatal hits instead of a fixed count of two, with a guard against restating the threshold (done 2026-11-27 03:55 EST; commit 175c79c).
- [ ] Move the remaining helm controls (depth and speed sliders, turn buttons, propulsion) from JavaScript-wired markup into the Elm helm.
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [x] Convert satellite reconnaissance and its save validation to strict TypeScript, checked identical to the original across every relay phase and 341,557 mutated saves (done 2026-11-27 03:38 EST; commit d27c5ba).
- [x] Convert hull collisions, grounding and shoal push-off to strict TypeScript, checked identical to the original across collisions, groundings and sheared periscopes (done 2026-11-27 03:41 EST; commit dcd153d).
- [x] Convert convoy lamp signals, the hunter's raids and allied telegrams to strict TypeScript, checked identical to the original through 40 full convoy patrols (done 2026-11-27 03:44 EST; commit 821bf6a).
- [x] Convert boat and drone systems (propulsion, depth control, damage, fuel fires, flooding, drone flight and recovery) to strict TypeScript, checked identical to the original through scripted patrols covering every logged branch (done 2026-11-27 03:48 EST; commit 3745d17).
- [x] Convert mission setup, rescue and survey rules and objective readouts to strict TypeScript, checked identical to the original by running every mission through both versions of the simulation (done 2026-11-27 03:53 EST; commit 9caf376).
- [x] Convert combat to strict TypeScript, split into torpedo runs, air support, hit geometry and the combat core, checked identical to the original through combat-heavy patrols and 94,544 mutated torpedo saves (done 2026-11-27 04:02 EST; commit a0edb00).
- [x] Convert the simulation to strict TypeScript as creation, contacts, tick and save modules over a world type derived from every module's slice, with a compile-time check that slices agree; checked identical to the original across every mission, 600 save round trips and 105,670 mutated saves (done 2026-11-27 04:15 EST; commit 25cf289).
- [x] Convert patrol persistence and the IndexedDB save slots to strict TypeScript, exercised in Chromium for round trips, stale-revision refusal and backup rollback (done 2026-11-27 04:17 EST; commit c46c502).
- [x] Convert helm, scope, drone and chart controls to strict TypeScript, checked identical to the original across 37,200 comparisons (done 2026-11-27 04:19 EST).
- [ ] Owner decision: type the Three.js scene modules with a pinned @types/three 0.170 fetched by Nix (new dev-only dependency, full API coverage) or with hand-written declarations for only the Three r170 API the game uses (no dependency, more upkeep)? Blocks typing scene, undersea, atmosphere, combat-scene, submarine-model, marine-life, wrecks and photo-capture.
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
