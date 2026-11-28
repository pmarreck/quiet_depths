module Sim.SaveFields exposing (Fields, absentOr, ensure, field, fill, fillNullish, finite, integer, number, object, safeInteger, savedReport, time, truthy)

{-| Reading a saved patrol as JSON fields, as restore does: what JavaScript
finds finite, safe as an integer or truthy, filling a field the way
`=== undefined` and `??=` do, and a saved report.
-}

import Dict exposing (Dict)
import Json.Decode as D
import Json.Encode as E
import Sim.HunterReports as HunterReports
import Sim.Math as M
import Sim.SaveCodec exposing (optional)


{-| A saved patrol's fields by name.
-}
type alias Fields =
    Dict String D.Value


field : String -> D.Decoder a -> Fields -> Maybe a
field key decoder fields =
    Dict.get key fields |> Maybe.andThen (D.decodeValue decoder >> Result.toMaybe)


{-| What `Number.isFinite` accepts.
-}
finite : D.Decoder Float
finite =
    D.float
        |> D.andThen
            (\v ->
                if isNaN v || isInfinite v then
                    D.fail "not finite"

                else
                    D.succeed v
            )


number : String -> Fields -> Maybe Float
number key =
    field key finite


{-| What `Number.isInteger` accepts.
-}
integer : Float -> Bool
integer v =
    not (isInfinite v) && toFloat (floor v) == v


{-| What `Number.isSafeInteger` accepts.
-}
safeInteger : Float -> Bool
safeInteger v =
    integer v && M.abs v <= 9007199254740991


{-| The save's clock, or NaN if it has none yet: comparisons with NaN fail as
they do with whatever the TypeScript compares, and a save without a clock is
refused later.
-}
time : Fields -> Float
time =
    number "time" >> Maybe.withDefault (0 / 0)


{-| JavaScript truthiness of a JSON value.
-}
truthy : D.Value -> Bool
truthy v =
    D.decodeValue
        (D.oneOf
            [ D.null False
            , D.bool
            , D.float |> D.map M.truthy
            , D.string |> D.map (\s -> s /= "")
            , D.succeed True
            ]
        )
        v
        |> Result.withDefault True


{-| A JSON object, not an array.
-}
object : D.Value -> Maybe Fields
object v =
    case D.decodeValue (D.list D.value) v of
        Ok _ ->
            Nothing

        Err _ ->
            D.decodeValue (D.dict D.value) v |> Result.toMaybe


ensure : Bool -> Fields -> Maybe Fields
ensure ok fields =
    if ok then
        Just fields

    else
        Nothing


{-| A field absent, or a finite number passing a test.
-}
absentOr : String -> (Float -> Bool) -> Fields -> Bool
absentOr key ok fields =
    case Dict.get key fields of
        Just _ ->
            number key fields |> Maybe.map ok |> Maybe.withDefault False

        Nothing ->
            True


{-| `if (s.key === undefined) s.key = value`.
-}
fill : String -> E.Value -> Fields -> Fields
fill key value fields =
    if Dict.member key fields then
        fields

    else
        Dict.insert key value fields


{-| `s.key ??= value`.
-}
fillNullish : String -> E.Value -> Fields -> Fields
fillNullish key value fields =
    case Dict.get key fields of
        Just v ->
            if D.decodeValue (D.null ()) v == Ok () then
                Dict.insert key value fields

            else
                fields

        Nothing ->
            Dict.insert key value fields


{-| A report as a save holds it, its optional fields required unless legacy.
-}
savedReport : Bool -> D.Decoder HunterReports.SavedReport
savedReport legacy =
    let
        optionalNumber : String -> D.Decoder (Maybe Float)
        optionalNumber key =
            if legacy then
                optional key finite

            else
                D.field key finite |> D.map Just
    in
    D.map6 HunterReports.SavedReport (D.field "x" finite) (D.field "y" finite) (D.field "time" finite) (optionalNumber "depth") (optionalNumber "heading") (optionalNumber "speed")
