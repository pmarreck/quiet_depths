# Moving the simulation to Elm

The owner decided on 2026-11-27 that the simulation, now strict TypeScript,
moves to Elm along with the remaining game UI. This note records how, and why
the order of work looks the way it does.

## What constrains the approach

**Ports are asynchronous.** A probe in Node with the project's Elm 0.19.2
sent a value into a `Platform.worker` port and listened on its reply port.
No reply arrived before `send` returned, for single sends, repeated sends or a
send from inside a reply subscriber. The TypeScript step therefore cannot call
an Elm function in the middle of a tick, so modules cannot be swapped into the
running simulation one at a time.

**The step is one synchronous call per frame.** `app.js` calls `step(state,
dt, input)`, then the scene, audio and interface read the same object. After
the switch, Elm will own the patrol, take the frame's inputs through a port
and send back a snapshot for the renderer, audio and storage.

**Floating point matches to the bit.** Elm compiles to JavaScript and uses the same `Math.sin`, `Math.atan2` and arithmetic. Where Elm lacks a built-in, `Sim.Math` reproduces it exactly or both simulations share one formula; see Exact arithmetic below. Differential tests therefore compare with exact equality.

## Strategy

1. **Harness.** An Elm worker exposes the ported functions through one
   request port and one reply port. A Node test helper compiles it with the
   project's Elm, sends inputs, awaits replies and compares them with the
   TypeScript functions. The same helper runs under `./test`.
2. **Leaf-first ports.** Modules move in dependency order, deepest leaves
   first: an Elm module per TypeScript module under `elm/Sim/`, with exhaustive
   custom types where the TypeScript uses strings. Each port lands with a
   differential test over seeded random inputs and the edge cases its
   TypeScript tests already pin. The game keeps running the TypeScript during
   this phase.
3. **Saves.** Elm decoders read the version 1 save format with the same
   validation and upgrades as `patrol-restore.ts`. A corpus of saves made by
   the TypeScript simulation across every mission, seed range and phase must
   decode, step and encode to the same result in both.
4. **Switch.** Once creation, the tick, player orders and saves are ported,
   `app.js` drives the Elm patrol through ports and renders its snapshots.
   The TypeScript simulation stays one release as the test oracle, then goes.
5. **Frame time.** Before the switch ships, measure snapshot encoding, the
   port crossing and the JavaScript side per frame on a busy patrol, with a
   budget of 2 ms at 60 frames per second on desktop.

## Order (dependency level, lines)

- L0: acoustics 88, captain 60, debrief 16, difficulty 43, equipment 82,
  foundering 50, hull-design 12, mission-catalog 18, photos 41, seabed-rest
  35, sonar-strip 57, torpedo-tubes 47, torpedo-watch 62, watch-warnings 18
- L1: carrier 57, convoy-tracking 30, periscope 34, power-plant 74,
  recon-photos 18, rescue-operation 56, surface-motion 147, wreck-survey 41
- L2: coast 60, contact-readings 66, fleet-action 125, patrol-calendar 29,
  patrol-search 56, rov-flight 25, signal-lamp 116, surface-wake 128
- L3: cold-watch 182, environment 121, instant-replay 192, mechanics 50,
  mess-watch 53, mission-objective 57, sonar-imager 303, track-estimates 93
- L4: combat-geometry 32, early-end 110, patrol-reports 40, pressure 39,
  recon 204, seafloor 20, suspicion 52, vehicle-status 30
- L5: convoy-watch 204, hostile-tracks 116, hull-contacts 167
- L6: air-support 124, missions 312, systems 350
- L7: torpedo-run 185; L8: combat 225; L9: patrol-contacts 126, patrol-create 70
- L10: patrol-restore 213, patrol-tick 291

Sixty modules, 5,667 lines, measured from `typescript/sim.ts`. Rendering
helpers the scene evaluates every frame (surface height, environment) keep a
TypeScript copy for the renderer, checked against the Elm version by the same
harness, as the GLSL sea already is.

## Risks the owner accepted

A large rewrite; frame time across the port; save compatibility; and seeds
that replay the same patrol within each implementation but may drift slightly
between the TypeScript and Elm versions over a long patrol.

## Exact arithmetic (2026-11-27)

Floating point now matches to the bit after all, so differential tests compare
with exact equality, signed zeros and NaN included. `Sim.Math` reproduces
V8's `Math.hypot` and JavaScript's `%`, each checked on about 240,000 inputs.
Elm has no `exp`, `expm1`, `tanh` or `cbrt`, and its `e ^ x` differs from
`Math.exp` on 92% of inputs, so the TypeScript simulation now computes those
four through `typescript/sim-math.ts` with the same `Math.pow` formulas as
Elm. That moved its results by a few units in the last place at most, and
every existing test still passes. A test fails the build if any module the
simulation reaches calls the four built-ins directly. The audio and renderer
keep the built-ins.

Two more differences surfaced while porting acoustics, and `Sim.Math` covers
both:

- Elm's `max`, `min`, `abs` and `clamp` are not JavaScript's for NaN and
  signed zeros (`max 0 (-0)` is -0, `max (0/0) 1` is 1, `abs (-0)` is -0).
- The optimizing compiler emits `x == 0` as `!x` and `x /= 0` as `!!x`, which
  treat NaN as zero; comparisons with other literals stay `===`.

Simulation modules use `M.max`, `M.min`, `M.abs`, `M.sign`, `M.clamp` and
`M.isZero`, and a test fails the build on a bare Basics version or a bare
comparison with 0 in `elm/Sim/` (outside `Sim.Math`).

**Captain names stay in TypeScript.** `captainName` normalizes to Unicode
NFC, which Elm's String cannot do. The page normalizes a captain's name before
the patrol sees it, and the Elm save decoder will accept the stored name as
already normalized, which the TypeScript validation guarantees for every save
written so far.

