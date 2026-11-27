module Sim.Text exposing (codePointUnits, codeUnits, toFixed)

{-| Strings as JavaScript sees them. Elm's string functions read characters,
and read an unpaired surrogate wrongly: `Char.toCode` gives NaN for a lone
high surrogate, and folding over a lone low surrogate swallows its
neighbor. Patrol saves may carry such strings, so the simulation reads text
through these.

Numbers are written as JavaScript's `toFixed` writes them, which rounds the
exact binary value half up: 0.15 is stored as 0.1499... and gives "0.1".
-}


{-| The UTF-16 code units JavaScript's `charCodeAt` reads, index by index. -}
codeUnits : String -> List Int
codeUnits text =
    List.map (\i -> unitOf (String.slice i (i + 1) text)) (List.range 0 (String.length text - 1))


{-| What `for (const c of text) c.charCodeAt(0)` reads: one unit per code
point, the high surrogate of a pair, and an unpaired surrogate as itself.
-}
codePointUnits : String -> List Int
codePointUnits text =
    let
        points units =
            case units of
                high :: low :: rest ->
                    if 0xD800 <= high && high <= 0xDBFF && 0xDC00 <= low && low <= 0xDFFF then
                        high :: points rest

                    else
                        high :: points (low :: rest)

                _ ->
                    units
    in
    points (codeUnits text)


fromUnit : Int -> String
fromUnit unit =
    String.fromChar (Char.fromCode unit)


{-| A one-unit string's code unit. Strings compare by code unit, so a
surrogate, which no character function reads, is found by bisection.
-}
unitOf : String -> Int
unitOf unit =
    if fromUnit 0xD800 <= unit && unit <= fromUnit 0xDFFF then
        let
            search low high =
                if high <= low then
                    low

                else
                    let
                        mid =
                            (low + high) // 2
                    in
                    if unit <= fromUnit mid then
                        search low mid

                    else
                        search (mid + 1) high
        in
        search 0xD800 0xDFFF

    else
        case String.uncons unit of
            Just ( char, _ ) ->
                Char.toCode char

            Nothing ->
                0


{-| Dekker's split of a double into high and low halves of 26 bits. -}
split : Float -> ( Float, Float )
split a =
    let
        c =
            134217729 * a

        high =
            c - (c - a)
    in
    ( high, a - high )


{-| `a * scale` as a rounded product and its exact error, so that the two sum
to the true product (Dekker's TwoProduct). The scale is a whole number below
2^26, which needs no split of its own.
-}
twoProduct : Float -> Float -> ( Float, Float )
twoProduct a scale =
    let
        p =
            a * scale

        ( ah, al ) =
            split a
    in
    ( p, ah * scale - p + al * scale )


{-| JavaScript's `x.toFixed(digits)` for 0 to 3 digits, exact for magnitudes
below 2^53 / 10^digits (about 9 * 10^12 at three digits), far beyond any
patrol value.
-}
toFixed : Int -> Float -> String
toFixed digits x =
    if isNaN x then
        "NaN"

    else if Basics.abs x >= 1.0e21 then
        String.fromFloat x

    else if x < 0 then
        "-" ++ toFixed digits (negate x)

    else
        let
            scale =
                toFloat (10 ^ digits)

            whole =
                toFloat (floor x)

            ( p, err ) =
                twoProduct (x - whole) scale

            -- The scaled fraction is exactly p + err; round it half up on
            -- the exact remainder. A value just below a whole number rounds
            -- up to it, so the floor of p serves even when err is negative.
            below =
                toFloat (floor p)

            up =
                negate err <= p - below - 0.5

            n =
                whole
                    * scale
                    + below
                    + (if up then
                        1

                       else
                        0
                      )

            text =
                String.padLeft (digits + 1) '0' (String.fromFloat n)
        in
        if digits <= 0 then
            text

        else
            String.dropRight digits text ++ "." ++ String.right digits text

