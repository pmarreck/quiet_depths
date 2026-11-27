# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Render the helm's propulsion group (electric, diesel, routing, silent running) from Elm, with a test that every order it sends has a guarded handler (done 2026-11-27 04:29 EST; commit 81b23a6).
- [x] Render the helm's depth axis (readout, slider, presets) from a reusable Elm HelmAxis view whose slider orders carry sequence numbers, matching the previous build's pointer, keyboard and orbit behavior in Chromium (done 2026-11-27 04:38 EST; commit e836965).
- [x] Render the helm's speed axis from the shared Elm HelmAxis view beside the telegraph, matching the previous build's telegraph, keyboard, pointer detent, silent, drone and orbit behavior in Chromium apart from live actual speed (done 2026-11-27 04:42 EST; commit a917f61).
- [x] Move the remaining helm controls (heading slider and turn buttons) into the shared Elm HelmAxis view beside the compass, matching the previous build's turn, keyboard, compass, drone and orbit behavior and layout in Chromium (done 2026-11-27 04:47 EST).
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [x] Convert the simulation to strict TypeScript as creation, contacts, tick and save modules over a world type derived from every module's slice, with a compile-time check that slices agree; checked identical to the original across every mission, 600 save round trips and 105,670 mutated saves (done 2026-11-27 04:15 EST; commit 25cf289).
- [x] Convert patrol persistence and the IndexedDB save slots to strict TypeScript, exercised in Chromium for round trips, stale-revision refusal and backup rollback (done 2026-11-27 04:17 EST; commit c46c502).
- [x] Convert helm, scope, drone and chart controls to strict TypeScript, checked identical to the original across 37,200 comparisons (done 2026-11-27 04:19 EST; commit 2c7114a).
- [x] Convert patrol notices, sonar layout and contact rows to strict TypeScript, checked identical to the original across 48,310 comparisons (done 2026-11-27 04:20 EST; commit 8f26661).
- [x] Convert the crew's mess-deck ambience to strict TypeScript, with its voice clips verified loading in Chromium (done 2026-11-27 04:22 EST; commit fdd5527).
- [x] Convert the sound system to strict TypeScript, exercised in Chromium through a combat patrol, alarms and the loss implosion (done 2026-11-27 04:24 EST; commit aa62dee).
- [ ] Owner decision: type the Three.js scene modules with a pinned @types/three 0.170 fetched by Nix (new dev-only dependency, full API coverage) or with hand-written declarations for only the Three r170 API the game uses (no dependency, more upkeep)? Blocks typing scene, undersea, atmosphere, combat-scene, submarine-model, marine-life, wrecks and photo-capture.
- [ ] Migrate the remaining first-party browser code to strict TypeScript: the Three.js scene modules and app.js, which imports them, once the Three.js typing question above is answered (simulation, audio, storage and UI helpers are done).

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
