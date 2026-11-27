# Elm simulation: complete or abandon? Checkpoint, 2026-11-27

Status: 37 of 59 simulation modules mirrored in Elm, 1,635 of 4,453 code
lines (36.7%). Every mirrored function is proven equal to the TypeScript by
differential tests, and each test was mutation-checked. The shared records
the remaining modules need are designed: ship, contact, sound, boat, drone.

## Evidence

**Pace on the hard parts.** The ports met the hard parts sooner than feared,
and the pace held:

| Item | Agent time |
|---|---|
| Ship record (47 fields; found two holes in the TypeScript type) | about 30 min |
| Contact record (24 fields; found restore's migrations) | about 12 min |
| Sound record (20 fields, two nested) | about 13 min |
| Boat and drone records (about 70 fields; inventoried eight migrations) | about 20 min |
| Track estimates (92 lines, first port on the records) | about 15 min |
| Hull contacts (166 lines, the tangled one: identity, mutation, callbacks) | about 20 min |

Leaf ports ran 10 to 20 minutes for 30 to 150 lines. Over the whole session,
counting tooling fixes and investigations, about 130 to 200 mirrored lines an
hour.

**Speed.** Elm runs 1.5 to 3 times slower per function than V8's
TypeScript (the acoustics update is 2.3 times after a redesign). A
TypeScript tick takes 0.03 to 0.06 ms, so an Elm tick should stay well under
a millisecond of a 16.7 ms frame.

**The boundary** (`scripts/elm-boundary-bench.mjs`, Node 24). Decoding and
encoding a busy patrol's ships and contacts costs 0.16 to 0.27 ms, 1 to 1.6%
of a frame, about 2.5 times JavaScript's own serialization. Sending the whole
save across every frame would be roughly 1 to 1.5 ms; if Elm owns the state,
only the outbound half crosses, and a snapshot of what the renderer draws
would be smaller still. Not yet measured in a browser (headless Chromium was
stopped by the session's memory guard).

**What the port found that helps either way.** A save-loading bug (weather
names reaching the object prototype), fixed in the TypeScript. Two holes in
the TypeScript ship type (`depth` missing on most surface ships, `tracking`
holding `null`). The full inventory of restore's migrations. Tighter tests:
mutation checking found and closed dozens of corpus gaps, and a tooling flaw
that read timed-out tests as passing.

**What makes the rest cost more than its lines.**

- Seams: ports built on narrow slices chose types independently (the
  carrier's whole-number hits, two representations of the boat's systems);
  each is small, but integration is real work.
- Restore migrates eight kinds of older boat save; an Elm save decoder must
  carry them all to load every save the game accepts today.
- The world record still has shapes to pin down (convoy, battle, traffic,
  gun, torpedoes, shells, aircraft, impacts, lightning).
- Until the switch, every simulation change is made twice.

## Bottom-up estimate of what remains (agent time)

| Work | Estimate |
|---|---|
| systems 327, missions 289 | 3 to 4 h |
| patrol tick 276 (the heart, everything meets) | 2 to 3 h |
| restore 203 as the Elm save decoder, with the eight migrations | 2 to 3 h |
| combat 203, convoy watch 188, recon 187, cold watch 176, torpedo run 169 | 5 to 6 h |
| fleet action, air support, patrol contacts, hostile tracks (104 to 118 each) | 3 h |
| nine small modules (1 to 84 lines) | 2 to 3 h |
| the remaining world records and seams | 3 to 5 h |
| the switch: Elm owns the state, the renderer and UI read snapshots, inputs and replay through ports | 4 to 6 h |
| browser verification and a full play-through of every mission | 2 to 3 h |
| **Total** | **about 26 to 36 h, four to six sessions like today's** |

## Options

1. **Complete.** About 26 to 36 agent hours. To contain the cost: pause
   simulation feature work during the push so nothing is built twice, port
   toward the patrol tick in dependency order, and switch with both
   simulations running side by side in development, comparing every tick,
   before the TypeScript one is retired.
2. **Stop and keep the TypeScript simulation.** Elm keeps the UI and the
   rules catalog. Fix the TypeScript type holes the port found, keep the
   tests it tightened, and end double implementation at once. The cost so far
   (about a day and a half of porting) is sunk; its findings are kept.
3. **Decide after the browser check.** Restart headless Chromium and measure
   the boundary during live patrol ticks (about 30 minutes), then choose.

## Recommendation

Complete, after the 30-minute browser check. The hard parts proved
tractable at the leaf pace, speed is not a concern at this scale, the
boundary costs about a millisecond at worst and can be made cheaper, and a
single language for state, rules and UI suits where the project is going.
The real costs are bounded and known: the switch, the migrations and the
double implementation until then, which a pause on simulation features
contains. If feature work matters more in the coming weeks, option 2 is the
cheaper path, and nothing found so far is wasted.
