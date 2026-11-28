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

## The crash fix landed (elm-compiler `7c40401b`, 2026-11-27 18:11)

The fork reports the let-annotation case as a TYPE MISMATCH with a hint
(remove the type variable, or annotate the enclosing definition with it);
quiet_depths' Coast.elm shape is its regression test. Using it means the flake
input `github:pmarreck/elm-compiler/7c40401b5101de0c7615771e7b1e05cb93a7dafb`,
`"elm-version": "0.19.3"` in both elm.json files, and a 0.19.3 package
cache; only x86_64-linux is built and tested so far. quiet_depths already
works around the one case it met, so adoption can wait for `Num` or wider
platform coverage. Next in the fork: the `? [rank = 1]` crashes that swallow
an ordinary type error (#2153, #2066, #2013).

## A finite-only number type (owner question, 2026-11-27 19:15)

Asked after the NaN-hit bug (d5ba3a1): can a numeric type require that its
values be rational and finite, and at what ceremony? Every finite double is
already rational (a dyadic fraction); the only values outside the rationals
are NaN and the two infinities. So the requirement is "finite", and the
question is where the checks go.

- **Stock Elm, opaque `Finite` around Float.** A smart constructor
  (`fromFloat : Float -> Maybe Finite`) proves finiteness once; holders can
  rely on it. But Float addition and multiplication can overflow, so a closed
  type needs every `+` and `*` to return `Maybe`, which is heavy ceremony
  for game magnitudes that never approach 1e308. Saturating instead keeps
  the type closed but silently changes values.
- **The light version, like Elixir guards.** Keep Float inside the
  simulation; reject non-finite values where they enter (restore's checks,
  decoders) and make the partial operations total (division, `sqrt`,
  `acos`, `log`, `exp`, `**`), with a test that forbids the raw ones in
  `Sim.*`, as one already forbids the Basics arithmetic that differs from
  JavaScript. Bounded magnitudes plus total operations keep every value
  finite without touching `+`. Only possible after the switch, since the
  TypeScript must match until then.
- **The fork's `Num`.** A {mantissa, exponent} pair cannot represent NaN or
  infinity, so finiteness is structural; partial operations return
  `Maybe`/`Result` or take refined arguments (`NonZero`); dedicated operators
  remove the ceremony. Sent to the elm-compiler agent as a requirement.

None of these were measured for speed here; the bench in elm/Bench can.

**Fork base (owner, 2026-11-27 19:31):** the elm-compiler fork's changes now
apply to a fork of Elm's latest development (beta) release, not 0.19.2.
quiet_depths pins it only when Peter says it is ready. The switch then
changes `"elm-version"` in elm.json and review/elm.json, the package cache
directory and the elm2nix sources, and may change behavior the development
branch altered, so every differential test and the numbers bench rerun
across it, and the bench compares the two compilers' output speed.

## What produced the NaN hits, and making them impossible (2026-11-27 19:55)

Only the tests. The 542 NaN hulls came from the systems differential test,
which passes NaN hit sizes on purpose to probe the guard. All 13 places the
game makes a hit size (hull collisions, torpedoes, strafing, lightning,
shells, depth charges, landings, fires, system hits, and the drone's
collisions, seabed strikes and pressure waves) are finite given finite state:
literals, clamps of `hypot`, falloffs over constant denominators, and one
normal division that `capsuleContact` guards (`length > 1e-8`). State is
finite because restore rejects non-finite saves and JSON cannot carry NaN.
With the invalid-number reports throwing, the full suite (570 tests, whole
simulated patrols included) met none but the deliberate ones.

The root cause is the type. A double holds NaN and the infinities as ordinary
values, and a handful of operations make them from finite inputs: 0/0, x/0,
`sqrt` of a negative, `log` of zero or less, `acos`/`asin` out of range,
overflow, Infinity - Infinity, 0 * Infinity. Every author must remember every
guard; this code's authors did, but that is an audit, not a guarantee.

Impossible by construction, by stage:
- **TypeScript:** not possible; `number` includes NaN, and a branded
  `Finite` type still needs a runtime check where it is made.
- **Elm, now:** make the partial operations unavailable in `Sim.*` except as
  total versions with refined arguments (`M.divide : Float -> NonZero ->
  Float`, a `NonNegative` for `sqrt`, a range type for `acos`), enforced by
  a custom elm-review rule that rejects raw `/` with a non-literal
  denominator, `sqrt`, `logBase`, `acos`, `asin` and `^`. Where the
  TypeScript already guards an operation, the total version gives the same
  bits, so the differential tests still hold and this need not wait for the
  switch. Finite inputs then give finite outputs, overflow aside, which
  bounded game magnitudes rule out in practice but not by type.
- **The fork's `Num`:** no representation for NaN or infinity at all; the
  requirement is with the elm-compiler agent.

The invalid-number reports stay as tripwires until then: tests throw, play
warns in the console.

### Total arithmetic: the owner's proposal and its consequences (2026-11-27 20:00)

Peter proposed: 0 divided by anything is 0; anything else divided by 0 is
divided by the smallest representable number instead; ±Infinity becomes
±MAX (1.7976931348623157e308). Consequences, as analyzed:

- The smallest double is 5e-324, and x / 5e-324 overflows for any |x| above
  8.9e-16, so with the third rule x/0 is ±MAX. His literal 1e-20 would give
  x × 1e20 instead (5/0 = 5e20): finite and proportional. The two need a
  choice.
- Gains: division never yields NaN or infinity; Infinity − Infinity and
  0 × Infinity vanish with the infinities (MAX − MAX = 0, MAX × 0 = 0);
  comparisons still order a/0 above everything, so the three ±Infinity
  starting values (hull-contact floor, wake leading edge, propeller sigma)
  keep working as ±MAX.
- Still NaN: sqrt, log, acos and asin outside their domains and negative
  bases to fractional powers; log(0) gives −Infinity. Each needs a rule.
- MAX + MAX overflows, so a guarantee needs a finite check after every
  operation once MAX can appear: a branch per operation (unmeasured).
- A divide-by-zero bug yields a plausible clamped value (collision severity
  saturates at its maximum) instead of a visible NaN, so every coercion
  should still be reported.
- One global rule is right at some sites (time to arrive at zero speed: MAX,
  "never"; a zero-length flight: progress 1, "arrived") and wrong at others
  (normalizing a zero vector flings it to ±MAX), so those keep explicit
  guards.
- The GPU and Web Audio use float32 (largest 3.4e38): MAX becomes Infinity
  there, so values leaving the simulation need clamping to each consumer.
- JSON stores MAX (where Infinity became null and failed restore), so a
  corrupted MAX survives save and restore unless fields are range-checked.
- Until the switch the helpers exist in both languages; only Elm can enforce
  their use.
- Precedent for the alternative x/0 = 0: Lean, Isabelle, Pony's integers and
  Elm's own `//`. It never creates huge values (no overflow checks), but
  says "now" where the limit says "never".

### The owner's number rules (decided 2026-11-27 20:20)

1. **Domains by type.** `sqrt`, `log` and raising to a power take a
   non-negative argument by type; `acos` and `asin` take a value in [-1, 1]
   by type. Passing anything else is a compile error, not a runtime NaN.
   `log 0` is −MAX.
2. **Saturation.** x/0 is ±MAX by the sign of x; 0/0 is 0; ±Infinity
   becomes ±MAX. Underflow follows the same rules toward ±MIN: a nonzero
   result too small to represent becomes ±MIN rather than 0. A value that
   reaches ±MAX or ±MIN is handled where it can arise, by context.
3. **No negative zero.** Impossible by construction.
4. **Zero denominators** are impossible by construction where types are
   used (a non-zero type), or handled by context (a default direction for a
   zero-length vector).
5. **Narrowing and widening** between widths maps MAX to the target's MAX
   (and MIN to its MIN), in both directions.
6. **Saves and restores** reject ±MAX and ±MIN as well as non-finite values.
7. **Both languages** follow the rules until the switch.
8. Lean's x/0 = 0 was rejected: it puts a jump at 0 where ±MAX follows the
   curve from the side the numerator's sign gives.

What the type systems can and cannot carry (as analyzed): Elm's opaque types
and TypeScript's branded types can enforce domains (non-negative, non-zero,
the unit range, no negative zero), because a constructor checks once and
closed operations preserve the property (`sqrt` of a non-negative is
non-negative; a product of non-zeros, with underflow to ±MIN, is non-zero).
Neither can track magnitudes through arithmetic, which needs refinement or
dependent types (Lean, Liquid Haskell, F*), so overflow and underflow are
caught by saturating at run time, not proved absent at compile time. Sums
are not closed for non-zero (a + (−a) = 0), so a sum used as a denominator
must be re-checked by its constructor, and the code must say what a zero
means there. Ruling out negative zero entirely means an opaque number type
in place of Float in the simulation, every operation normalizing; in stock
Elm that is a function call per operation, which the fork's dedicated
operators would remove.

