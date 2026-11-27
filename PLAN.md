# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Move the remaining helm controls (heading slider and turn buttons) into the shared Elm HelmAxis view beside the compass, matching the previous build's turn, keyboard, compass, drone and orbit behavior and layout in Chromium (done 2026-11-27 04:47 EST; commit 97da9b3).
- [x] Stage: render the soundings strip from Elm, which owns the clearance advice as an exhaustive type, matching the previous build through all four clearance levels and the drone label in Chromium (done 2026-11-27 04:56 EST; commit b50f422).
- [x] Stage: render the boat condition panel (hull, damage status, damage control, subsystems, buoyancy) from Elm, which owns the fault priority and colors, matching the previous build on 15 resumed fault patrols and the briefing placeholder in Chromium (done 2026-11-27 05:03 EST; commit 6c7bcf0).
- [x] Build the Elm panels' per-frame readings in a typed TypeScript module with behavioral Node tests (mutation-checked), shrinking app.js, with all five panel comparisons unchanged in Chromium (done 2026-11-27 05:12 EST; commit 960aa9f).
- [x] Stage: render the drone bay panel from Elm, which owns the lost, stowed and outside advice, matching the previous build on nine resumed drone states and the briefing placeholder in Chromium (done 2026-11-27 05:16 EST; commit 7b0c272).
- [x] Stage: render the station strip and helm caption from Elm, which owns the station status and helm owner, matching the previous build on eleven resumed patrols (all five statuses, all four helm captions) and the briefing placeholder in Chromium (done 2026-11-27 05:20 EST; commit ff91df9).
- [x] Stage: render the captain's log from Elm as a keyed list, matching the previous build's entries, count and scrolling (at the top and scrolled) in Chromium; the control-lookup test now also accepts Elm-rendered ids and rejects ids defined in both (done 2026-11-27 05:25 EST; commit 9ba27f1).
- [x] Stage: render the mission block from Elm, which owns the pickup and return-home overrides and the title layout, matching the previous build for all 12 missions under way, in extraction and at pickup, and the briefing placeholder, in Chromium (done 2026-11-27 05:34 EST; commit 1c85431).
- [x] Stage: render the rescue and survey operation card from Elm with a guarded order table whose enabling rules are pinned by test, matching the previous build on 16 readings (unconfirmed and located sites, on station, surface rescue, survey, completed, each order's toast, orbit) in Chromium (done 2026-11-27 05:37 EST; commit 5372654).
- [x] Stage: render the bottom bar's suspicion, self-noise and clearance readouts from Elm, which owns the red-above-30% rule, matching the previous build at 0, 30, 31 and 85% suspicion, hidden suspicion and the briefing placeholder in Chromium (done 2026-11-27 05:42 EST).
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [ ] Owner decision: type the Three.js scene modules with a pinned @types/three 0.170 fetched by Nix (new dev-only dependency, full API coverage) or with hand-written declarations for only the Three r170 API the game uses (no dependency, more upkeep)? Blocks typing scene, undersea, atmosphere, combat-scene, submarine-model, marine-life, wrecks and photo-capture.
- [ ] Migrate the remaining first-party browser code to strict TypeScript: the Three.js scene modules and app.js, which imports them, once the Three.js typing question above is answered (simulation, audio, storage and UI helpers are done).

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
