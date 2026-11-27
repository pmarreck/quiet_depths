# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [x] Restore the boat panel’s status dot, lost since the hull-collision update, now drawn in the status color (green, gold or red), confirmed at 4 × 4 px in Chromium for nominal, flooding, outer-hull and fuel-fire patrols (done 2026-11-27 09:08 EST; commit 7b2dccf).
- [x] Color the boat status line and dot by severity, owner rule “red for bad news”: red for fuel fire, fuel leak, flooding and pressure hull damage; gold for outer hull and subsystem damage; damage control takes the color of the worst fault it is working on; confirmed for 11 fault patrols in Chromium (done 2026-11-27 09:20 EST).
- [ ] Ask “End mission?” on entering extraction surfaced before the objective is complete, scoring per-mission partial credit after owner review of the draft rules (context: docs/plan_context/owner-feedback-2026-11-27.md).

## Elm migration

- [x] Stage: render the drone bay panel from Elm, which owns the lost, stowed and outside advice, matching the previous build on nine resumed drone states and the briefing placeholder in Chromium (done 2026-11-27 05:16 EST; commit 7b0c272).
- [x] Stage: render the station strip and helm caption from Elm, which owns the station status and helm owner, matching the previous build on eleven resumed patrols (all five statuses, all four helm captions) and the briefing placeholder in Chromium (done 2026-11-27 05:20 EST; commit ff91df9).
- [x] Stage: render the captain's log from Elm as a keyed list, matching the previous build's entries, count and scrolling (at the top and scrolled) in Chromium; the control-lookup test now also accepts Elm-rendered ids and rejects ids defined in both (done 2026-11-27 05:25 EST; commit 9ba27f1).
- [x] Stage: render the mission block from Elm, which owns the pickup and return-home overrides and the title layout, matching the previous build for all 12 missions under way, in extraction and at pickup, and the briefing placeholder, in Chromium (done 2026-11-27 05:34 EST; commit 1c85431).
- [x] Stage: render the rescue and survey operation card from Elm with a guarded order table whose enabling rules are pinned by test, matching the previous build on 16 readings (unconfirmed and located sites, on station, surface rescue, survey, completed, each order's toast, orbit) in Chromium (done 2026-11-27 05:37 EST; commit 5372654).
- [x] Stage: render the bottom bar's suspicion, self-noise and clearance readouts from Elm, which owns the red-above-30% rule, matching the previous build at 0, 30, 31 and 85% suspicion, hidden suspicion and the briefing placeholder in Chromium (done 2026-11-27 05:42 EST; commit 9f3d799).
- [x] Stage: render the battery, oxygen and fuel gauges from Elm, which owns the red-below-20% rule, matching the previous build on full, low, damaged-store and empty patrols and the briefing placeholder in Chromium (done 2026-11-27 05:44 EST; commit c00eb2e).
- [x] Stage: render torpedo control (tubes, run limit, launch, target hint, running torpedoes) from Elm with guarded orders and a held run setting, matching the previous build on 22 readings in Chromium; the neutral and probable-friendly hints are covered by tests only (done 2026-11-27 05:53 EST; commit f416c32).
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [ ] Owner decision: once the remaining game UI is in Elm, should the simulation (now strict TypeScript with typed world slices and Node tests) also move to Elm, or stay TypeScript with Elm owning the rules catalog and the UI? Moving it is a large rewrite with frame-time and save-compatibility risk; UI stages continue either way.
- [ ] Owner decision: type the Three.js scene modules with a pinned @types/three 0.170 fetched by Nix (new dev-only dependency, full API coverage) or with hand-written declarations for only the Three r170 API the game uses (no dependency, more upkeep)? Blocks typing scene, undersea, atmosphere, combat-scene, submarine-model, marine-life, wrecks and photo-capture.
- [ ] Migrate the remaining first-party browser code to strict TypeScript: the Three.js scene modules and app.js, which imports them, once the Three.js typing question above is answered (simulation, audio, storage and UI helpers are done).

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