**What MAX means (owner, 20:22):** "probably infinite, definitely
representable, but we have run out of representation room and should be
already handling this situation long before it got to this point in the
code." So MAX is a last-resort floor under a bug, not a working value: the
code that can saturate handles it where it arises, and a MAX that reaches
later arithmetic is itself a bug to report. That answers the stickiness
concern (MAX × 0.5 = 8.99e307, an ordinary finite number, where Infinity ×
0.5 stays Infinity): saturated values must not travel.

## Owner's decisions on MIN, division and the pilot (2026-11-27)

- MIN is the smallest normal double, 2.2e-308; the subnormal range counts as
  underflow and saturates to ±MIN.
- Division returns a result the caller must handle by type, never a bare MAX.
- A value reaching MAX in later arithmetic is a bug to report, as recommended;
  saves reject saturated values by bound.
- Narrowing or widening saturates anything beyond the target's range to the
  target's MAX.
- Pilot one module now, in stock Elm, to measure the ceremony and the time
  per call before building the types more widely.

### Catching "MAX × 0.5" at compile time

The owner asked whether a type allowed only -MAX+1 .. MAX-1 could make
multiplying MAX a compile error. Stock Elm cannot prove that a value never
reaches MAX: proving it takes refinement or dependent types (Liquid Haskell,
F*, Lean), or range inference added to the compiler. What Elm can do is make
MAX unrepresentable and make the compiler force handling at exactly the
operations that could produce it:

