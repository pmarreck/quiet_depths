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
