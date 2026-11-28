module Sim.Finite exposing
    ( Finite
    , Pending
    , Settled(..)
    , Unit
    , below
    , bounded
    , cosine
    , fromFloat
    , hypot3
    , isZero
    , larger
    , literal
    , magnitude
    , minus
    , negative
    , notAbove
    , one
    , over
    , pending
    , plus
    , scale
    , scaled
    , settle
    , sine
    , smaller
    , times
    , toUnit
    , unitLiteral
    , value
    , zero
    )

{-| The owner's number rules as types, piloted on `Sim.CombatGeometry`
(context: docs/plan\_context/numerics.md).

A `Finite` is a number strictly between -MAX and MAX, MAX being the largest
double. It is never NaN, an infinity or negative zero, and never smaller in
magnitude than MIN, the smallest normal double, unless it is zero: a result
that would be smaller becomes ±MIN. No `Finite` holds MAX, so "MAX × 0.5"
cannot be written.

Operations whose result cannot leave that range return a `Finite`: negation,
the magnitude, the larger or smaller of two, bounding, scaling by a `Unit` (a
value in [-1, 1]), and the sine and cosine. Operations whose result can leave
it (sums, differences, products, quotients and hypotenuses) return a
`Pending` value. A `Pending` value carries an overflow along, the way an
infinity does, until `settle` makes the caller say what it means in context.
A quotient by zero is beyond the range on the numerator's side, and 0/0 is 0.

-}

import Sim.Math as M


{-| A finite number in the open range (-MAX, MAX); never negative zero; zero
or at least MIN in magnitude.
-}
type Finite
    = Finite Float


{-| A finite number in [-1, 1].
-}
type Unit
    = Unit Float


{-| The result of arithmetic that may have left the finite range, not yet
settled.
-}
type Pending
    = Pending Float


{-| A pending result, settled: within the range, beyond it, or indeterminate
(an overflow met its opposite, or zero met an overflow). `Beyond` does not
yet say which side: the pilot's one caller treats both alike, and a caller
that saturates by sign adds it.
-}
type Settled
    = Within Finite
    | Beyond
    | Indeterminate


{-| A result within the range made normal: negative zero becomes zero, and a
non-zero magnitude below MIN becomes ±MIN.
-}
normal : Float -> Float
normal v =
    if M.isZero v then
        0

    else if M.abs v < 2.2250738585072014e-308 then
        if v < 0 then
            -2.2250738585072014e-308

        else
            2.2250738585072014e-308

    else
        v


{-| A number written in the source. Only a numeric literal may be passed, which
tests/sim-math.test.mjs checks, so the value is known to be in range.
-}
literal : Float -> Finite
literal v =
    Finite (normal v)


{-| A literal in [-1, 1]; checked as `literal` is.
-}
unitLiteral : Float -> Unit
unitLiteral v =
    Unit (normal v)


value : Finite -> Float
value (Finite v) =
    v


zero : Finite
zero =
    Finite 0


one : Finite
one =
    Finite 1


negative : Finite -> Finite
negative (Finite v) =
    -- Negating zero would give -0.
    if M.isZero v then
        Finite 0

    else
        Finite (negate v)


magnitude : Finite -> Finite
magnitude (Finite v) =
    Finite (M.abs v)


larger : Finite -> Finite -> Finite
larger (Finite a) (Finite b) =
    if b < a then
        Finite a

    else
        Finite b


smaller : Finite -> Finite -> Finite
smaller (Finite a) (Finite b) =
    if a < b then
        Finite a

    else
        Finite b


{-| The value held between a low and a high bound.
-}
bounded : Finite -> Finite -> Finite -> Finite
bounded low high v =
    larger low (smaller high v)


{-| A value scaled by a unit factor, which cannot grow it.
-}
scale : Unit -> Finite -> Finite
scale (Unit u) (Finite v) =
    Finite (normal (u * v))


{-| A value held to [-1, 1].
-}
toUnit : Finite -> Unit
toUnit (Finite v) =
    if v < -1 then
        Unit -1

    else if 1 < v then
        Unit 1

    else
        Unit v


below : Finite -> Finite -> Bool
below (Finite a) (Finite b) =
    a < b


notAbove : Finite -> Finite -> Bool
notAbove (Finite a) (Finite b) =
    a <= b


isZero : Finite -> Bool
isZero (Finite v) =
    M.isZero v


sine : Finite -> Unit
sine (Finite v) =
    Unit (normal (sin v))


cosine : Finite -> Unit
cosine (Finite v) =
    Unit (normal (cos v))


pending : Finite -> Pending
pending (Finite v) =
    Pending v


{-| A number from outside the typed code, such as a field the callers still
hold as a Float. It is checked when settled.
-}
fromFloat : Float -> Pending
fromFloat =
    Pending


plus : Pending -> Pending -> Pending
plus (Pending a) (Pending b) =
    Pending (a + b)


minus : Pending -> Pending -> Pending
minus (Pending a) (Pending b) =
    Pending (a - b)


{-| A product; one of two non-zero numbers that rounds to zero becomes ±MIN.
-}
times : Pending -> Pending -> Pending
times (Pending a) (Pending b) =
    Pending (product a b)


product : Float -> Float -> Float
product a b =
    let
        r : Float
        r =
            a * b
    in
    if M.isZero r && M.truthy a && M.truthy b then
        if (a < 0) == (b < 0) then
            2.2250738585072014e-308

        else
            -2.2250738585072014e-308

    else
        r


{-| A quotient: by zero, beyond the range on the numerator's side, and 0/0 is

1.  A finite quotient that rounds to zero from a non-zero numerator becomes
    ±MIN.

-}
over : Pending -> Pending -> Pending
over (Pending a) (Pending b) =
    if isNaN a || isNaN b then
        Pending (0 / 0)

    else if M.isZero b then
        if M.isZero a then
            Pending 0

        else if a < 0 then
            Pending (negate (1 / 0))

        else
            Pending (1 / 0)

    else
        let
            r : Float
            r =
                a / b
        in
        if M.isZero r && M.truthy a && not (isInfinite b) then
            if (a < 0) == (b < 0) then
                Pending 2.2250738585072014e-308

            else
                Pending -2.2250738585072014e-308

        else
            Pending r


{-| A pending value scaled by a unit factor.
-}
scaled : Unit -> Pending -> Pending
scaled (Unit u) (Pending v) =
    Pending (product u v)


hypot3 : Pending -> Pending -> Pending -> Pending
hypot3 (Pending a) (Pending b) (Pending c) =
    Pending (M.hypot3 a b c)


{-| A pending result checked against the range. MAX itself is beyond it.
-}
settle : Pending -> Settled
settle (Pending v) =
    if isNaN v then
        Indeterminate

    else if 1.7976931348623157e308 <= M.abs v then
        Beyond

    else
        Within (Finite (normal v))