- An opaque `Finite` type holds only values strictly between -MAX and MAX,
  never NaN or an infinity. Its smart constructor is the only way in, so no
  `Finite` ever holds MAX.
- Operations whose result cannot leave the range are total and return
  `Finite`: scaling by a unit-range factor, averaging, clamping, negation,
  the absolute value.
- Operations whose result can leave the range return a must-handle result:
  division, and general multiplication and addition of two unbounded values.
  The caller decides, in context, what saturation means.

"MAX × 0.5" therefore cannot be written: no MAX value exists to multiply, and
the operation that would have produced one already made its caller handle the
overflow. The pilot measures how often that handling appears in real code.

### Fading values end by threshold, not by reaching zero (owner, 2026-11-27)

A side agent noted that under the MIN rule a value shrinking by repeated
multiplication (speed × 0.98, a glow × 0.9) never reaches zero: it saturates
at ±MIN and stays there, so a check such as "is shock above 0?" would stay
true for the rest of a patrol. Fading by 0.9 per tick reaches the subnormal
range after about 6,700 ticks, about half an hour of quarter-second ticks.

The owner's ruling: relying on a fade reaching exactly zero relies on the
representation's inaccuracy, which code must not do. A fading value ends when
it reaches MIN or a threshold that means "gone" in its context, tested
explicitly. Zero itself stays representable and exact (0 × anything is 0);
only a non-zero value that shrinks stops at ±MIN. When the number types are
built across modules, every multiplicative fade and every test of such a
value against zero is checked, and a test that depends on underflow reaching
zero becomes a threshold test, TypeScript first.

## The pilot: combat geometry with number types (2026-11-27, `fc52e31`)

