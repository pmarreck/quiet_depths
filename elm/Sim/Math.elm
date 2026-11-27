module Sim.Math exposing (abs, cbrt, clamp, exp, expm1, hypot2, hypot3, imul, isZero, max, min, remainder, sign, tanh, toInt32, truthy)

{-| Arithmetic the simulation needs exactly as JavaScript computes it, so the
Elm simulation reproduces the TypeScript one bit for bit in V8.

Elm has no `Math.hypot`, and `sqrt (x*x + y*y)` differs from it in the last
bit for many inputs. These follow V8's algorithm: scale by the largest
magnitude, then sum the squares with Kahan compensation. Elm also has no
floating-point remainder; `remainder` matches JavaScript's `%` exactly.

Elm's own `max`, `min`, `abs` and `clamp` differ from JavaScript's for NaN
and signed zeros: `max 0 (-0)` is -0 where `Math.max(0, -0)` is 0, and
`max (0/0) 1` is 1 where `Math.max(NaN, 1)` is NaN. The simulation uses the
versions here, qualified, so it always gets JavaScript's answer.

The optimizing compiler turns `x == 0` into JavaScript's `!x`, which is also
true for NaN, and `x /= 0` into `!!x`. The simulation asks `isZero` instead,
which means `x === 0`.

Elm has no `exp`, `expm1`, `tanh` or `cbrt` either, and `e ^ x` differs from
`Math.exp` in the last bits for most inputs. The TypeScript simulation computes
these through `typescript/sim-math.ts` with the same formulas, so both agree.
-}

import Bitwise


{-| JavaScript's `x === 0`: true for 0 and -0, false for NaN. -}
isZero : Float -> Bool
isZero x =
    not (isNaN x) && x == 0


{-| JavaScript's `x | 0`: the number wrapped to a signed 32-bit integer, with
NaN and the infinities becoming 0. Elm's `truncate` compiles to exactly this,
which is why the simulation never calls it under its own name.
-}
toInt32 : Float -> Int
toInt32 =
    Basics.truncate


{-| JavaScript's `Math.imul`: the low 32 bits of the product, signed. Elm's
`*` multiplies as doubles, so the 16-bit halves are multiplied separately.
Every partial product and the final sum stay below 2^53, so each is exact,
and the closing `| 0` keeps the low 32 bits.
-}
imul : Int -> Int -> Int
imul a b =
    let
        aLow =
            Bitwise.and a 0xFFFF

        bLow =
            Bitwise.and b 0xFFFF
    in
    Bitwise.or 0 (aLow * bLow + Bitwise.shiftLeftBy 16 (Bitwise.shiftRightZfBy 16 a * bLow + aLow * Bitwise.shiftRightZfBy 16 b))


{-| JavaScript's truthiness of a number: false for 0, -0 and NaN. -}
truthy : Float -> Bool
truthy x =
    not (isZero x || isNaN x)


isNegativeZero : Float -> Bool
isNegativeZero x =
    isZero x && 1 / x < 0


{-| Math.max of two values: NaN if either is, and 0 above -0. -}
max : Float -> Float -> Float
max a b =
    if isNaN a || isNaN b then
        0 / 0

    else if a > b then
        a

    else if b > a then
        b

    else if isNegativeZero a then
        b

    else
        a


{-| Math.min of two values: NaN if either is, and -0 below 0. -}
min : Float -> Float -> Float
min a b =
    if isNaN a || isNaN b then
        0 / 0

    else if a < b then
        a

    else if b < a then
        b

    else if isNegativeZero a then
        a

    else
        b


{-| Math.abs: the magnitude, with -0 becoming 0. -}
abs : Float -> Float
abs x =
    if x < 0 then
        negate x

    else if isZero x then
        0

    else
        x


{-| Math.sign: -1, 1, or the zero or NaN it was given. -}
sign : Float -> Float
sign x =
    if x > 0 then
        1

    else if x < 0 then
        -1

    else
        x


{-| `Math.max(low, Math.min(high, value))`, as the TypeScript writes it. -}
clamp : Float -> Float -> Float -> Float
clamp low high value =
    max low (min high value)


{-| Math.hypot of two values. -}
hypot2 : Float -> Float -> Float
hypot2 x y =
    let
        a =
            abs x

        b =
            abs y
    in
    if isInfinite a || isInfinite b then
        1 / 0

    else if isNaN a || isNaN b then
        0 / 0

    else
        let
            largest =
                max a b
        in
        if isZero largest then
            0

        else
            let
                ( s1, c1 ) =
                    kahan a largest ( 0, 0 )

                ( s2, _ ) =
                    kahan b largest ( s1, c1 )
            in
            sqrt s2 * largest


{-| Math.hypot of three values. -}
hypot3 : Float -> Float -> Float -> Float
hypot3 x y z =
    let
        a =
            abs x

        b =
            abs y

        c =
            abs z
    in
    if isInfinite a || isInfinite b || isInfinite c then
        1 / 0

    else if isNaN a || isNaN b || isNaN c then
        0 / 0

    else
        let
            largest =
                max a (max b c)
        in
        if isZero largest then
            0

        else
            let
                ( s1, c1 ) =
                    kahan a largest ( 0, 0 )

                ( s2, c2 ) =
                    kahan b largest ( s1, c1 )

                ( s3, _ ) =
                    kahan c largest ( s2, c2 )
            in
            sqrt s3 * largest


kahan : Float -> Float -> ( Float, Float ) -> ( Float, Float )
kahan magnitude largest ( sum, compensation ) =
    let
        n =
            magnitude / largest

        summand =
            n * n - compensation

        preliminary =
            sum + summand
    in
    ( preliminary, (preliminary - sum) - summand )


exp : Float -> Float
exp x =
    e ^ x


expm1 : Float -> Float
expm1 x =
    e ^ x - 1


{-| Beyond ±20 the result is ±1 to double precision; the cutoff keeps e ^ (2x) finite. -}
tanh : Float -> Float
tanh x =
    if x > 20 then
        1

    else if x < -20 then
        -1

    else
        let
            e2 =
                e ^ (2 * x)
        in
        (e2 - 1) / (e2 + 1)


cbrt : Float -> Float
cbrt x =
    if x < 0 then
        negate (negate x ^ (1 / 3))

    else
        x ^ (1 / 3)


{-| JavaScript's `x % y`: the remainder with the sign of `x`, computed exactly.
Each step subtracts the largest power-of-two multiple of `y` not above the
running remainder; by Sterbenz's lemma every subtraction is exact.
-}
remainder : Float -> Float -> Float
remainder x y =
    if isNaN x || isNaN y || isInfinite x || isZero y then
        0 / 0

    else if isInfinite y || isZero x then
        x

    else
        let
            target =
                abs y

            reduce r =
                if r < target then
                    r

                else
                    reduce (r - largestMultiple target r)

            magnitude =
                reduce (abs x)
        in
        if x < 0 then
            negate magnitude

        else
            magnitude


{-| The largest `y * 2^k` that does not exceed `r`, given `y <= r`. -}
largestMultiple : Float -> Float -> Float
largestMultiple y r =
    let
        grow t =
            if t * 2 <= r && not (isInfinite (t * 2)) then
                grow (t * 2)

            else
                t
    in
    grow y
