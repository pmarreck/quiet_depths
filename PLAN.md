# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Render the helm's propulsion group (electric, diesel, routing, silent running) from Elm, with a test that every order it sends has a guarded handler (done 2026-11-27 04:29 EST; commit 81b23a6).
- [x] Render the helm's depth axis (readout, slider, presets) from a reusable Elm HelmAxis view whose slider orders carry sequence numbers, matching the previous build's pointer, keyboard and orbit behavior in Chromium (done 2026-11-27 04:38 EST; commit e836965).
- [x] Render the helm's speed axis from the shared Elm HelmAxis view beside the telegraph, matching the previous build's telegraph, keyboard, pointer detent, silent, drone and orbit behavior in Chromium apart from live actual speed (done 2026-11-27 04:42 EST; commit a917f61).
- [x] Move the remaining helm controls (heading slider and turn buttons) into the shared Elm HelmAxis view beside the compass, matching the previous build's turn, keyboard, compass, drone and orbit behavior and layout in Chromium (done 2026-11-27 04:47 EST; commit 97da9b3).
- [x] Stage: render the soundings strip from Elm, which owns the clearance advice as an exhaustive type, matching the previous build through all four clearance levels and the drone label in Chromium (done 2026-11-27 04:56 EST; commit b50f422).
- [x] Stage: render the boat condition panel (hull, damage status, damage control, subsystems, buoyancy) from Elm, which owns the fault priority and colors, matching the previous build on 15 resumed fault patrols and the briefing placeholder in Chromium (done 2026-11-27 05:03 EST; commit 6c7bcf0).
- [x] Build the Elm panels' per-frame readings in a typed TypeScript module with behavioral Node tests (mutation-checked), shrinking app.js, with all five panel comparisons unchanged in Chromium (done 2026-11-27 05:12 EST; commit 960aa9f).
- [x] Stage: render the drone bay panel from Elm, which owns the lost, stowed and outside advice, matching the previous build on nine resumed drone states and the briefing placeholder in Chromium (done 2026-11-27 05:16 EST; commit 7b0c272).
- [x] Stage: render the station strip and helm caption from Elm, which owns the station status and helm owner, matching the previous build on eleven resumed patrols (all five statuses, all four helm captions) and the briefing placeholder in Chromium (done 2026-11-27 05:20 EST).
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [x] Convert the sound system to strict TypeScript, exercised in Chromium through a combat patrol, alarms and the loss implosion (done 2026-11-27 04:24 EST; commit aa62dee).
- [ ] Owner decision: type the Three.js scene modules with a pinned @types/three 0.170 fetched by Nix (new dev-only dependency, full API coverage) or with hand-written declarations for only the Three r170 API the game uses (no dependency, more upkeep)? Blocks typing scene, undersea, atmosphere, combat-scene, submarine-model, marine-life, wrecks and photo-capture.
- [ ] Migrate the remaining first-party browser code to strict TypeScript: the Three.js scene modules and app.js, which imports them, once the Three.js typing question above is answered (simulation, audio, storage and UI helpers are done).

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
