# The shared ship and contact records in Elm

Part of running toward the hard parts before the Elm simulation checkpoint
(see `simulation-to-elm.md`). Both records are shared by most of the modules
still to port. Until now each Elm port took an extensible record naming the
fields it uses.

## The ship record: what the TypeScript actually holds

`Ship` in `patrol-world.ts` is the intersection of every module's vessel
slice: 47 fields. The checker printed them (TypeScript 7 has no JavaScript
API, so a scratch file assigned the type to `number` under
`--noErrorTruncation`). A survey of 7,956 ships in 1,544 saved states (every
mission, six seeds, standard and long patrols, ten minutes each) showed what
saves really carry.

Two holes in the TypeScript type:

- `depth` is typed as always present, but most surface ships have none (14%
  of merchants, 42% of escorts, every submarine). Code that trusts the type
  can read `undefined`.
- `tracking` is typed `string | undefined`, but saves hold `null` once a
  pursuit breaks off, and the values are only `tracking`, `searching` and
  `decoy`. The code compares `tracking ?? null`, so absent and `null` mean the
  same.

Nested records: a hunter's `report` is open (`[key: string]: unknown`), but
saves carry exactly x, y, depth, heading, speed, time and reason, and restore
requires the first six. A `parley` (cold-watch's stand) has against, level,
order (watch, approach, stop, warn, fight, retreat), range, next, cruise and
an optional origin. `patrolSpeed`, `clue`, `nextInquiry` and `parley` are
deleted back to absent; no other field is ever `null`.

## Decision for the dual-implementation period

`Sim.Ship` mirrors the TypeScript field for field: the fields restore
requires (id, name, kind, x, y, heading, speed, hull, alert, attack) are plain,
every other field is a `Maybe`, so a save round-trips exactly. `kind` is
`Sim.Vessel.Kind`, `side` is `Sim.Vessel.Side`, and `tracking` is a
`Maybe Pursuit`. Kind-specific facts (a carrier's hits and fighters, a
submarine's decoys and tube side) stay optional fields rather than a custom
type per role: a structured record would read better in Elm, but while both
implementations change together a one-to-one shape keeps the differential
tests mechanical. Restructuring belongs after the cutover, if it happens.

The decoder rejects what restore rejects for a ship (types of the required
fields, finite numbers, the non-negative timers, a clue or report from the
future, a report missing its fix, decoys outside 0 to 2). It is stricter in
one deliberate way: a present field of the wrong type fails, where restore
never looks at most optional fields. Only a tampered save differs; old saves
lack fields, and absent fields decode as `Nothing`. Checks that need other
parts of the patrol (allied fixes, carrier rules, traffic) stay with the
modules that own them.
