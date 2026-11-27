# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Playtest fixes (owner feedback 2026-11-27)

- [x] Restore the boat panel’s status dot, lost since the hull-collision update, now drawn in the status color (green, gold or red), confirmed at 4 × 4 px in Chromium for nominal, flooding, outer-hull and fuel-fire patrols (done 2026-11-27 09:08 EST; commit 7b2dccf).
- [x] Color the boat status line and dot by severity, owner rule “red for bad news”: red for fuel fire, fuel leak, flooding and pressure hull damage; gold for outer hull and subsystem damage; damage control takes the color of the worst fault it is working on; confirmed for 11 fault patrols in Chromium (done 2026-11-27 09:20 EST; commit b1215ca).
- [x] Ask “End mission?” on entering extraction surfaced before the objective is complete, with per-mission partial credit from the Elm mission definitions (owner confirmed the draft rules), partial successes tallied per captain at half a success toward stars, verified in Chromium for partial, failed, declined, Esc and Sub Hunt patrols (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 09:35 EST; commit 49c8e1e).

## Elm migration

- [x] Stage: render the bottom bar's suspicion, self-noise and clearance readouts from Elm, which owns the red-above-30% rule, matching the previous build at 0, 30, 31 and 85% suspicion, hidden suspicion and the briefing placeholder in Chromium (done 2026-11-27 05:42 EST; commit 9f3d799).
- [x] Stage: render the battery, oxygen and fuel gauges from Elm, which owns the red-below-20% rule, matching the previous build on full, low, damaged-store and empty patrols and the briefing placeholder in Chromium (done 2026-11-27 05:44 EST; commit c00eb2e).
- [x] Stage: render torpedo control (tubes, run limit, launch, target hint, running torpedoes) from Elm with guarded orders and a held run setting, matching the previous build on 22 readings in Chromium; the neutral and probable-friendly hints are covered by tests only (done 2026-11-27 05:53 EST; commit f416c32).
- [ ] Move the remaining game UI to Elm in stages: deck gun and noisemaker, contacts, view header and hints, time controls, alerts, mobile helm and drawers.
- [ ] Move the simulation to Elm leaf-first, each module proven against the TypeScript by differential tests, then switch the game loop and saves (context: docs/plan_context/simulation-to-elm.md). Ported: exact arithmetic, equipment, watch warnings, debrief, seabed rest, torpedo tubes, hull design, acoustics.
- [x] Owner decision: should the simulation (now strict TypeScript) also move to Elm, or stay TypeScript with Elm owning the rules catalog and the UI? Answer: move it to Elm as well (owner, 2026-11-27 09:05), in stages alongside the remaining UI (done 2026-11-27 09:35 EST).
- [x] Owner decision: type the Three.js scene modules with a pinned @types/three fetched by Nix, or with hand-written declarations? Answer: pin @types/three through Nix (owner, 2026-11-27 09:05) (done 2026-11-27 09:35 EST).
- [x] Pin @types/three 0.170.0 and @types/webxr 0.5.20 (November 2024 releases matching the vendored Three r170) as hash-checked Nix inputs read only by the type check, and type the submarine model and wreck damage against them; a misspelled Three method or wrong argument type now fails the build (done 2026-11-27 09:50 EST; commit df393c7).
- [x] Type every Three.js scene module and model against the pinned declarations, replacing four hand-written Three stand-ins; renderers read slices of the simulation's World type, exhaustive vessel-kind guards replace loose kind strings, and every view (scope, tower, gun, ROV, orbit) renders without errors in Chromium; the typing found that the disabled sub's air leak in Undersea Rescue never rendered because nothing sets the site's flood (done 2026-11-27 09:50 EST; commit 7368722).
- [ ] Migrate app.js, the last first-party browser script, to strict TypeScript as its UI moves to Elm; its replay frames must then satisfy the scene's World parameter, which today they meet only at run time.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
