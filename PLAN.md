# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).
Until the simulation cutover to Elm, every gameplay feature or fix that touches a ported module must be made in both the TypeScript and the Elm; remind the owner whenever they request one (context: docs/plan_context/simulation-to-elm.md).

## Playtest fixes (owner feedback 2026-11-27)

- [x] Color the boat status line and dot by severity, owner rule “red for bad news”: red for fuel fire, fuel leak, flooding and pressure hull damage; gold for outer hull and subsystem damage; damage control takes the color of the worst fault it is working on; confirmed for 11 fault patrols in Chromium (done 2026-11-27 09:20 EST; commit b1215ca).
- [x] Ask “End mission?” on entering extraction surfaced before the objective is complete, with per-mission partial credit from the Elm mission definitions (owner confirmed the draft rules), partial successes tallied per captain at half a success toward stars, verified in Chromium for partial, failed, declined, Esc and Sub Hunt patrols (context: docs/plan_context/owner-feedback-2026-11-27.md; done 2026-11-27 09:35 EST; commit 49c8e1e).

## Elm migration

- [ ] Move the remaining game UI to Elm in stages: deck gun and noisemaker, contacts, view header and hints, time controls, alerts, mobile helm and drawers.
- [ ] Move the simulation to Elm leaf-first, each module proven against the TypeScript by differential tests, then switch the game loop and saves (context: docs/plan_context/simulation-to-elm.md). Ported: exact arithmetic, equipment, watch warnings, debrief, seabed rest, torpedo tubes, hull design, acoustics, foundering, torpedo watch, difficulty, sonar transmitters, recon photos, convoy tracking, wreck survey, periscope, power plant, rescue operation, carrier rules, surface motion, patrol calendar, coast, ROV flight, contact readings, patrol search, surface wake, mechanics, seafloor, combat geometry, vehicle status, pressure, suspicion, environment, signal lamp, patrol reports, track estimates.
	- [x] Run toward the hard parts: design the shared Elm ship record, all 47 fields, with a decoder rejecting what restore rejects; it round-trips every saved ship, and the survey found two holes in the TypeScript type (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 13:25 EST).
	- [x] Design the shared Elm sonar contact record the same way: 24 fields from a survey of saves, the code and restore, with restore's label migration and legacy fixes; it round-trips every saved contact and matches restore on each rule (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 13:35 EST).
	- [x] Port track estimates on the new contact record: fixes, reconnaissance packets and the omniscient chart, in about 15 minutes (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 13:52 EST).
	- [ ] Port one large tangled module on the shared records, logging the time it takes: systems (350 lines, the largest) after hull contacts (166), since combat and the patrol tick sit on long chains of unported modules (context: docs/plan_context/simulation-to-elm.md).
	- [x] Cutover spike, part one: measure moving busy patrols' ships and contacts across the Elm boundary; 0.16 to 0.27 ms a round trip, 1 to 1.6% of a frame, in a committed benchmark (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 13:45 EST).
	- [ ] Question for the owner: restart headless Chromium (stopped by the low-memory guard) for spike part two, the boundary in a real browser during live patrol ticks? (context: docs/plan_context/simulation-to-elm.md)
	- [ ] Checkpoint: once those three are done (not at a line count: leaf-first ported the easy third), stop porting, bring the hard-part pace, the spike's measurements, a bottom-up estimate for each remaining module and the switch, and a recommendation, and decide with the owner whether to complete or abandon the Elm simulation (context: docs/plan_context/simulation-to-elm.md).
	- [ ] Question for the owner: resume the environment mutation check that the low-memory guard stopped (24 of 50 mutants unrun, and weather-order unexplained)? (context: docs/plan_context/simulation-to-elm.md)
	- [ ] Question for the owner: add elm-format (a new development dependency, nixpkgs' elmPackages.elm-format) to the gate and reformat the existing Elm once? Until then Elm formatting is unchecked (context: docs/plan_context/simulation-to-elm.md).
- [x] Owner decision: should the simulation (now strict TypeScript) also move to Elm, or stay TypeScript with Elm owning the rules catalog and the UI? Answer: move it to Elm as well (owner, 2026-11-27 09:05), in stages alongside the remaining UI (done 2026-11-27 09:35 EST).
- [x] Owner decision: type the Three.js scene modules with a pinned @types/three fetched by Nix, or with hand-written declarations? Answer: pin @types/three through Nix (owner, 2026-11-27 09:05) (done 2026-11-27 09:35 EST).
- [x] Pin @types/three 0.170.0 and @types/webxr 0.5.20 (November 2024 releases matching the vendored Three r170) as hash-checked Nix inputs read only by the type check, and type the submarine model and wreck damage against them; a misspelled Three method or wrong argument type now fails the build (done 2026-11-27 09:50 EST; commit df393c7).
- [x] Type every Three.js scene module and model against the pinned declarations, replacing four hand-written Three stand-ins; renderers read slices of the simulation's World type, exhaustive vessel-kind guards replace loose kind strings, and every view (scope, tower, gun, ROV, orbit) renders without errors in Chromium; the typing found that the disabled sub's air leak in Undersea Rescue never rendered because nothing sets the site's flood (done 2026-11-27 09:50 EST; commit 7368722).
- [ ] Migrate app.js, the last first-party browser script, to strict TypeScript as its UI moves to Elm; its replay frames must then satisfy the scene's World parameter, which today they meet only at run time.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
