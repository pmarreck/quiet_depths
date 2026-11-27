# Numbers in the Elm simulation (2026-11-27)

The owner asked whether the Elm simulation should replace IEEE 754 doubles
with a binary mantissa-and-exponent type, for determinism, known significant
bits, deterministic transcendentals, and no NaN or Infinity (which Elm could
then force callers to handle). The port keeps `Float` until the switch either
way, since its oracle is bit-exact equality with the TypeScript and a new
representation would make every mismatch ambiguous.

## Measurement (`scripts/elm-numbers-bench.mjs`, Node 24, `--optimize`)

One kernel, the arithmetic of a tick in miniature (a degree-7 polynomial as
a software sine would evaluate, velocity, drag, position, a wrapped heading,
about 25 operations), in three representations:

| Representation | ns per step | times Float | result after 2 million steps |
|---|---|---|---|
| `Float` | 4.0 | 1 | 4105.5309 |
| `Real`, an opaque wrapper around `Float` | 173 | 43 | 4105.5309 (identical) |
| `Num`, 26-bit mantissa, round half to even | 1,040 | 257 | 4118.7371 (0.32% drift) |

- The optimizer unboxes `type Real = Real Float`; the wrapper's whole cost is
  Elm's curried calls (`A2(radd, a, b)`), since an operator is inlined and a
  function is not. Any number type that is not `Float` pays at least this.
- `Num` is a lower bound for a software float: Elm has no 64-bit integer, so
  a mantissa wider than 26 bits needs two limbs, and Elm's core has no count
  of leading zeros, so normalizing narrows in steps. 26 bits is float32
  precision, and the kernel drifted 0.32% from the double result.
- Per operation: about 0.16 ns for `Float`, 7 ns for `Real`, 40 ns for `Num`.
  What that costs a tick depends on how many operations a tick performs,
  which has not been counted: at 10,000 a `Num` tick costs about 0.4 ms
  (affordable even at 20x time compression, two ticks a frame); at 100,000,
  about 4 ms, too much at 20x.
- Elm has no operator overloading, user-defined operators or type classes,
  so every formula becomes prefix calls:
  `vx + (p * thrust - vx * drag) * dt` becomes
  `nadd vx (nmul (nsub (nmul p thrust) (nmul vx drag)) dt)`.

## What each goal needs

- **Determinism across browsers.** ECMAScript fixes `+ - * /` as IEEE
  binary64 with round-to-nearest-even and no extended precision or fused
  operations, so basic arithmetic already agrees in every engine. What differs
  between engines is the transcendental library: `Math.sin`, `cos`, `atan2`,
  `exp`, `pow` and `hypot` are "implementation-approximated". The simulation
  calls them about 380 times in source (sin 134, cos 108, hypot 78, atan2
  27, exp 15). Pure-Elm implementations built from the basic operations
  (fdlibm's algorithms) would make the simulation bit-identical in V8,
  SpiderMonkey and JavaScriptCore at little cost; proving it means running a
  second engine in the tests, a new test dependency.
- **No NaN or Infinity.** In doubles they arise only from division by zero,
  square roots, logarithms, `asin`, `acos` and `pow` outside their domains,
  overflow (`exp` of large numbers; addition and multiplication cannot
  overflow at the game's magnitudes), and input, which the save decoders
  already reject. If none of those can produce one, `Infinity - Infinity` and
  `0 * Infinity` cannot happen either. Routing those few operations through
  total functions whose types force a decision (`divide : Float -> Float ->
  Maybe Float`, and so on), with a custom elm-review rule rejecting the raw
  operations elsewhere, makes the simulation NaN-free by construction, keeps
  operators for the rest, and costs a comparison per guarded operation.
- **Known significant bits, flexible precision.** Only a software number
  type gives these.

## Options (after the switch)

1. Keep `Float`; add guarded partial operations enforced by an elm-review
   rule, and pure-Elm transcendentals checked against a second engine.
   Recommended: it delivers determinism and no NaN or Infinity at almost no
   speed or readability cost.
2. A software number type (`Num`) throughout: also gives known bits, at 40
   ns per operation and prefix arithmetic everywhere. If wanted, first
   convert one hot module and time a real tick.
3. Both: option 1 everywhere, `Num` only where precision must be known.
4. A WASM simulation (Rust, Zig or Roc). WASM has native 64-bit integers
   (Rust and Zig also 128-bit), so a full-precision software number would
   cost a few nanoseconds per operation. But Elm cannot call WASM inside a
   computation: applications get no kernel JavaScript, and ports are
   asynchronous messages. WASM would have to own the whole tick, which means
   writing the simulation in a WASM language instead of Elm and redoing the
   ported modules. Roc fits the owner's criteria best (Elm-like, no runtime
   exceptions, a 128-bit fixed-point `Dec` with no NaN or Infinity) but is
   pre-1.0 with its compiler being rewritten. Worth it only if known
   precision becomes the deciding goal.
