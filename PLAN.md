# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).
Until the simulation cutover to Elm, every gameplay feature or fix that touches a ported module must be made in both the TypeScript and the Elm; remind the owner whenever they request one (context: docs/plan_context/simulation-to-elm.md).

## Playtest fixes (owner feedback 2026-11-27)


## Elm migration

- [ ] Move the remaining game UI to Elm in stages: deck gun and noisemaker, contacts, view header and hints, time controls, alerts, mobile helm and drawers.
- [ ] Move the simulation to Elm leaf-first, each module proven against the TypeScript by differential tests, then switch the game loop and saves (context: docs/plan_context/simulation-to-elm.md). Ported: exact arithmetic, equipment, watch warnings, debrief, seabed rest, torpedo tubes, hull design, acoustics, foundering, torpedo watch, difficulty, sonar transmitters, recon photos, convoy tracking, wreck survey, periscope, power plant, rescue operation, carrier rules, surface motion, patrol calendar, coast, ROV flight, contact readings, patrol search, surface wake, mechanics, seafloor, combat geometry, vehicle status, pressure, suspicion, environment, signal lamp, patrol reports, track estimates, hull contacts, systems, replay events.
	- [x] Port track estimates on the new contact record: fixes, reconnaissance packets and the omniscient chart, in about 15 minutes (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 13:52 EST).
	- [x] Owner decision: finish systems before the checkpoint, or design its records and checkpoint? Answer: design the boat, drone and sound records, then the checkpoint; port systems' logic only if we choose to complete (owner, 2026-11-27 14:21; hull contacts already sampled a tangled module) (done 2026-11-27 14:21 EST).
	- [x] Design the shared sound record: 20 fields fitting the acoustics' Heard record, a decoder matching restore on each rule, exact round trips, in about 13 minutes (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 14:36 EST).
	- [x] Design the shared boat and drone records: current saves round-trip as restore leaves them, 25 rules match restore, and restore's eight migrations are counted as remaining work, in about 20 minutes (context: docs/plan_context/ship-and-contact-records.md; done 2026-11-27 14:40 EST).
	- [ ] Question for the owner: restart headless Chromium (stopped by the low-memory guard) for spike part two, the boundary in a real browser during live patrol ticks? (context: docs/plan_context/simulation-to-elm.md)
	- [x] Checkpoint: complete or abandon the Elm simulation? Answer: complete it, judged on speed, how well the agent writes Elm, how well its tooling catches errors, how informative it is and how maintainable, with the owner valuing no runtime errors above all (owner, 2026-11-27 16:40; context: docs/plan_context/checkpoint-2026-11-27.md; done 2026-11-27 16:40 EST).
	- [x] Port systems' logic on the boat, drone and sound records: seven Elm modules plus a replay-events outbox, every function matched on its first full run, 42 of 43 mutants killed and one shown equivalent, about 35 minutes (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 18:41 EST; commit 804c642).
	- [x] Port the fleet action: four Elm modules, matched on the first run, 51 of 52 mutants killed and the last shown equivalent, about 25 minutes (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 19:30 EST; commit 66d5dff).
	- [x] Audit every module mirrored in Elm before the fix-TypeScript-first rule (2026-11-27 19:08 EST: each TypeScript file carrying the Mirrored marker at commit d5ba3a1, plus fleet-action.ts) for TypeScript bugs the port copied: three fixed TypeScript-first (NaN and infinite hits in hurt and damageDrone, sound power), the rest checked safe; shared logic errors stay out of a sweep's reach (context: docs/plan_context/simulation-to-elm.md; done 2026-11-27 19:50 EST; commits d5ba3a1 and "Fix the drone-damage and sound-power bugs the audit found").
	- [ ] Make non-finite numbers impossible by construction in the Elm simulation: total versions of division by a non-literal, sqrt, logBase, acos, asin and ^ taking refined arguments (NonZero, NonNegative, a unit range), a custom elm-review rule rejecting the raw operations in Sim.*, then migrate the 40 mirrored modules so later ports start with it; outputs stay bit-identical where the TypeScript already guards (context: docs/plan_context/numerics.md).
	- [ ] Continue toward the patrol tick in dependency order, each module mirrored, differentially tested and mutation-checked (context: docs/plan_context/simulation-to-elm.md).
	- [ ] Pin the elm-compiler fork once the owner says it is ready (not yet as of 2026-11-27 19:32 EST); it now tracks the latest development release, so the pin changes elm-version in elm.json and review/elm.json, the package cache, elm2nix output and possibly behavior; rerun every differential test and the numbers bench across the switch (context: docs/plan_context/numerics.md).
	- [ ] Question for the owner: adopt a mantissa-and-exponent Num after the switch? The owner is pursuing a kernel-backed Num with operators through an Elm fork (elm-compiler agent, 2026-11-27); decide once the experiment's branch-flip and timing numbers are in. The port stays on Float, bit-exact, until the switch (context: docs/plan_context/numerics.md).
	- [ ] Question for the owner: resume the environment mutation check that the low-memory guard stopped (24 of 50 mutants unrun, and weather-order unexplained)? (context: docs/plan_context/simulation-to-elm.md)
	- [x] Question for the owner: add elm-format to the gate? Answer: yes, and elm-review too, both from nixpkgs, fixing what they find methodically (owner, 2026-11-27 16:40; done 2026-11-27 16:40 EST).
	- [x] Add elm-format and elm-review (the writing-elm skill's standard rules) to ./test, offline in the Nix sandbox, and fix every finding without disabling rules: every module formatted, 565 let bindings annotated (491 with compiler-reported types, 74 by hand), Simplify set to expect NaN, both checks shown to fail on a planted violation (done 2026-11-27 17:36 EST).
	- [ ] Numerics experiment: convert one ported module to a software number, run its differential tests with a tolerance, and count branch flips and time per call; waits on the elm-compiler fork's kernel-backed Num, which also takes the WASM measurement (briefed 2026-11-27; context: docs/plan_context/numerics.md).
- [ ] Migrate app.js, the last first-party browser script, to strict TypeScript as its UI moves to Elm; its replay frames must then satisfy the scene's World parameter, which today they meet only at run time.

## New gameplay


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
