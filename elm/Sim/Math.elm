module Sim.Math exposing (cbrt, clamp, exp, expm1, hypot2, hypot3, remainder, tanh)

{-| Arithmetic the simulation needs exactly as JavaScript computes it, so the
Elm simulation reproduces the TypeScript one bit for bit in V8.

Elm has no `Math.hypot`, and `sqrt (x*x + y*y)` differs from it in the last
bit for many inputs. These follow V8's algorithm: scale by the largest
magnitude, then sum the squares with Kahan compensation. Elm also has no
floating-point remainder; `remainder` matches JavaScript's `%` exactly.

Elm has no `exp`, `expm1`, `tanh` or `cbrt` either, and `e ^ x` differs from
`Math.exp` in the last bits for most inputs. The TypeScript simulation computes
these through `typescript/sim-math.ts` with the same formulas, so both agree.
-}


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
        if largest == 0 then
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
        if largest == 0 then
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
    if isNaN x || isNaN y || isInfinite x || y == 0 then
        0 / 0

    else if isInfinite y then
        x

    else
        let
            target =
                abs y

            -- Elm's abs keeps a negative zero, so -0 % y comes out as -0, as in JavaScript.
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
