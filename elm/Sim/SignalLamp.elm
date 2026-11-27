module Sim.SignalLamp exposing
    ( Bearing
    , Estimate
    , LampFix
    , Script
    , Span
    , Transmission
    , alliedFix
    , bit
    , compass
    , copyLamp
    , copyPercent
    , dotSeconds
    , lampLit
    , lampRange
    , liveTransmission
    , makeTransmission
    , matchingBearing
    , morseScript
    , reportRadius
    )

{-| Signal lamps: convoy telegrams and allied fixes flashed in Morse, copied
letter by letter while the lamp stays in view, and the coarse chart region a
telegram names. The checks a saved telegram, copy or fix must pass are in
`Sim.SignalLampSaves`.
-}

import Bitwise
import Dict exposing (Dict)
import Sim.Math as M
import Sim.SurfaceMotion exposing (hash01)


dotSeconds : Float
dotSeconds =
    0.22


type alias Span =
    { start : Float, end : Float }


type alias Script =
    { marks : List Span, letters : List Span, period : Float }


patterns : Dict Char String
patterns =
    Dict.fromList
        (List.map2 Tuple.pair
            (String.toList "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
            [ ".-", "-...", "-.-.", "-..", ".", "..-.", "--.", "....", "..", ".---", "-.-", ".-..", "--", "-.", "---", ".--.", "--.-", ".-.", "...", "-", "..-", "...-", ".--", "-..-", "-.--", "--.."
            , "-----", ".----", "..---", "...--", "....-", ".....", "-....", "--...", "---..", "----."
            ]
        )


type alias Cursor =
    { cursor : Float, marks : List Span, letters : List Span }


{-| ITU-R M.1677, in dot units, including the seven-unit gap before a repeat.
Only words of capital letters and digits separated by single spaces can be
sent; anything else has no script.
-}
morseScript : String -> Maybe Script
morseScript text =
    let
        sendable =
            String.split " " text |> List.all (\word -> not (String.isEmpty word) && String.all (\c -> Dict.member c patterns) word)

        element symbol ( at, marks ) =
            let
                end =
                    at
                        + (if symbol == '.' then
                            1

                           else
                            3
                          )
            in
            ( end + 1, { start = at, end = end } :: marks )

        letter c acc =
            case Dict.get c patterns of
                Just pattern ->
                    let
                        ( cursor, marks ) =
                            String.foldl element ( acc.cursor, acc.marks ) pattern
                    in
                    { cursor = cursor + 2, marks = marks, letters = { start = acc.cursor, end = cursor - 1 } :: acc.letters }

                Nothing ->
                    { acc | cursor = acc.cursor + 4 }
    in
    if sendable then
        let
            done =
                String.foldl letter (Cursor 0 [] []) text
        in
        Just { marks = List.reverse done.marks, letters = List.reverse done.letters, period = done.cursor + 4 }

    else
        Nothing


type alias Estimate =
    { text : String, x : Float, y : Float, time : Float, radius : Float, sender : String, number : Float }


{-| A message being flashed: how long it has run, since when it has been
watched unbroken, and which letters have been copied, one bit each.
-}
type alias Transmission e =
    { estimate : e, elapsed : Float, since : Maybe Float, copied : Int, delivered : Bool, completedAt : Maybe Float }


compass : List String
compass =
    [ "N", "NE", "E", "SE", "S", "SW", "W", "NW" ]


{-| The story supplies an imprecise sighting. The pin is the sector in the
telegram, anchored to its sender at issue.
-}
makeTransmission : { a | x : Float, y : Float, id : String } -> { b | x : Float, y : Float } -> Float -> Float -> Float -> Transmission Estimate
makeTransmission sender hunter seed number time =
    let
        h n =
            hash01 seed (12000 + number * 6 + n)

        dx =
            hunter.x - sender.x + (h 1 - 0.5) * 1200

        dy =
            hunter.y - sender.y + (h 2 - 0.5) * 1200

        sector =
            modBy 8 (round (atan2 dx dy * 4 / pi) + 8)

        km =
            M.max 1 (toFloat (round (M.hypot2 dx dy / 1000)))

        angle =
            toFloat sector * pi / 4
    in
    { estimate =
        { text = "SUB " ++ (List.drop sector compass |> List.head |> Maybe.withDefault "") ++ " " ++ String.fromFloat km ++ " KM"
        , x = sender.x + sin angle * 1000 * km
        , y = sender.y + cos angle * 1000 * km
        , radius = 800 + km * 300
        , time = time
        , sender = sender.id
        , number = number
        }
    , elapsed = 0
    , since = Nothing
    , copied = 0
    , delivered = False
    , completedAt = Nothing
    }


lampLit : Transmission { e | text : String } -> Bool
lampLit m =
    case morseScript m.estimate.text of
        Just script ->
            let
                phase =
                    M.remainder (m.elapsed / dotSeconds) script.period
            in
            List.any (\mark -> mark.start <= phase && phase < mark.end) script.marks

        Nothing ->
            False


{-| One letter's place in a copy mask. -}
bit : Int -> Int
bit i =
    Bitwise.shiftLeftBy i 1


copyRepeats : Script -> Float -> Float -> Float -> Int -> Int -> Int -> Int
copyRepeats script from to since repeat last copied =
    if repeat <= last then
        let
            base =
                toFloat repeat * script.period

            copy i letter bits =
                if from < base + letter.end && base + letter.end <= to + 1.0e-9 && since - 1.0e-9 <= (base + letter.start) * dotSeconds then
                    Bitwise.or bits (bit i)

                else
                    bits
        in
        copyRepeats script from to since (repeat + 1) last (List.foldl (\letter ( i, bits ) -> ( i + 1, copy i letter bits )) ( 0, copied ) script.letters |> Tuple.second)

    else
        copied


{-| Advances the lamp. A letter counts once its last element is seen, and
only if the watch began before it started; a break in view restarts the watch.
Says whether the message was delivered by this step.
-}
copyLamp : Float -> Bool -> Transmission { e | text : String } -> ( Bool, Transmission { e | text : String } )
copyLamp seconds inView m =
    let
        moved =
            { m | elapsed = m.elapsed + seconds }
    in
    if not inView then
        ( False, { moved | since = Nothing } )

    else
        let
            since =
                Maybe.withDefault m.elapsed m.since

            watched =
                { moved | since = Just since }
        in
        case ( m.delivered, morseScript m.estimate.text ) of
            ( False, Just script ) ->
                let
                    from =
                        m.elapsed / dotSeconds

                    to =
                        watched.elapsed / dotSeconds

                    copied =
                        copyRepeats script from to since (floor (from / script.period)) (floor (to / script.period)) m.copied

                    delivered =
                        copied == bit (List.length script.letters) - 1
                in
                ( delivered
                , { watched
                    | copied = copied
                    , delivered = delivered
                    , completedAt =
                        if delivered then
                            Just watched.elapsed

                        else
                            watched.completedAt
                  }
                )

            _ ->
                ( False, watched )


copyPercent : Transmission { e | text : String } -> Int
copyPercent m =
    case morseScript m.estimate.text of
        Just script ->
            let
                letters =
                    List.length script.letters

                copied =
                    List.range 0 (letters - 1) |> List.filter (\i -> M.truthy (toFloat (Bitwise.and m.copied (bit i)))) |> List.length
            in
            floor (100 * toFloat copied / toFloat letters)

        Nothing ->
            0


lampRange : { e | daylight : Float, twilight : Float, storm : Float, rain : Float, fog : Float } -> Float
lampRange e =
    (2300 + e.twilight * 1400 + (1 - e.daylight) * 3700) * (1 - 0.36 * e.storm) * (1 - 0.16 * e.rain) * (1 - 0.81 * e.fog)


{-| A telegram's region grows as its sighting ages. -}
reportRadius : { p | radius : Float, time : Float } -> Float -> Float
reportRadius p time =
    p.radius + M.min 1500 (M.max 0 (time - p.time) * 1.5)


type alias Bearing =
    { id : String
    , passiveBearing : Maybe Float
    , passiveAt : Maybe Float
    , passiveX : Maybe Float
    , passiveY : Maybe Float
    , identified : Bool
    , kind : Maybe String
    , side : Maybe String
    }


{-| Associates a single fresh bearing with the coarse chart region. Never
tightens it into a measured fix.
-}
matchingBearing : Maybe { p | x : Float, y : Float, radius : Float, time : Float } -> { o | x : Float, y : Float } -> Float -> List Bearing -> Maybe String
matchingBearing pin observer time contacts =
    case pin of
        Nothing ->
            Nothing

        Just p ->
            let
                radius =
                    reportRadius p time

                matches c =
                    case ( c.passiveAt, c.passiveBearing ) of
                        ( Just at, Just passiveBearing ) ->
                            let
                                dx =
                                    p.x - Maybe.withDefault observer.x c.passiveX

                                dy =
                                    p.y - Maybe.withDefault observer.y c.passiveY

                                range =
                                    M.hypot2 dx dy

                                halfWidth =
                                    asin (radius / range) * 180 / pi + 4
                            in
                            if c.side == Just "friendly" || c.identified && c.kind /= Just "sub" || time - at > 18 || range <= radius then
                                False

                            else
                                M.abs (M.remainder (passiveBearing - atan2 dx dy * 180 / pi + 540) 360 - 180) <= halfWidth

                        _ ->
                            False
            in
            case List.filter matches contacts of
                [ only ] ->
                    Just only.id

                _ ->
                    Nothing


type alias LampFix =
    { text : String, x : Float, y : Float, time : Float, radius : Float, sender : String, number : Float, target : String, depth : Float, course : Float, speed : Float }


{-| The chart coordinates the lamp actually spells out. -}
alliedFix : { a | id : String } -> { b | id : String, x : Float, y : Float, depth : Float, heading : Float, speed : Float } -> Float -> Float -> LampFix
alliedFix sender target time number =
    let
        x =
            10 * toFloat (round (target.x / 10))

        y =
            10 * toFloat (round (target.y / 10))

        depth =
            toFloat (round target.depth)

        course =
            M.remainder (toFloat (round target.heading) + 360) 360

        speed =
            toFloat (round target.speed)

        hemisphere negative positive v =
            (if v < 0 then
                negative

             else
                positive
            )
                ++ String.fromFloat (M.abs (v / 10))
    in
    { sender = sender.id
    , target = target.id
    , x = x
    , y = y
    , radius = 10
    , time = time
    , number = number
    , text = String.join " " [ hemisphere "W" "E" x, hemisphere "S" "N" y, "D" ++ String.fromFloat depth, "C" ++ String.fromFloat course, "K" ++ String.fromFloat speed ]
    , depth = depth
    , course = course
    , speed = speed
    }


liveTransmission : LampFix -> Transmission LampFix
liveTransmission fix =
    { estimate = fix, elapsed = 0, since = Nothing, copied = 0, delivered = False, completedAt = Nothing }
