module Sim.SignalLampSaves exposing (validCopy, validEstimate, validLampFix, validTransmission)

{-| The checks a saved convoy telegram, lamp copy or allied fix must pass,
mirroring the TypeScript signal lamp's. Fields of the wrong type are the save
decoder's to reject; these check values and the telegram texts, written
without a regex package.
-}

import Sim.Math as M
import Sim.SignalLamp exposing (Estimate, LampFix, Transmission, bit, compass, morseScript)


finite : Float -> Bool
finite n =
    not (isNaN n || isInfinite n)


safeInteger : Float -> Bool
safeInteger n =
    finite n && toFloat (floor n) == n && M.abs n <= 9007199254740991


digits : Int -> Int -> String -> Bool
digits fewest most text =
    fewest <= String.length text && String.length text <= most && String.all Char.isDigit text


{-| `SUB <compass point> <1 to 99999> KM`. -}
telegramText : String -> Bool
telegramText text =
    case String.split " " text of
        [ "SUB", point, km, "KM" ] ->
            List.member point compass && digits 1 5 km && not (String.startsWith "0" km)

        _ ->
            False


validEstimate : { e | text : String, x : Float, y : Float, radius : Float, time : Float, number : Float } -> Float -> Bool
validEstimate p time =
    List.all finite [ p.x, p.y, p.radius, p.time ]
        && (p.radius > 0)
        && (p.time >= 0)
        && (p.time <= time)
        && safeInteger p.number
        && (p.number > 0)
        && telegramText p.text


validCopy : Transmission { e | text : String } -> Float -> Bool
validCopy m time =
    let
        full =
            morseScript m.estimate.text |> Maybe.map (\script -> bit (List.length script.letters) - 1) |> Maybe.withDefault 0

        since =
            case m.since of
                Nothing ->
                    True

                Just s ->
                    finite s && s >= 0 && s <= m.elapsed

        completed =
            case ( m.delivered, m.completedAt ) of
                ( True, Just at ) ->
                    finite at && at >= 0 && at <= m.elapsed

                ( False, Nothing ) ->
                    True

                _ ->
                    False
    in
    finite m.elapsed
        && (m.elapsed >= 0)
        && not (time + 0.001 < m.elapsed)
        && since
        && (m.copied >= 0)
        && (m.copied <= full)
        && (m.delivered == (m.copied == full))
        && completed


validTransmission : Transmission Estimate -> Float -> Bool
validTransmission m time =
    validEstimate m.estimate time && validCopy m time


{-| `E|W<1-5 digits> N|S<1-5 digits> D<1-3> C<1-3> K<1-2>`. -}
fixText : String -> Bool
fixText text =
    let
        field letters fewest most part =
            case String.uncons part of
                Just ( first, rest ) ->
                    List.member first letters && digits fewest most rest

                Nothing ->
                    False
    in
    case String.split " " text of
        [ east, north, depth, course, speed ] ->
            field [ 'E', 'W' ] 1 5 east && field [ 'N', 'S' ] 1 5 north && field [ 'D' ] 1 3 depth && field [ 'C' ] 1 3 course && field [ 'K' ] 1 2 speed

        _ ->
            False


validLampFix : LampFix -> Float -> Bool
validLampFix p time =
    fixText p.text
        && List.all finite [ p.depth, p.course, p.speed, p.x, p.y, p.time ]
        && (p.time >= 0)
        && (p.time <= time)
        && (p.course >= 0)
        && (p.course < 360)
        && (p.depth >= 0)
        && (p.speed >= 0)
        && (p.radius == 10)
        && safeInteger p.number
        && (p.number > 0)
