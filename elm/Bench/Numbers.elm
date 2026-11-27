port module Bench.Numbers exposing (main)

{-| What a software number type would cost the simulation. One kernel, the
arithmetic of a typical tick in miniature (a degree-7 polynomial, as a
software sine would evaluate, then velocity, drag, position and a wrapped
heading), runs in three representations:

  - `Float`, as the simulation computes today;
  - `Real`, an opaque wrapper around `Float`, the price of a checked type
    that keeps IEEE arithmetic underneath;
  - `Num`, a binary mantissa and exponent with a 26-bit mantissa, the
    widest whose products stay exact in a JavaScript number, rounded to
    nearest even. Elm has no 64-bit integer, so a 53-bit mantissa would need
    two limbs and cost more. This is a lower bound for a software float.

A measurement, not a test; `scripts/elm-numbers-bench.mjs` drives it.

-}

import Bitwise
import Json.Decode as D
import Json.Encode as E


port request : (D.Value -> msg) -> Sub msg


port reply : E.Value -> Cmd msg



-- FLOAT


{-| A named zero, so the polynomial keeps the additions the other kernels make.
-}
zero : Float
zero =
    0


floatRun : Int -> Float -> Float -> Float -> Float
floatRun n x vx h =
    if n <= 0 then
        x + vx + h

    else
        let
            p : Float
            p =
                ((((((-0.000198 * h + zero) * h + 0.0083333) * h + zero) * h - 0.1666667) * h + zero) * h + 1) * h + zero

            vx2 : Float
            vx2 =
                vx + (p * 2 - vx * 0.05) * 0.25

            h1 : Float
            h1 =
                h + 0.01 * 0.25
        in
        floatRun (n - 1)
            (x + vx2 * 0.25)
            vx2
            (if h1 > 3.14159 then
                h1 - 6.28318

             else
                h1
            )



-- REAL


type Real
    = Real Float


radd : Real -> Real -> Real
radd (Real a) (Real b) =
    Real (a + b)


rsub : Real -> Real -> Real
rsub (Real a) (Real b) =
    Real (a - b)


rmul : Real -> Real -> Real
rmul (Real a) (Real b) =
    Real (a * b)


rgt : Real -> Real -> Bool
rgt (Real a) (Real b) =
    a > b


type alias RealConstants =
    { c7 : Real, c5 : Real, c3 : Real, c1 : Real, zero : Real, thrust : Real, drag : Real, dt : Real, turn : Real, limit : Real, span : Real }


realConstants : RealConstants
realConstants =
    { c7 = Real -0.000198, c5 = Real 0.0083333, c3 = Real -0.1666667, c1 = Real 1, zero = Real 0, thrust = Real 2, drag = Real 0.05, dt = Real 0.25, turn = Real 0.01, limit = Real 3.14159, span = Real 6.28318 }


realRun : RealConstants -> Int -> Real -> Real -> Real -> Float
realRun c n x vx h =
    if n <= 0 then
        case radd x (radd vx h) of
            Real v ->
                v

    else
        let
            p : Real
            p =
                radd (rmul (radd (rmul (radd (rmul (radd (rmul (radd (rmul (radd (rmul (radd (rmul c.c7 h) c.zero) h) c.c5) h) c.zero) h) c.c3) h) c.zero) h) c.c1) h) c.zero

            vx2 : Real
            vx2 =
                radd vx (rmul (rsub (rmul p c.thrust) (rmul vx c.drag)) c.dt)

            h1 : Real
            h1 =
                radd h (rmul c.turn c.dt)
        in
        realRun c
            (n - 1)
            (radd x (rmul vx2 c.dt))
            vx2
            (if rgt h1 c.limit then
                rsub h1 c.span

             else
                h1
            )



-- NUM: value = mantissa * 2 ^ exponent, both whole numbers held in Floats.


type Num
    = Num Float Float


top : Float
top =
    67108864


{-| 2 ^ k for 0 <= k <= 30, exactly.
-}
pow2 : Int -> Float
pow2 k =
    toFloat (Bitwise.shiftLeftBy k 1)


{-| The number of bits in a whole number from 1 to 2^53. Elm has no count of
leading zeros, so this narrows in steps.
-}
bitLength : Float -> Int -> Int
bitLength value count =
    if value >= 65536 then
        bitLength (value / 65536) (count + 16)

    else if value >= 256 then
        bitLength (value / 256) (count + 8)

    else if value >= 16 then
        bitLength (value / 16) (count + 4)

    else if value >= 2 then
        bitLength (value / 2) (count + 1)

    else
        count + 1


withSign : Float -> Float -> Float
withSign like magnitude =
    if like < 0 then
        negate magnitude

    else
        magnitude


