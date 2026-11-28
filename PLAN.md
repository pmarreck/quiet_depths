# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).
Until the simulation cutover to Elm, every gameplay feature or fix that touches a ported module must be made in both the TypeScript and the Elm; remind the owner whenever they request one (context: docs/plan_context/simulation-to-elm.md).

## Playtest fixes (owner feedback 2026-11-27)


## Elm migration

- [ ] Move the remaining game UI to Elm in stages, each played in headless Chromium.
	- [x] Contacts: the count, the rows and their selection (which turns a working periscope), the enemy torpedoes heard, and the empty-list message, which the page's reconciler had removed at the first update so it never showed in play (done 2026-11-28 11:50 EST).
	- [x] View header and hints: two Elm views, each part worded once by the page, folding in the tower's binoculars subtitle and the sonar imagers' hint that a later function used to overwrite (done 2026-11-28 12:00 EST).
	- [ ] On the photos station the hint under the view reads NO DRONE SIGNAL, since its wording never names that station; word it for the photos (found 2026-11-28 while moving the hints, older than the move).
	- [x] Time controls: the footer's rates and autosave status as an Elm view, a chosen rate checked as a command was, the phone footer's rate button left for the mobile stage (done 2026-11-28 12:15 EST).
	- [ ] Alerts.
	- [ ] Mobile helm and drawers.
- [ ] Move the simulation to Elm leaf-first, each module proven against the TypeScript by differential tests, then switch the game loop and saves (context: docs/plan_context/simulation-to-elm.md). Ported: exact arithmetic, equipment, watch warnings, debrief, seabed rest, torpedo tubes, hull design, acoustics, foundering, torpedo watch, difficulty, sonar transmitters, recon photos, convoy tracking, wreck survey, periscope, power plant, rescue operation, carrier rules, surface motion, patrol calendar, coast, ROV flight, contact readings, patrol search, surface wake, mechanics, seafloor, combat geometry, vehicle status, pressure, suspicion, environment, signal lamp, patrol reports, track estimates, hull contacts, systems, replay events, fleet action, mess watch, mission objectives, hostile tracks, cold watch, early end, air support, torpedo runs, combat, orbital reconnaissance, contact reports, convoy and allied lamp watch, rescues and surveys, missions (85.2% of simulation code lines at 8dc0920).
	- [x] Question for the owner (blocks the next item): after the pilot, type every operation as it did, or type the partial operations (division, sqrt, acos, asin, log, powers) and stored world fields now, leaving +, - and * on Float until the fork's operators remove the call cost? Recommendation: the second, since the partial operations are where NaN and infinities arise and storage is where an overflow can be caught, while typing every sum bought only unreachable branches Answer: only the partial operations plus stored world fields (context: docs/plan_context/numerics.md; done 2026-11-28 15:21 EST).
	- [ ] Build the owner's number rules as types in both languages, for the partial operations (division, sqrt, acos, asin, log, powers) and stored world fields while +, - and * stay on Float (owner, 2026-11-28) (non-negative, unit-range and non-zero types with total operations, saturation to ±MAX and ±MIN, no negative zero, saves rejecting saturated values), piloted on one module, then the mirrored modules, with a check rejecting raw partial operations in simulation code, and multiplicative fades ending by an explicit threshold rather than by underflow reaching zero (context: docs/plan_context/numerics.md).
	- [x] Question for the owner: should restore refuse a save with impossible values, such as a negative battery, negative decoys or negative time, where today it checks only that numbers are finite? Answer: yes, the TypeScript first (done 2026-11-28 15:21 EST).
	- [ ] Make restore refuse impossible values (negative battery, decoys, time and the like): a failing test, then the TypeScript fix, then the Elm, both held equal by the restore differential tests.
	- [ ] Port sim.ts, then switch the game loop and saves (context: docs/plan_context/simulation-to-elm.md, "The switch").
		- [ ] Play a patrol of each mission in a browser with ?sim=elm, watching the console for invalid numbers and refused commands, and measure the boundary's cost per frame (the owner played it on r272 and found it good, 2026-11-28 09:15 EST; headless Chromium for the per-mission check and the cost).
		- [x] Replay real play (side agent's note, owner 2026-11-28 12:27 EST): ?record records each call, its arguments and the page's order changes, with an oracle of results and world digests per engine's math, since Chromium 158 rounds transcendental functions correctly and Node 24 does not; all 12 missions recorded in headless Chromium and replayed there through the TypeScript and the Elm worker, and in ./test through the TypeScript (Node's oracle) and the Elm both ways, call by call; the page's negative first frame fixed (context: docs/plan_context/simulation-to-elm.md, "Replaying real play, built"; done 2026-11-28 16:15 EST).
		- [ ] Widen the recorded sessions to the actions the scripted play does not reach (photographs, the drone, the deck gun surfaced, recon requests, rescues, the early end), and add recordings of the owner's own play under ?record when the owner makes them.
		- [x] Question for the owner: when should Elm become the default, and when should the TypeScript simulation be deleted? Answer: make Elm the default when the switch work is done, keeping the TypeScript selectable with a URL option until the owner playtests it; delete it after that playtest (done 2026-11-28 15:21 EST).
		- [ ] Make the Elm simulation the default once the switch work above is done, keeping the TypeScript selectable with ?sim=ts until the owner playtests it.
		- [ ] After the owner playtests the Elm default, delete the TypeScript simulation and the dual-change rule.
	- [x] Question for the owner: resume the environment mutation check that the low-memory guard stopped (24 of 50 mutants unrun, and weather-order unexplained)? Answer: yes (context: docs/plan_context/simulation-to-elm.md; done 2026-11-28 15:21 EST).
	- [x] Rerun the environment mutation check on the current code, explaining weather-order: 47 of 49 killed, weather-order now failing 3 tests (its first run printed no summary, so the run itself had failed); dawn-dusk equivalent; strike-end killed by a new lone-strike edge test (tests/mutants/environment2.mutants at 41cc635; context: docs/plan_context/simulation-to-elm.md; done 2026-11-28 15:45 EST).
	- [x] Question for the owner: reword the four items that wait on the elm-compiler fork (the pin, the Num decision, the numerics experiment and its WASM measurement) as independent, optional follow-ups, and ask the elm-compiler agent to cap its compile memory? Answer: yes and yes (done 2026-11-28 15:21 EST).