## Simulation boundary (2026-11-27)

The L0 list above came from an import walk that passed through the save
validator and one mixed module, so it counted page code as simulation:

- `sonar-imager` held both transmitter state, which the enemy's suspicion and
  the save read, and the recorder paper display. The simulation half is now
  `sonar-transmitters`, ported as `Sim.SonarTransmitters`; the paper display
  and `sonar-strip` stay in TypeScript with the renderers.
- `photos` is the archive of rendered images. The simulation never reads it
  (objectives count `s.photos`, which holds ship IDs); the page records
  captures and stores the archive under its own key. It stays in TypeScript,
  and the page will hold the archive beside the Elm model, so megabytes of
  image data never cross the ports each frame.
- `captain` stays in TypeScript for the reason above.

Both reach the simulation only through `patrol-restore`. When save decoding
moves to Elm, the page will split the archive and captain name off a save,
validate them with the TypeScript, and hand Elm the rest.

A test fails the build if any module the simulation reaches uses Three.js,
the DOM, a canvas, browser storage or `navigator`.

Level 1 so far: `Sim.ReconPhotos`, `Sim.ConvoyTracking`, `Sim.WreckSurvey` and
`Sim.Periscope` read their criteria straight from `PatrolMission`, so the
differential tests also confirm the generated catalog matches the Elm
records. Vessel kinds live in `Sim.Vessel`. `applyScopePose` poses the mast
model and stays with the renderer.

`Sim.RescueOperation` and `Sim.Carrier` follow. `carrierGroup`, which builds
whole ship records, waits for the Elm ship type: a ship carries 47 fields in
the TypeScript (the intersection of every vessel slice), and the vessel
dynamics modules settle what most of them mean, so `Sim.Ship` will be
designed with them. Until then the ports take extensible records naming the
fields they use, as the TypeScript slices do. `carrierDeck` is the
renderer's. Site kinds live in `Sim.Site`.

Three more modules mixed display state into the simulation, and each is now
split: the stern spray emitter (`stern-spray.ts`) and the wake's foam ribbons
(`wake-ribbons.ts`) are render buffers, and the instant replay recorder
listens on `replay-events.ts`, the channel the simulation announces replay
moments on. In the Elm port those announcements become events the update
returns, as the acoustics' receipts already are. The boundary test now also
fails on any class or typed array the simulation reaches.

