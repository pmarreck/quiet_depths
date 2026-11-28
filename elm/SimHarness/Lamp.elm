module SimHarness.Lamp exposing (function)

{-| Harness entries for signal lamps.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.SaveParts exposing (encodeEstimate, encodeLampFix, encodeTransmission, estimate, lampFix, transmission)
import Sim.SignalLamp as Lamp
import Sim.SignalLampSaves as Saves
import SimHarness.Codec exposing (andMap, arg, call1, call2, point)


nullable : (a -> E.Value) -> Maybe a -> E.Value
nullable encode =
    Maybe.map encode >> Maybe.withDefault E.null


{-| The copying state only; the estimate rides along unchanged.
-}
encodeProgress : Lamp.Transmission e -> E.Value
encodeProgress m =
    E.object
        [ ( "elapsed", E.float m.elapsed )
        , ( "since", nullable E.float m.since )
        , ( "copied", E.int m.copied )
        , ( "delivered", E.bool m.delivered )
        , ( "completedAt", nullable E.float m.completedAt )
        ]


spans : List Lamp.Span -> E.Value
spans =
    E.list (\s -> E.object [ ( "start", E.float s.start ), ( "end", E.float s.end ) ])


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key decoder =
    D.maybe (D.field key decoder)


bearing : D.Decoder Lamp.Bearing
bearing =
    D.succeed Lamp.Bearing
        |> andMap (D.field "id" D.string)
        |> andMap (optional "passiveBearing" D.float)
        |> andMap (optional "passiveAt" D.float)
        |> andMap (optional "passiveX" D.float)
        |> andMap (optional "passiveY" D.float)
        |> andMap (optional "identified" D.bool |> D.map (Maybe.withDefault False))
        |> andMap (optional "kind" D.string)
        |> andMap (optional "side" D.string)


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "signalLamp.constants" ->
            Just (D.succeed (E.object [ ( "dotSeconds", E.float Lamp.dotSeconds ) ]))

        "signalLamp.morseScript" ->
            Just (call1 D.string (nullable (\s -> E.object [ ( "marks", spans s.marks ), ( "letters", spans s.letters ), ( "period", E.float s.period ) ])) Lamp.morseScript)

        "signalLamp.makeTransmission" ->
            Just
                (D.map5 (\sender hunter seed number time -> encodeTransmission encodeEstimate (Lamp.makeTransmission sender hunter seed number time))
                    (arg 0 (D.map3 (\x y id -> { x = x, y = y, id = id }) (D.field "x" D.float) (D.field "y" D.float) (D.field "id" D.string)))
                    (arg 1 point)
                    (arg 2 D.float)
                    (arg 3 D.float)
                    (arg 4 D.float)
                )

        "signalLamp.lampLit" ->
            Just (call1 (transmission estimate) E.bool Lamp.lampLit)

        "signalLamp.copyLamp" ->
            Just
                (D.map3 (\m seconds inView -> (\( delivered, next ) -> E.object [ ( "delivered", E.bool delivered ), ( "message", encodeProgress next ) ]) (Lamp.copyLamp seconds inView m))
                    (arg 0 (transmission estimate))
                    (arg 1 D.float)
                    (arg 2 D.bool)
                )

        "signalLamp.copyPercent" ->
            Just (call1 (transmission estimate) E.int Lamp.copyPercent)

        "signalLamp.lampRange" ->
            Just
                (call1
                    (D.map5 (\daylight twilight storm rain fog -> { daylight = daylight, twilight = twilight, storm = storm, rain = rain, fog = fog })
                        (D.field "daylight" D.float)
                        (D.field "twilight" D.float)
                        (D.field "storm" D.float)
                        (D.field "rain" D.float)
                        (D.field "fog" D.float)
                    )
                    E.float
                    Lamp.lampRange
                )

        "signalLamp.reportRadius" ->
            Just (call2 estimate D.float E.float Lamp.reportRadius)

        "signalLamp.matchingBearing" ->
            Just
                (D.map4 (\p observer time contacts -> nullable E.string (Lamp.matchingBearing p observer time contacts))
                    (arg 0 (D.nullable (D.map4 (\x y radius time -> { x = x, y = y, radius = radius, time = time }) (D.field "x" D.float) (D.field "y" D.float) (D.field "radius" D.float) (D.field "time" D.float))))
                    (arg 1 point)
                    (arg 2 D.float)
                    (arg 3 (D.list bearing))
                )

        "signalLamp.validEstimate" ->
            Just (call2 estimate D.float E.bool Saves.validEstimate)

        "signalLamp.validCopy" ->
            Just (call2 (transmission estimate) D.float E.bool Saves.validCopy)

        "signalLamp.validTransmission" ->
            Just (call2 (transmission estimate) D.float E.bool Saves.validTransmission)

        "signalLamp.alliedFix" ->
            Just
                (D.map4 (\sender target time number -> encodeLampFix (Lamp.alliedFix sender target time number))
                    (arg 0 (D.map (\id -> { id = id }) (D.field "id" D.string)))
                    (arg 1
                        (D.map6 (\id x y depth heading speed -> { id = id, x = x, y = y, depth = depth, heading = heading, speed = speed })
                            (D.field "id" D.string)
                            (D.field "x" D.float)
                            (D.field "y" D.float)
                            (D.field "depth" D.float)
                            (D.field "heading" D.float)
                            (D.field "speed" D.float)
                        )
                    )
                    (arg 2 D.float)
                    (arg 3 D.float)
                )

        "signalLamp.liveTransmission" ->
            Just (call1 lampFix (encodeTransmission encodeLampFix) Lamp.liveTransmission)

        "signalLamp.validLampFix" ->
            Just (call2 lampFix D.float E.bool Saves.validLampFix)

        _ ->
            Nothing