`Sim.Finite` holds the rules as types: `Finite` (never NaN, an infinity,
±MAX or -0; zero or at least MIN), `Unit` ([-1, 1]) and `Pending` (the
result of arithmetic that may have left the range, carried along as an
infinity would be until `settle` returns `Within`, `Beyond` or
`Indeterminate`). Operations that cannot leave the range return `Finite`;
sums, differences, products, quotients and hypotenuses return `Pending`. A
source check limits the unchecked `literal` and `unitLiteral` to numeric
literals in range. `Sim.CombatGeometry`'s ship-box and sphere tests were
rewritten with them, behind their unchanged Float interface.

**Correctness.** Every differential test still matches the TypeScript bit
for bit (605 tests): within the range the rules change no result.

**Speed** (`scripts/elm-geometry-bench.mjs`, `--optimize`, 5,000 paths,
best of 5, Node 24):

| Function | Float ns/call | Finite ns/call | Times Float |
|---|---|---|---|
| `shipHit` | 1,019 | 1,715 | 1.68 |
| `sphereHit` | 119 | 328 | 2.5 to 2.8 |

- The overhead is about 10 to 15 ns per typed operation: Elm calls every
  function through its curried `A2`, where an operator compiles inline. Only
  operators or inlining, which the fork could give, remove it.
- Style mattered: `Maybe.andThen` and `Maybe.map` pipelines made
  `sphereHit` 3.9 times slower than Float; the same logic as direct `case`
  on `settle` is 2.6 times.
- Per tick: a gunfight's few hundred hit tests would add about 0.2 ms.

**Ceremony.** The module grew from 146 to 203 code lines (+39%) and from
2,244 to 4,288 characters (1.9x), with 128 calls into `Sim.Finite`, plus
186 lines for `Sim.Finite` itself, once. `(low - s) / v` became
`F.over (F.minus (F.pending low) (F.pending s)) (F.pending v)`. The compiler
forced a decision at 11 points; all 10 resulting "beyond the range" branches
are unreachable while coordinates stay below 1e150, and each fails closed (no
hit). `Beyond` lost its side: no caller here needed it.

**What it bought here.** No new bug: the TypeScript already guarded its one
division and its zero-length path. What changed is that the guards became
structural. No operation in the module can yield NaN or an infinity
unhandled, and the compiler, not an audit, says so.

**Findings for the decision.**

1. The partial operations (division, `sqrt`, `acos`, `asin`, `log`, powers)
   are where NaN and infinities actually arise. Typing them (`NonZero`,
   `NonNegative`, `Unit` arguments, quotients as `Pending`) costs little:
   a handful of call sites per module.
2. Typing every `+`, `-` and `*` as `Pending` produced most of the ceremony
   and all of the unreachable branches. Game magnitudes are bounded, so
   those branches guard against values no patrol holds.
3. Storage is the natural settle point: world fields held as `Finite` would
   catch an overflow when a tick writes it, and saves already must reject
   ±MAX and ±MIN.

## The development beta ran out of memory on quiet_depths (2026-11-27 20:17-20:36)

Five out-of-memory kills, each an Elm compiler at 89 to 97 GB resident,
came from the elm-compiler agent's A/B benchmark (`bench/run4/ab.sh`), which
compiles a copy of quiet_depths' `elm/` tree with each candidate compiler:
two of the killed PIDs appear in its output, and the script's own comment
says the 0.19.4 beta runs out of memory on quiet_depths (it gained a switch
to skip the project). This session's compiles in that window all finished
normally. Since the fork now tracks that development release, pinning it
here must wait until it compiles quiet_depths in ordinary memory; a memory
cap on such benchmarks (a `systemd-run --user -p MemoryMax=` scope) would
turn a host-wide out-of-memory event into one failed run.

## PDEA's progress (owner, 2026-11-28 14:55 EST)

PDEA, the owner's exact rational arithmetic core in Rust for native use and
WebAssembly (a separate repository), has found significant speedups and is
adding transcendental functions and matrix operations. Those would serve
the simulation's 2D and 3D geometry that is not handed to three.js. Nothing
here depends on it yet. It bears on the `Num` question and the numerics
experiment above once either is taken up after the switch.