{-| Rounds a whole number below 2^53 to a 26-bit mantissa, half to even.
-}
normalize : Float -> Float -> Num
normalize v e =
    if isNaN v || v == 0 then
        Num 0 0

    else
        let
            a : Float
            a =
                Basics.abs v

            shift : Int
            shift =
                bitLength a 0 - 26
        in
        if shift > 0 then
            let
                p : Float
                p =
                    pow2 shift

                q : Float
                q =
                    toFloat (floor (a / p))

                r : Float
                r =
                    a - q * p

                rounded : Float
                rounded =
                    if r > p / 2 || (r == p / 2 && Bitwise.and (floor q) 1 == 1) then
                        q + 1

                    else
                        q
            in
            if rounded >= top then
                Num (withSign v (rounded / 2)) (e + toFloat shift + 1)

            else
                Num (withSign v rounded) (e + toFloat shift)

        else if shift < 0 then
            Num (v * pow2 (negate shift)) (e + toFloat shift)

        else
            Num v e


nmul : Num -> Num -> Num
nmul (Num ma ea) (Num mb eb) =
    normalize (ma * mb) (ea + eb)


nadd : Num -> Num -> Num
nadd (Num ma ea) (Num mb eb) =
    if ma == 0 then
        Num mb eb

    else if mb == 0 then
        Num ma ea

    else if ea >= eb then
        if ea - eb > 26 then
            Num ma ea

        else
            normalize (ma * pow2 (round (ea - eb)) + mb) eb

    else if eb - ea > 26 then
        Num mb eb

    else
        normalize (mb * pow2 (round (eb - ea)) + ma) ea


nsub : Num -> Num -> Num
nsub a (Num mb eb) =
    nadd a (Num (negate mb) eb)


ngt : Num -> Num -> Bool
ngt a b =
    case nsub a b of
        Num m _ ->
            m > 0


fromFloat : Float -> Num
fromFloat f =
    if f == 0 then
        Num 0 0

    else
        let
            scale : Float -> Float -> Num
            scale value e =
                if Basics.abs value >= top then
                    scale (value / 2) (e + 1)

                else if Basics.abs value < top / 2 then
                    scale (value * 2) (e - 1)

                else
                    normalize (toFloat (round value)) e
        in
        scale f 0


toFloatNum : Num -> Float
toFloatNum (Num m e) =
    m * (2 ^ e)


type alias NumConstants =
    { c7 : Num, c5 : Num, c3 : Num, c1 : Num, zero : Num, thrust : Num, drag : Num, dt : Num, turn : Num, limit : Num, span : Num }


numConstants : NumConstants
numConstants =
    { c7 = fromFloat -0.000198, c5 = fromFloat 0.0083333, c3 = fromFloat -0.1666667, c1 = fromFloat 1, zero = fromFloat 0, thrust = fromFloat 2, drag = fromFloat 0.05, dt = fromFloat 0.25, turn = fromFloat 0.01, limit = fromFloat 3.14159, span = fromFloat 6.28318 }


numRun : NumConstants -> Int -> Num -> Num -> Num -> Float
numRun c n x vx h =
    if n <= 0 then
        toFloatNum (nadd x (nadd vx h))

    else
        let
            p : Num
            p =
                nadd (nmul (nadd (nmul (nadd (nmul (nadd (nmul (nadd (nmul (nadd (nmul (nadd (nmul c.c7 h) c.zero) h) c.c5) h) c.zero) h) c.c3) h) c.zero) h) c.c1) h) c.zero

            vx2 : Num
            vx2 =
                nadd vx (nmul (nsub (nmul p c.thrust) (nmul vx c.drag)) c.dt)

            h1 : Num
            h1 =
                nadd h (nmul c.turn c.dt)
        in
        numRun c
            (n - 1)
            (nadd x (nmul vx2 c.dt))
            vx2
            (if ngt h1 c.limit then
                nsub h1 c.span

             else
                h1
            )


run : String -> Int -> Float
run variant n =
    case variant of
        "real" ->
            realRun realConstants n (Real 0) (Real 0) (Real 0)

        "num" ->
            numRun numConstants n (Num 0 0) (Num 0 0) (Num 0 0)

        _ ->
            floatRun n 0 0 0


main : Program () () D.Value
main =
    Platform.worker
        { init = \_ -> ( (), Cmd.none )
        , update =
            \raw _ ->
                ( ()
                , reply
                    (case D.decodeValue (D.map2 run (D.field "variant" D.string) (D.field "n" D.int)) raw of
                        Ok v ->
                            E.float v

                        Err _ ->
                            E.null
                    )
                )
        , subscriptions = \_ -> request identity
        }