`Sim.SurfaceMotion` brings the seeded hash the whole patrol draws from.
`Sim.Math` gained `imul` (Elm's `*` multiplies as doubles) and `toInt32`
(JavaScript's `| 0`, which is what Elm's `truncate` compiles to), each checked
against JavaScript on 20,000 inputs and every 32-bit edge.

**Porting trap: compound assignment.** `y += a + b` computes `y + (a + b)`,
not `(y + a) + b`, and the two round differently. The coast port first got
this wrong and differed in the last bits on 36 of 12,224 chart points. Keep
the whole right-hand side grouped. Every `+=` ported so far adds one term.

`Sim.PatrolCalendar` turns day numbers into dates with Howard Hinnant's
civil-from-days algorithm, the proleptic Gregorian calendar JavaScript's
Date uses, checked across the century boundaries of the 400-year cycle.
`Sim.Coast` builds a seed's coastline once (`coastline`) for the model to
keep, where the TypeScript memoizes it.

**Porting trap: strings.** Elm's string functions read characters and
misread unpaired surrogates (`Char.toCode` gives NaN for a lone high
surrogate; folding over a lone low surrogate swallows its neighbor).
JavaScript code that hashes IDs reads UTF-16 code units, so the simulation
reads text through `Sim.Text.codeUnits`, exact for every string.

## Dual implementation until the cutover (owner decision, 2026-11-27)

The game keeps running the TypeScript simulation until every module is
ported, then switches at once. Until then a ported module's rules exist in
both languages, and the owner has asked to be reminded of it whenever they
request a gameplay feature or fix. For any such change:

1. Tell the owner the change will be made twice, in the TypeScript the game
   runs today and in its Elm twin.
2. Change both. Each mirrored TypeScript module names its twin on its first
   line (`// Mirrored in elm/Sim/X.elm ...`); a test fails if a mirrored
   module lacks that line.
3. Extend the module's differential test (`tests/sim-*.test.mjs`) to cover
   the new behavior, so the two cannot drift.

A change to a module not yet ported needs only the TypeScript; the port
then carries it over.

## Checkpoint at one third (decided with the owner, 2026-11-27)

Once a third of the simulation's code lines are mirrored in Elm
(`node scripts/elm-port-progress.mjs`), porting stops, and we decide together,
on evidence, whether to complete the port or abandon it. The agent brings
the evidence below and its own recommendation. On 2026-11-27 the
figure was 20.4% (913 of 4,465 lines, 25 of 59 modules). The remaining
modules are the larger, stateful ones (systems, missions, the patrol tick,
restore, combat), so the evidence should say how far the leaf experience
predicts them. Bring:

1. **Pace.** Lines mirrored per working hour from the port commits, and how
   it changed as modules grew.
2. **Correctness cost.** The traps found (JavaScript arithmetic Elm lacks,
   the optimizer's `== 0`, unpaired surrogates, compound assignment,
   simulation modules carrying display state) and whether new ones still
   turn up; mutation survivors and what they revealed.
3. **Speed.** Elm against TypeScript per call for the hot paths already
   ported (acoustics, chart depth, surface motion, propulsion), and an
   estimate of a whole tick against the 2 ms frame budget.
4. **Size.** The optimized, minified Elm simulation against the TypeScript.
5. **Dual-change burden.** How many owner requests touched mirrored modules
   while both existed, and what each cost.
6. **The switch.** What remains beyond porting: saves, the frame loop through
   ports, replay events and sounds as update results, the renderer reading
   Elm state.
7. **Options.** Complete; abandon (delete the Elm simulation and keep the
   strict TypeScript, which the splits and boundary tests already improved);
   or anything in between, with the cost of keeping two simulations.


**Early speed reading (2026-11-27, Node 24, optimized Elm, best of five
after warm-up; nanoseconds per call, identical results in both):**

| Function | Elm | TypeScript | Ratio |
|---|---|---|---|
| `chartDepth` | 371 | 190 | 1.95 |
| `surfaceMotion` | 615 | 411 | 1.50 |
| `propulsion` | 498 | 157 | 3.17 |
| acoustics update, 96 heard sounds | 5,024 | 594 | 8.45 |
| `hash01` | 41 | 14 | 2.85 |

Arithmetic runs 1.5 to 3 times slower in Elm, from curried calls, record
copies and the exact-arithmetic wrappers. List-heavy code is worse: the
acoustics update makes five passes over its list where the TypeScript makes
two, and could skip them when nothing is due. A whole TypeScript tick takes
0.03 to 0.06 ms early in a patrol, and substeps are capped at 0.25 s, so
even 20x compression runs about two ticks per 60 Hz frame. At the worst
ratio measured, a tick would still fit the 2 ms budget several times over.
The checkpoint should repeat this with busy battle ticks and a committed
benchmark.

The acoustics gap was mostly the port's own design. A literal translation
made five passes, each allocating; one pass from the newest sound back took
the update from 5.0 to 2.6 µs, and returning the list untouched when nothing
is due or stale took it to 1.6 µs, 2.3 times the TypeScript (and that figure
includes the benchmark's own list-length passes). Ported code should be
written for Elm's data structures, not transliterated.

**Porting trap: number formatting.** JavaScript's `toFixed` rounds the exact
binary value half up, so `(0.15).toFixed(1)` is "0.1"; rounding `x * 10` gets
such cases wrong. Five simulation modules format numbers with it, so
`Sim.Text.toFixed` reproduces it exactly with Dekker's error-free product,
checked on 80,000 values and 42,000 near-ties.

**Porting trap: comparisons.** Elm emits JavaScript's `<`, `>`, `<=` and
`>=` only when one side is a literal. Between two variables it calls
`_Utils_cmp`, which counts NaN as greater, so `a > b` and `a >= b` come out
true when either is NaN, where JavaScript says false. `<` and `<=` keep
JavaScript's meaning. Found by a surviving mutant in the weapon geometry;
34 comparisons were flipped (`b < a` for `a > b`), NaN cases now cover the
ones a NaN state could reach (pressure level, wreck visibility, survey
completion), and a test fails the build on any `>` or `>=` in `elm/Sim`
without a literal on its right.

**For the save decoder.** `Json.Decode.maybe` and `oneOf [ field, succeed
default ]` treat a present but malformed field as missing. The harness uses
them on well-formed test data; the Elm save decoder must instead fall back
only when a field is absent, as the TypeScript validation does.

**Environment (2026-11-27).** The sea shader's wave sum and the underwater
daylight moved to `typescript/sea-shading.ts`: only the renderer uses them,
so they stay TypeScript after the cutover. The unused `SEA_GLSL` was removed.
The mutation check of `Sim.Environment` was stopped by the session's
low-memory guard after 26 of 50 mutants: 23 failed the tests, two were
equivalent (the first front's blend guard, now removed from the Elm, and the
dawn/dusk hour threshold, where no hour between 11 and 12 has mid daylight),
and `weather-order` reported nothing. The other 24 have not run.

## Checkpoint revised: run toward the hard parts (2026-11-27)

A side agent pointed out, and the owner agreed in the spirit of "run toward
the problem, not away from it", that leaf-first ports the easiest standalone
pieces first, so the pace of the first third understates the rest. What
remains holds the largest, most tangled modules (systems, missions, the
patrol tick, save restore, combat), two shared data shapes the port has so
far worked around (the 47-field ship record and the sonar contact record),
and the switch of the game loop itself, which no line count includes. The
port had already started steering around the contact record.

So the checkpoint no longer fires at a third of the lines. Before it:

1. Design the shared ship and contact records, with save decoders that
   reject exactly what restore rejects (the JSON decoders must fall back only
   when a field is absent, never when it is malformed).
2. Port track estimates and one large tangled module on them, logging time.
3. Spike the cutover: drive real ticks through Elm in the browser and
   measure the boundary's per-frame cost.

The checkpoint then brings a bottom-up estimate per remaining module and for
the switch, not the early pace multiplied by three.

## Tooling: a timed-out test is not a passing test (2026-11-27)

Node's test runner, stopped by `timeout`, prints its summary with the
unfinished tests counted as canceled and `fail 0`. The mutation script read only
the fail count, so a mutant whose test was canceled looked like a survivor;
`delivered-stops` in the signal lamp was one. Tests ran long because
`assert.deepEqual` on a batch of thousands of differing results builds a
full diff, which took minutes and plenty of memory, and may have added to the
pressure that stopped the environment run. The tests now compare batches with
`sameResults` (the same strict equality, reporting the first differing call),
mutants fail in about five seconds, and the script counts a run as a survivor
only when it finished with no failures and nothing canceled.

## Hard-part log (agent wall-clock, for the checkpoint)

| Item | Time | Notes |
|---|---|---|
| Ship record (`b8f478b`) | about 30 min | type printed by the checker, survey of saves, decoder and parity tests; found two type holes |
| Contact record (`4689d7b`) | about 12 min | reused the ship method; found restore's migrations |
| Rescues and surveys (119 lines, two Elm modules) | about 40 min after the audit and site record | setup matched at once; two test fixes; four restore gaps fixed first; 65 of 65 mutants killed |
| Convoy and allied lamp watch (188 lines, three Elm modules) | about 30 min | matched once the test dropped a bookkeeping flag; 58 of 58 mutants killed |
| Contact reports, ping and photographs (114 lines, two Elm modules) | about 25 min | matched once the test passed both languages the same look; a restore gap fixed first; 52 of 52 mutants killed |
| Orbital reconnaissance (196 lines, three Elm modules) | about 20 min after the TypeScript fix | matched on the first comparison; save checks tightened in the TypeScript first; 69 of 74 mutants killed, the other five equivalent |
| Combat (209 lines, four Elm modules) | not measured (written across a context break) | matched once the test stated the one deliberate difference (a player torpedo's launcher and aim); two TypeScript save checks fixed first; 61 of 62 mutants killed, the last equivalent |
| Torpedo runs (130 lines, four Elm modules) | about 60 min | matched on the first comparison; 54 of 55 mutants killed, the last equivalent |
| Air support (115 lines, two Elm modules) | about 40 min | matched on the first run; found and fixed a TypeScript bug first (a surfaced boat's bomb depth); 55 of 55 mutants killed after four input gaps closed |
| Early end (90 lines) | about 15 min | matched on the first run; 18 of 19 mutants killed, the last equivalent under the real mission catalog |
| Cold watch (176 lines, five Elm modules) | about 45 min | matched on the first run; 108 of 108 mutants killed after the tests met rarer encounters and coastal passages |
| Hostile hunters (107 lines, two Elm modules) | about 30 min | one representation difference (null against Nothing), normalized; 41 of 41 mutants killed after two input gaps closed |
| Mission objectives (49 lines) | about 15 min | matched on the first run; 13 of 13 mutants killed after two test gaps closed |
| Mess watch (48 lines) | about 20 min | matched on the first run; 34 of 34 mutants killed |
| Fleet action (118 lines, four Elm modules) | about 25 min | matched on the first run; the mission handler threads through the state in order |
| Systems (327 lines, seven Elm modules) | about 35 min | every function matched on its first full run; the slices compose the earlier ports (pressure, power plant, periscope, hull geometry) unchanged |
| Boat and drone records | about 20 min | systems and limits as records with exhaustive accessors; restore's eight boat migrations inventoried, not ported |
| Sound record | about 13 min | fits the acoustics' `Heard` record as it is (`id : Int`, `power : Maybe Float`), so the ported update runs on saved sounds |
| Hull contacts | about 20 min | identity became roles, mutation a threaded fold, `hurt` a parameter; three modules to stay under 500 lines; the Carrier port's `Int` hits met the ship record's `Maybe Float` |
| Track estimates | about 15 min | first port on the shared records; the omniscient chart's exact marks became their own type, since they are not contacts |

The early leaf ports ran about 10 to 20 minutes each for 30 to 150 lines.

**Track estimates.** The omniscient chart's exact marks carry no bearing,
confidence or method, so they are `Exact` entries beside `Observed`
contacts rather than contacts. A reconnaissance track's untyped fields are
trusted only with the right type, as the TypeScript's `typeof` checks do;
one difference remains: a track naming a kind the game does not have leaves
the contact's kind as it was, where the TypeScript would copy the string.
Recon builds tracks from real ships, so no patrol can produce one.

## Cutover spike, part one: the boundary (2026-11-27)

`scripts/elm-boundary-bench.mjs` sends busy patrols' ships and contacts
(saved ten minutes in) through an Elm worker's ports, decoding them with the
shared records' decoders and encoding them back, 200 to a batch so the
figure is the work, not the port's scheduling. Node 24, optimized Elm:

| Patrol | Ships | Contacts | Save | Ships and contacts | `JSON.stringify` of the save | Elm round trip | Share of a 60 Hz frame |
|---|---|---|---|---|---|---|---|
| Fleet action | 9 | 2 | 19.7 KB | 4.9 KB | 0.083 ms | 0.256 ms | 1.5% |
| Carrier hunt | 4 | 4 | 18.7 KB | 3.3 KB | 0.085 ms | 0.156 ms | 0.9% |
| Convoy defense | 7 | 6 | 30.9 KB | 5.3 KB | 0.142 ms | 0.265 ms | 1.6% |
| Convoy attack | 6 | 6 | 17.7 KB | 4.4 KB | 0.080 ms | 0.205 ms | 1.2% |
| Reconnaissance | 7 | 7 | 17.3 KB | 4.6 KB | 0.081 ms | 0.206 ms | 1.2% |

Reading: the Elm round trip runs about 2.5 times JavaScript's own
serialization. Scaled to the whole save, sending all of it across every
frame would cost roughly 1 to 1.5 ms, affordable but not free. If Elm owns
the state, only the outbound half crosses each frame, and a snapshot of what
the renderer draws would be far smaller still. Part two, the same in a
browser with real ticks, needs headless Chromium, which the session's
low-memory guard stopped; restarting it waits for the owner.

## The large sample: hull contacts and systems (plan, 2026-11-27)

Chosen because `systems` is the largest module (350 lines) and depends only
on `hull-contacts` (166) and the replay channel, while `combat` and the
patrol tick sit on long chains of unported modules. What makes it hard:

- `resolveTraffic` compares bodies by identity (`a === s`, `body === s.site`)
  across the player's boat, the site, ships and throwaway wreck copies. The
  Elm port names each body's role instead (boat, site, ship by index,
  wreck copy) and threads one state through the pairs in the same order,
  since a ship pushed in one pair is the ship the next pair sees. Hits on a
  wreck copy are discarded, as the TypeScript discards the copy.
- It calls back into `systems`' `hurt`, which the Elm takes as a function
  parameter so its effect lands at the same moment; replay moments become
  returned events.
- `systems` owns the player's `Boat` record, the third shared shape, which
  the port takes as an extensible record naming the fields each function
  uses, as the TypeScript slices do.

**Hull contacts, done.** Differential tests cover 6,000 hull pairs, keel
limits and shoal pushes over real shoals, and 1,200 traffic scenes resolved
pair by pair: the boat among ships of every kind, sites (one of them
drifting), settled wrecks, collisions on cooldown, sheared periscopes,
groundings and civilian losses with and without the boat to blame. Of 31
mutants, two survive by explanation: the near-parallel determinant guard
(both branches reach the same closest points) and the tie-break between two
equally deep part pairs (an exact floating tie needs a measure-zero
arrangement). The TypeScript's `a !== s.site` in the vertical push is
redundant, since a site weighs nothing unless it floats; the Elm drops it.

**Seams between slice-based ports (evidence for the checkpoint).** Ports
that each took an extensible record naming only their own fields chose
types independently, and the shared records expose the disagreements:

- `Sim.Carrier` takes `directHits : Int` (the TypeScript's `?? 0`); the ship
  record holds `Maybe Float`. Hull contacts adapts at the call.
- `Sim.Pressure` takes `repairLimits` as a record with a `hull` field and
  `Sim.PowerPlant` takes `systems` as a record of named systems, while
  `Sim.HullContacts` took both as `Dict String Float`. Records win: a missing
  or misspelled system fails to compile instead of reading NaN at run time
  (the fleet's omission rule), and the older ports already use them.
  `Sim.HullContacts` now names the one system it touches. A first attempt
  went the other way, moving `Sim.Pressure` to a map (`3fcadcf`); it was
  undone once the power plant showed the pattern.

Each seam is small, but the integration work is real and grows with the
number of ported modules; a line count never shows it.

**Systems pulls in more shared records (2026-11-27 14:05).** Every module
`systems` calls is ported, but `systems` itself needs three shapes no port
has pinned down: the player's boat (the `Boat` interface, about 60 fields),
its drone (about 25), and the acoustic sound. The Elm acoustics takes sounds
as an extensible record (`Heard a`) and never ported `emitSound`; the
TypeScript's sounds carry open extra fields (`own`, `shot`, and the
`droneHit` flag `systems` reads). Each must be surveyed and decoded as the
ship and contact records were. This is the pattern the checkpoint should
weigh: the large modules each pull in shared shapes, and those shapes are
where the remaining cost concentrates, more than in the lines themselves.

## Systems ported (2026-11-27)

`systems.ts` (327 code lines, the largest module) is mirrored in seven Elm
modules, each under 500 lines: `Sim.Systems` (system damage, `hurt`, onboard
explosions), `Sim.DroneOrders` (launch, recall, drone damage and loss),
`Sim.BoatMotion` (the tick: propulsion, steering, depth keeping, the plant),
`Sim.DamageControl` (air, fuel leaks and fires, flooding, repairs),
`Sim.SeabedContact` (landing and scraping), `Sim.DroneFlight` (the drone's
tick), `Sim.DroneReturn` (the return lane) and `Sim.DroneCollisions`.
`replay-events.ts` became `Sim.ReplayEvents`: the TypeScript announces to a
listener found by object identity, the Elm patrol appends to an outbox the
game will drain, and the tests compare the outbox against what the
TypeScript's listener received. `Sim.Status` gained the compromised, expired
and convoy-lost statuses with an exhaustive list. About 35 minutes from the
first module to green tests, on top of the records designed earlier; every
function matched on its first full run except one test-data slip.

The differential tests run every saved patrol through each function, plus
scenarios for every branch, with rare random events (vapor explosions, fire
starts, cook-offs) forced by searching for random-stream seeds whose first
draw falls below the event's odds. Both sides go through JSON, as saves do.

Lesson: run `elm-review --fix-all` only on code whose callers exist. Run
over modules written ahead of their users, it deleted their unused
constructors and functions; fix specific rules with `--rules` instead.

Mutation check of the systems port: 43 mutants, 42 killed, one equivalent
(`|turn| < |yaw|` against `<=` in the yaw overshoot: equality with matching
signs means `turn` and `yaw` are the same number, so either choice gives the
same heading). The first pass left 15 survivors, every one a test-input gap,
not a port difference: thresholds no case sat near (flooding at its cap,
the recall clearance, the power watch, the flood alarm, the scrape log, the
link alarm, pressure-wave reach, the hatch stage, a slow hull contact), seeds
on only one side of each fire's odds, and, worst, ship and casualty
collision cases that never reached the collision code, because those hulls
lay beyond the drone's 100 m link and the drone was lost first. Each gap got
a case placed on its threshold, the boat now sits 40 m from every collision
test point, and a guard asserts a drone does strike a ship.

## Compare numbers exactly, never through JSON (2026-11-27)

The systems tests passed both sides through JSON before comparing, which
turns NaN and both infinities into null and -0 into 0. A port that produced
Infinity, -Infinity or -0 where the TypeScript produced NaN or 0 would have
passed: three planted mutants of exactly that kind survived. The tests now
copy results with `exact` (tests/sim-harness.mjs), which keeps every number
and drops only undefined keys, and `sameResults` compares with
`isDeepStrictEqual`, whose `Object.is` semantics keep NaN, Infinity,
-Infinity, 0, -0 and null apart. A self-test in sim-math holds the comparison
to that, and hits of infinite size joined the cases. (The hurt test first
asserted that its NaN results reached the comparison as NaN; those results
were a bug, fixed below.) All three mutants now fail the tests. JSON
stays only where the thing under test is itself a save (record codecs, save
validation).

## Fix TypeScript bugs first, never copy them (owner rule, 2026-11-27)

When porting turns up a bug in the TypeScript, do not reproduce it in Elm.
Fix it in the TypeScript first, with a regression test that fails before the
fix, then port the corrected behavior, so the differential tests hold both
languages to the right answer rather than the same wrong one. Bugs found in a
module already ported are fixed in both, TypeScript first.

First case: `hurt` rejected hits of size `<= 0`, which NaN passes, so a NaN
hit left the outer hull and the flooding NaN, and an infinite hit flooded the
boat while `damagePart` spared its pressure hull. The port had copied this.
`hurt` now rejects any hit whose size is not a finite number, as
`damagePart` and `damageSystem` already did (tests/equipment.test.mjs holds
the TypeScript to it; the differential test's guard asserts such hits change
nothing).

Candidates for the audit of modules ported before this rule:
- `power || 1` in acoustics.ts, mirrored in `Sim.Acoustics`: a sound of zero
  power counts as full power. Probably meant `??`; check its callers.
- Guards of the form `x <= 0` or `x < limit` on values that can be NaN.
- `||` defaults on numbers, non-null assertions (`!`), and the partial
  operations (division, `sqrt`, `acos`, `log`, `exp`, `**`) where their
  inputs are not already bounded.

## Fleet action ported (2026-11-27)

`fleet-action.ts` (118 code lines) became four Elm modules: `Sim.FleetAction`
(the battle), `Sim.FleetTheater` (layout, side counts, echo affiliation),
`Sim.FleetVolleys` (volleys in flight) and `Sim.FleetActionSaves`. The
mission's per-event handler is a function threaded through the state in the
TypeScript's order. About 25 minutes of work, matched on the first run; no
TypeScript bugs found in it. Mutation check: 52 mutants, 51 killed. The one
survivor relaxes `arrives <= launched` to `<` in save validation, which is
equivalent: the rules before it require `launched <= time < arrives`, so with
a finite time (restore guarantees one) the check can never decide. The first
pass also left the 1800 m turn-back distance unchecked, since the far units
stood 2,600 m out; theaters with units at 1,760 to 1,840 m now pin it.

## Audit of modules ported before the rule (2026-11-27)

Swept the 40 TypeScript modules carrying the Mirrored marker at d5ba3a1,
plus fleet-action.ts, for the shapes the NaN-hit bug had: `||` defaults on
numbers, non-null assertions, early returns that NaN slips past, and partial
operations (`sqrt`, `asin`, `acos`, `log`, `**`).

Fixed, each in the TypeScript first with a regression test that failed
before the fix, then in Elm, with the differential tests widened to cover
the case (they failed against the unfixed Elm, as they should):
- `hurt` (d5ba3a1): NaN and infinite hits.
- `damageDrone`: the same `amount <= 0` guard; a NaN or infinite hit damaged
  nothing (`damagePart` refuses it) but still logged a drone impact.
- `perceivedSound`'s `power || 1`: a zero-power sound played at full power,
  an infinite power gave the unclamped gunfire and thunder path an infinite
  gain, and a negative power a negative one. Power is now loudness: a finite
  power floored at zero, and 1 when missing or not finite. Every sound the
  game emits has a positive literal power, so none of this was reachable in
  play.

Checked and left alone: `|| 0` on optional depths, altitudes, pitches and
speeds (absent or NaN becomes 0, and 0 stays 0); `Math.sign(speed ||
targetSpeed || 1)`, a deliberate direction fallback; non-null assertions on
static mission lookups, `point!` (only bow hits, which need a point, reach
it), `estimateAt` straight after `fixContact` stores a finite fix, the fleet
action's targets (validTheater guarantees them) and weather lookups over
their own keys; `sqrt` in `pushOffShoal` (slopes under 1e-8 return first) and
the wake (exposure only grows from 0), `asin` in the signal lamp (only when
range exceeds radius), `tanh` (clamped past ±20); early returns on state that
restore validates as finite.

What a sweep like this cannot find: wrong formulas or logic that both
languages share. The differential tests only prove the two agree, so those
need gameplay tests and review.

## Mess watch ported (2026-11-27)

`mess-watch.ts` (48 code lines) became `Sim.MessWatch`, with aircraft phases
as the closed type `Sim.AircraftPhase`. About 20 minutes; matched on the
first run; all 34 mutants killed. The port's neighbor fix: `activeVolleys`
now takes the nested `convoy.shot` and `traffic.volleys` fields the patrol
really has, where the fleet-action port had flattened them. Under the
fix-TypeScript-first rule, new games now start with `shock: 0` instead of
leaving the declared number undefined until the first tick. The project's
arithmetic test caught a `/= 0` (Elm compiles comparisons with zero to
JavaScript truthiness); `M.truthy` mirrors the TypeScript's truthiness test.

## Mission objectives and hostile hunters ported (2026-11-27)

`mission-objective.ts` (49 code lines) became `Sim.MissionObjective`, about
15 minutes, matched on the first run; 13 mutants, all killed once two test
gaps closed (an "exactly at the gate radius" point placed with sine and
cosine missed the radius by rounding, and the rescue and survey stand-ins
could not see a changed tick).

`hostile-tracks.ts` (107 code lines) became `Sim.HostileTracks` and
`Sim.HunterReports`, about 30 minutes, matched on the first run except one
representation difference (TypeScript's `tracking: null` for a hunter that
gave up, Elm's `Nothing`), normalized as the ship-record tests already do.
Restore guarantees every hunter report a depth, course and speed, so the Elm
report requires them, turning that invariant into a type. 41 mutants, all
killed once the inputs gained hunters just either side of each weapon's
reach and a zero-length tick (an alert lands on exactly 42 only by chance
after an update). The systems helpers for the debrief, the random stream and
sound now take only the fields they use, and sounds can carry an altitude.

## Cold watch, early end and air support ported (2026-11-27)

`cold-watch.ts` (176 code lines) became five Elm modules: `Sim.ColdWatch` (the
tick, landings and the player's signals), `Sim.Stands` (shared types and
helpers), `Sim.StandDecisions` (each ship's turn), `Sim.TrafficEncounters`
(the schedule and arrivals) and `Sim.TrafficSaves` (save validation), about
45 minutes, matched on the first run (`f817ece`). The patrol's callback is a
typed signal called in the TypeScript's order, because the patrol draws impact
ids from the same sequence as volleys. Mutation testing killed 80 of 108
mutants at first: the long replays rarely met damaged, flooded or disabled
ships, carriers, recent attacks on the player, narrow temperament bands or
coastal passages. 5,000 random single turns, 900 arrivals placed mostly near
the coast (some in shallows or ashore, so that groups find no passage), and
four more save breakers closed the gaps; all 108 now fail the tests
(`66dbbd3`). The tests had also hardcoded half a day as 43,200 seconds; a
game day is 2,880, so they read it from the calendar now.

`early-end.ts` (90 code lines) became `Sim.EarlyEnd`, with `Sim.PatrolPhase`
typing the patrol's objective and extraction phases, about 15 minutes, matched
on the first run (`73b83de`). Of 19 mutants, 18 fail the tests once a briefed
target's hull can sit between 0 and 1. The last turns the foundering carrier's
"any briefed target doomed" into "every briefed target doomed", which cannot
differ while the only mission with that rule briefs a single carrier: an
equivalent mutant under the real catalog.

`air-support.ts` (115 code lines) became `Sim.AirSupport` (the sortie, its
report and requests) and `Sim.AircraftFlight` (flying it), with
`Sim.Ordnance` typing blasts and gun rounds for combat to share, about 40
minutes, matched on the first run (`0818c0b`). Porting it turned up a
TypeScript bug, fixed first (`48db130`): a depth bomb's fuse read
`report.depth || 40`, meant for legacy reports saved without a depth, so a
report of a boat on the surface (depth 0) set the bomb for 40 m instead of
the 15 m minimum. It now reads `?? 40`, with a regression test for a surfaced,
a deep and a legacy report. All 55 mutants fail the tests once the inputs
reached each threshold: an island base over open water (restore checks only
that the base is finite), a falling plane ending a tick between -10 and -5 m,
a plane flying home on a tick short enough that the 10 m arrival floor binds,
and a strafing cooldown ending a tick between 0 and 0.1 s.

## Torpedo runs ported (2026-11-27)

`torpedo-run.ts` (130 code lines) became `Sim.Torpedo` (the torpedo and its
launch), `Sim.TorpedoCourse` (steering), `Sim.TorpedoStrike` (strikes) and
`Sim.TorpedoRun` (each moment's run), about 60 minutes including the harness
work, matched on the first comparison (`8f20c9f`). An enemy torpedo's
launcher and aim live in its owner, so a player's torpedo cannot carry them.
The strike calls both the boat's damage and the carrier's alarm, so the
shared patrol harness grew to decode the mission, torpedoes, aircraft,
blasts, gun rounds, noisemaker and reports, and the difficulty record gained
its air-support switch.

The first full gate failed where the local run passed: the build replaces
`src/` with compiled modules, and the test imported the TypeScript source
directly, so its replay listener sat on a second copy of the replay module
and heard nothing. Importing through `src/` like every other test fixed it.

Mutation testing killed 42 of 55 mutants at first. The long runs never met a
torpedo near its 180-second life, a submarine or ship missing its depth or
noise, a ping falling due between 2.4 and 2.5 s (quarter-second ticks keep
ping ages on a 0.25 grid), climbs and dives through a hull's top or bottom
face, ships riding low, a run reaching its run-out exactly, or a diverted
torpedo striking its intended neutral. Wider runs and 1,500 constructed
single ticks now kill 54. The last makes a torpedo recheck a noisemaker it
already checked; the diversion roll is a hash of the torpedo and the
noisemaker's time, so the recheck always repeats the first answer: an
equivalent mutant.

Porting `combat.ts` turned up two TypeScript fixes, made first: the deck gun
silently refused an aim that was not a finite number (`f5d0c77`), and a
saved torpedo's id passed validation as any finite number, though ids come
from the integer weapon sequence.

## Combat ported (2026-11-27)

`combat.ts` (209 code lines) became `Sim.Combat` (the boat's torpedoes and
deck gun, an enemy's torpedo, and each moment of combat), `Sim.GunRounds`
(shells in flight), `Sim.ShipDamage` (flooding, sinking, collapse and
settling) and `Sim.TorpedoSaves` (checking and completing saved torpedoes),
at `1e833e0`. It was written across a context break, so its time was not
measured. The shared patrol harness now decodes contacts, tubes, the deck
gun and the crew's quiet watch.

Porting found two more TypeScript gaps, fixed first: a saved torpedo's id
passed as any finite number though ids are whole (`9d6b0f1`), and its
intended target and lock were never checked as ship ids (`4eeeb53`). One
deliberate difference remains: a player's torpedo has no launcher or aim in
Elm, so a damaged save giving one those fields loses them, where the
TypeScript keeps them unread.

Mutation testing killed 45 of 62 mutants at first. The played patrols never
put a boat between 90 and 100 m at a launch, a warship just past the run
setting, an opponent 5 to 6 km from the deck gun, a submarine 8 to 10 m down
under a plunging shell, a boat 2 to 3 m down under strafing, a splash 120 to
150 m from a ship, a shell striking between 4 and 5 m above the waterline,
the carrier struck before her aircraft were up, a doomed carrier or a listing
ship flooding, or a wreck crossing the depths at which it collapses. Wider
inputs and 1,200 constructed single ticks now kill 61. The last removes the
charge's "has an air time" test, which `elapsed < air` already implies
because `elapsed` is never negative: an equivalent mutant.

## Orbital reconnaissance ported (2026-11-27)

`recon.ts` (196 code lines) became `Sim.Recon` (the task, its request, radio
link and panel), `Sim.ReconPasses` (each moment: uplink, overpass, two
exposures, processing and the transfer home) and `Sim.ReconSaves` (a saved
task read with every check restore makes), at `3a2ec96`, about 20 minutes
after the TypeScript fix, and matched on the first comparison. An image's
size and an area's footprint are fixed, so the Elm types do not store them;
the encoder writes the constants back. A phase missing a time its update
reads holds where it is, which saves now refuse to reach.

Porting found the save checks too loose, fixed first (`4216822`): a
photographed ship's kind, name, military flag and side, a frame's weather
name, an identified track's fields and a daytime scene ship's kind went
unchecked, and a saved tasking, imaging or processing phase could lack the
start time its update reads, which JavaScript then read as zero.

Mutation testing killed 53 of 74 mutants at first. The played tasks never
requested a square 19 to 20 km out, on a finished patrol, with a negative
clock, or while a task was busy past its cooldown; never met a storm between
0.5 and 0.6, daylight between 0.25 and 0.3, cloud between 0.35 and 0.4,
light rain under thin cloud, or the clouds' floors; never photographed a sunk
ship, exposures under a second apart, or a delivery after a long cooldown;
and never saved a negative wave scale or a completed task without its
receipt time. Constructed requests and moments now sit on each, and 69 mutants fail the tests. Five
mutants are equivalent: the link's floor at zero depth (a negative depth
reads the same), the panel's guard against a NaN progress (saves cannot hold
one), a queued task's link check (the uplink step already returns the task
untouched when the link is down), unique track ids (implied by the scene
ships' checks), and the refusal of a negative clock (saved cooldowns are never negative, so the cooldown check already refuses it).

## Contact reports, the ping and photographs ported (2026-11-27)

`patrol-contacts.ts` (114 code lines) became `Sim.ContactReports` (a ship
sighted, heard or ranged, the fix each method earns, and lamp fixes) and
`Sim.PatrolContacts` (the periscope's view, the active ping, photographs,
the noisemaker and depth charges), at `a78006b`, about 25 minutes after
reading began, and matched once the test passed both languages the same
look. Its `fire` is combat's `launchTorpedo` and needed no port. The shared
patrol harness grew to decode the contact numbering, the convoy's shot, the
fleet battle, traffic, the search area, ping timers, torpedo tracks,
photographs, noisemakers left and the boat's alert.

Porting found a restore gap, fixed first (`c6cfb65`): a saved ship's depth
was never checked, so a submarine saved without one would have an active
ping estimate a NaN depth for her. Restore now requires a finite depth when
present and one on every submarine.

Mutation testing killed 41 of 52 mutants at first (one pattern did not
apply). The played patrols never sighted a ship close aboard, met a
submarine deeper than 300 m, a boat between 15 and 16 m, a search site 1.4
to 1.5 km off, torpedoes 5 to 6 km away, fleet volleys in flight near the
ping's reach, a disabled opponent in earshot, a contact already holding a
guess at its side, or an incidental merchant in the reticle. Wider inputs
and constructed photographs now kill all 52.

## The wolf in the henhouse and the allied lamp watch ported (2026-11-28)

`convoy-watch.ts` (188 code lines) became `Sim.ConvoyWatch` (the convoy's
setup, its lamp, the hunter's raid and the escort's charges),
`Sim.AlliedWatch` (friendly ships signaling fixes) and `Sim.ConvoySaves`
(the save checks and the station lamp's message), at `9a4d11b`, about 30
minutes after the contacts commit. It matched once the test stopped
carrying a bookkeeping flag on blasts into its inputs. The escort's charge
is marked by the id the drop returns rather than by counting back from the
sound sequence, which the first draft did.

Mutation testing killed 34 of 58 mutants at first. The played henhouse never
hailed from between 1 and 2 m, from the edges of the hail's reach by day or
night, copied at the edges of scope or tower depth, the lamp's range or with
a damaged periscope, met a torpedo arriving on the tick or at a sunk ship, a
disabled escort, or a charge at the edge of reach or odds; the allied watch
never swept near its reach, offered a fix near its freshness limit, held an
uncopied message near three minutes, waited for the convoy's own report, or
began fresh; and one random breaker per save left most save checks unmet. A
constructed-edges test and every breaker on every save now kill all 58. Its
first fix cases were dead on arrival: at time zero a 42-second-old fix is
older than a fresh watch's last issue, so the quiet chart now starts ten
minutes in, and the test asserts that fixes are issued.

## Rescues and surveys ported (2026-11-28)

Porting began by auditing `missions.ts` against restore, which found four
gaps, each closed in the TypeScript first with a regression test
(`f41acfa`, `b61c69c`): survivor counts could be fractional (0.5 remaining
becomes -0.5 after a transfer and the rescue never finishes), a site's kind
need not match its mission, a survey's find was never checked as text, and
a site's speed was never checked though nothing gives a site speed. The Elm
site then became a precise record (`39ab312`) in place of a general hull
body whose depth, kind and name were all optional.

The rescue and survey code moved unchanged into its own module,
`operation.ts` (119 code lines), mirrored by `Sim.Operation` and
`Sim.OperationWork` at `f781466`. The objective panel and seed helpers moved
to `mission-panel.ts` (`0c5a251`), outside the simulation, and the mission
target checks to restore, their only caller (`ebb19a2`). Setup matched on
the first run; the tick and photograph tests needed two test fixes: the
ROV's constructed conditions had to pass through restore, which zeroes a
destroyed part's repair limit, and one rescue had to stay away long enough
for its casualty to founder with survivors aboard.

Mutation testing killed 56 of 65 mutants at first. The played operations
never saved an operation restore refuses, approached before a long patrol
found its site or over a site shallower than the approach depth, started a
rescue with a route set, lost a survivor exactly on the deadline, settled
a casualty exactly to the lost-below mark, passed more than 32 m above the
wreck, or aimed the camera at exactly its reach or a side exactly the
separation from one recorded. A constructed-edges test now covers each,
comparing the operation decoder's verdict with restore's; the exact mark
needs a site where the chart reads exactly 20 m, found by bisection. All 65
mutants fail the tests.
