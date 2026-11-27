module Sim.Text exposing (codeUnits)

{-| Strings as JavaScript sees them. Elm's string functions read characters,
and read an unpaired surrogate wrongly: `Char.toCode` gives NaN for a lone
high surrogate, and folding over a lone low surrogate swallows its
neighbor. Patrol saves may carry such strings, so the simulation reads text
through these.
-}


{-| The UTF-16 code units JavaScript's `charCodeAt` reads, index by index. -}
codeUnits : String -> List Int
codeUnits text =
    List.map (\i -> unitOf (String.slice i (i + 1) text)) (List.range 0 (String.length text - 1))


fromUnit : Int -> String
fromUnit unit =
    String.fromChar (Char.fromCode unit)


{-| A one-unit string's code unit. Strings compare by code unit, so a
surrogate, which no character function reads, is found by bisection.
-}
unitOf : String -> Int
unitOf unit =
    if unit >= fromUnit 0xD800 && unit <= fromUnit 0xDFFF then
        let
            search low high =
                if low >= high then
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
