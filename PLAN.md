# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).
Until the simulation cutover to Elm, every gameplay feature or fix that touches a ported module must be made in both the TypeScript and the Elm; remind the owner whenever they request one (context: docs/plan_context/simulation-to-elm.md).

## Playtest fixes (owner feedback 2026-11-27)


## Elm migration

- [ ] Move the remaining game UI to Elm in stages: deck gun and noisemaker, contacts, view header and hints, time controls, alerts, mobile helm and drawers.
- [ ] Move the simulation to Elm leaf-first, each module proven against the TypeScript by differential tests, then switch the game loop and saves (context: docs/plan_context/simulation-to-elm.md). Ported: exact arithmetic, equipment, watch warnings, debrief, seabed rest, torpedo tubes, hull design, acoustics, foundering, torpedo watch, difficulty, sonar transmitters, recon photos, convoy tracking, wreck survey, periscope, power plant, rescue operation, carrier rules, surface motion, patrol calendar, coast, ROV flight, contact readings, patrol search, surface wake, mechanics, seafloor, combat geometry, vehicle status, pressure, suspicion, environment, signal lamp, patrol reports, track estimates, hull contacts.
	- [x] Run toward the hard parts: design the shared Elm ship record, all 47 fields, with a decoder rejecting what restore rejects; it round-trips every saved ship, and the survey found two holes in the TypeScript type (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 13:25 EST).
	- [x] Design the shared Elm sonar contact record the same way: 24 fields from a survey of saves, the code and restore, with restore's label migration and legacy fixes; it round-trips every saved contact and matches restore on each rule (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 13:35 EST).
	- [x] Port track estimates on the new contact record: fixes, reconnaissance packets and the omniscient chart, in about 15 minutes (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 13:52 EST).
	- [x] Owner decision: finish systems before the checkpoint, or design its records and checkpoint? Answer: design the boat, drone and sound records, then the checkpoint; port systems' logic only if we choose to complete (owner, 2026-11-27 14:21; hull contacts already sampled a tangled module) (done 2026-11-27 14:21 EST).
	- [x] Design the shared sound record: 20 fields fitting the acoustics' Heard record, a decoder matching restore on each rule, exact round trips, in about 13 minutes (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 14:36 EST).
	- [x] Design the shared boat and drone records: current saves round-trip as restore leaves them, 25 rules match restore, and restore's eight migrations are counted as remaining work, in about 20 minutes (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 14:40 EST).
	- [x] Cutover spike, part one: measure moving busy patrols' ships and contacts across the Elm boundary; 0.16 to 0.27 ms a round trip, 1 to 1.6% of a frame, in a committed benchmark (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 13:45 EST).
	- [ ] Question for the owner: restart headless Chromium (stopped by the low-memory guard) for spike part two, the boundary in a real browser during live patrol ticks? (context: docs/plan_context/simulation-to-elm.md)
	- [x] Checkpoint: complete or abandon the Elm simulation? Answer: complete it, judged on speed, how well the agent writes Elm, how well its tooling catches errors, how informative it is and how maintainable, with the owner valuing no runtime errors above all (owner, 2026-11-27 16:40; context: docs/plan_context/checkpoint-2026-11-27.md; done 2026-11-27 16:40 EST).
	- [ ] Question for the owner: after the switch, keep Float with guarded partial operations and pure-Elm transcendentals, or move to a software mantissa-and-exponent type (measured at 43 to 257 times Float per operation)? The port stays on Float until the switch either way (context: docs/plan_context/numerics.md).
	- [ ] Question for the owner: resume the environment mutation check that the low-memory guard stopped (24 of 50 mutants unrun, and weather-order unexplained)? (context: docs/plan_context/simulation-to-elm.md)
	- [x] Question for the owner: add elm-format to the gate? Answer: yes, and elm-review too, both from nixpkgs, fixing what they find methodically (owner, 2026-11-27 16:40; done 2026-11-27 16:40 EST).
	- [ ] Add elm-format and elm-review (the writing-elm skill's standard rules) to ./test, offline in the Nix sandbox, and fix every finding without disabling rules.
- [x] Type every Three.js scene module and model against the pinned declarations, replacing four hand-written Three stand-ins; renderers read slices of the simulation's World type, exhaustive vessel-kind guards replace loose kind strings, and every view (scope, tower, gun, ROV, orbit) renders without errors in Chromium; the typing found that the disabled sub's air leak in Undersea Rescue never rendered because nothing sets the site's flood (done 2026-11-27 09:50 EST; commit 7368722).
- [ ] Migrate app.js, the last first-party browser script, to strict TypeScript as its UI moves to Elm; its replay frames must then satisfy the scene's World parameter, which today they meet only at run time.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