- [ ] Migrate app.js, the last first-party browser script, to strict TypeScript as its UI moves to Elm; its replay frames must then satisfy the scene's World parameter, which today they meet only at run time.

## Optional follow-ups, independent of the Elm migration

- [ ] Pin the elm-compiler fork once the owner says it is ready (not yet as of 2026-11-27 19:32 EST); the 0.19.4 beta it tracks ran out of memory (about 90 GB) compiling quiet_depths on 2026-11-27, a regression the fork fixed in 75340ed8 (upstream #2370), and its checks now compile quiet_depths; it now tracks the latest development release, so the pin changes elm-version in elm.json and review/elm.json, the package cache, elm2nix output and possibly behavior; rerun every differential test and the numbers bench across the switch (context: docs/plan_context/numerics.md).
- [ ] Question for the owner: adopt a mantissa-and-exponent Num after the switch? The owner is pursuing a kernel-backed Num with operators through an Elm fork (elm-compiler agent, 2026-11-27); decide once the experiment's branch-flip and timing numbers are in. The port stays on Float, bit-exact, until the switch (context: docs/plan_context/numerics.md).
- [ ] Numerics experiment: convert one ported module to a software number, run its differential tests with a tolerance, and count branch flips and time per call; waits on the elm-compiler fork's kernel-backed Num, which also takes the WASM measurement (briefed 2026-11-27; context: docs/plan_context/numerics.md).
- [ ] Question for the owner: give the simulation transcendental functions of its own that round correctly (PDEA's, or a port), so one seed and one set of inputs give the same patrol in every engine? Today Chromium 158 rounds sin, exp, log and the rest correctly and Node 24 does not, so patrols differ between engines; single-player play does not notice, but lockstep co-op across devices would drift apart, and a recording replays exactly only under its own engine's math (found 2026-11-28; context: docs/plan_context/simulation-to-elm.md, "Engines compute transcendental functions differently").

## New gameplay

- [ ] After the Elm cutover (owner, 2026-11-27 23:50 EST): aircraft spot a submerged hull from the air down to a depth somewhat below periscope depth, and nothing deeper; today they see only a surfaced boat (2 m or shallower) or a raised periscope within 400 m at 15 m or shallower (elm/Sim/AircraftFlight.elm `pursue`, typescript/aircraft-flight.ts), so the cutoff depth and how visibility, light and sea state shrink the range are to be chosen then.


## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
