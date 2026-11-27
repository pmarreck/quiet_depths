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

## The contact record

The World's contact type names 15 fields and leaves the rest open
(`[x: string]: unknown`), so the checker cannot say what contacts carry. A
survey of 8,018 saved contacts, the code's writes and restore's checks give
24 fields: the 15 named, plus `lastSweep`, `sweepArea`, the four passive
bearing fields, `probableSide`, `depthEstimate` and `courseEstimated`.
Contacts are gained six ways: visual, passive, active, lights, lamp and
satellite.

`Sim.Contact` follows the ship record's rules. Two things restore does are
more than checks, and the Elm decoder repeats them:

- It migrates: labels from before the lettered designations (`Sierra 12`)
  become the designation of their number, and a number that has none
  rejects the save. `designation` stays in floats, since Elm's `//`
  truncates through 32 bits.
- It accepts an older fix without velocities or uncertainties (or with them
  `null`, read as defaults through `??`) and keeps it as saved; such a fix
  still counts as a fix but cannot be projected. The saved fix keeps those
  fields as `Maybe`s.

Whether a contact may carry a side at all depends on the mission and the
traffic, so that rule stays with the patrol decoder.

The wider lesson for the checkpoint: restore also fills defaults (a site's
hull, resumed traffic, watch warnings) and rewrites old shapes, so the Elm
save decoder has to carry restore's migrations, not only its checks.
