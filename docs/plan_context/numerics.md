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
5. Our own number type with defined semantics, in two levels. Level 1 needs
   no compiler fork: Elm allows kernel JavaScript only in `elm/` and
   `elm-explorations/` packages, but the Nix build lays out `ELM_HOME`
   itself and can supply a small package under such a name with an opaque
   `Num` whose functions run in JavaScript or WASM (64-bit or wider
   mantissas, exact rounding, no NaN, independent of JavaScript's number
   quirks). Arithmetic stays prefix (`Num.add a b`). Level 2 is a compiler
   fork adding `Num` to the `number` class so operators work; the code
   generator runs after types are erased and always emits JavaScript `+`, so
   this needs type-directed generation, weeks of Haskell. WASM matters less
   than it seems: per operation the cost is the call and representing a wide
   number as a JavaScript value, and kernel JavaScript has `Math.clz32`,
   `Math.imul` and typed-array bit access too. Estimate, unmeasured: 80 to
   150 times Float for a double-precision kernel `Num`, against 257 for the
   26-bit pure-Elm one; below about 43 times (the cost of any function per
   operation, measured with the `Real` wrapper) needs compiler inlining.

## Comparing against the TypeScript with a tolerance (owner's proposal)

A software type could be checked against the TypeScript by converting to
Float and allowing a tolerance, without adding the type to the TypeScript.
That works for smooth outputs (positions, speeds, noise). It fails at the
simulation's thresholds (`distance < 48`, `hull > 0`, a draw `< chance`):
a value within rounding of one takes the other branch and the outcome
differs by a whole event, so each such case needs hand triage. Bit-exact
comparison has none, and this port's one-ulp bugs (hypot, grouping, signed
zeros) are exactly what a tolerance would hide. Measure before deciding:
convert one ported module, run its differential tests with a tolerance, and
count branch flips and the time per call.

## The Elm compiler crash met while annotating (2026-11-27)

Annotating a let binding with type variables its enclosing signature does
not bind crashed Elm 0.19.2 in `Type/Solve.hs` ("thread blocked
indefinitely in an MVar operation") where it should report a type error.
The class is long known and open upstream (elm/compiler #2206, #2100,
#1639, #2014, #2185, #2301, from 2017 on). Upstream fixes are rare and
outside pull requests seldom merged, so a fix would mean carrying a patch in
our own Nix-built compiler; not worth it unless the bug keeps costing work.

## The fork's progress (elm-compiler agent, 2026-11-27 17:44)

The fork builds under Nix and tracks upstream `main`, which reports 0.19.3.
The let-annotation crash reduces to a single file: inside an unannotated
`f x`, a let binding `y : a` whose body is `x` (the rigid `a` unifies with
`x`'s type from the enclosing scope, which cannot be generalized; the solver
then crashes in its post-generalization check). The planned fix reports it as
a type error naming the annotation and the outer value. Order of work: the
crash family, then a kernel-backed `Num` (kernel JavaScript only in the
fork's own package, fuzzed against an exact rational oracle, arithmetic proved
in Lean 4), then operators designed around the compiled-once polymorphism
problem, then the WASM measurement. Decisions routed to the owner: the fork's
version scheme, binary or decimal exponent, dedicated `Num` operators first
(the fork's recommendation) or overloaded standard operators, and how number
literals type.
