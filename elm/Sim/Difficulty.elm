module Sim.Difficulty exposing (Difficulty, decode, encode)

{-| The patrol's difficulty settings. Reading them is lenient, as the
briefing and old saves require: a missing or malformed setting takes its
default, and a number outside its range is held to the nearest end.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Math as M


type alias Difficulty =
    { damage : Float
    , detection : Float
    , pingDetection : Float
    , showSuspicion : Bool
    , depthStealth : Float
    , pursuit : Float
    , airSupport : Bool
    , longPatrol : Bool
    , satellite : Bool
    , drone : Bool
    , omniscientChart : Bool
    , orbitCamera : Bool
    , instantReplay : Bool
    , enemyReplay : Bool
    , torpedoCam : Bool
    }


{-| A finite number from the settings, held within the control's range. -}
slider : String -> Float -> Float -> Float -> D.Value -> Float
slider key low high initial stored =
    case D.decodeValue (D.field key D.float) stored of
        Ok value ->
            if isNaN value || isInfinite value then
                initial

            else
                M.min high (M.max low value)

        Err _ ->
            initial


switch : String -> Bool -> D.Value -> Bool
switch key initial stored =
    D.decodeValue (D.field key D.bool) stored |> Result.withDefault initial


{-| Reads any value; anything but an object reads as all defaults. -}
decode : D.Value -> Difficulty
decode stored =
    { damage = slider "damage" -1 1 0 stored
    , detection = slider "detection" 0.4 1.8 1 stored
    , pingDetection = slider "pingDetection" 0 1 0.9 stored
    , showSuspicion = switch "showSuspicion" True stored
    , depthStealth = slider "depthStealth" 0 2 1 stored
    , pursuit = slider "pursuit" 0.4 2 1 stored
    , airSupport = switch "airSupport" True stored
    , longPatrol = switch "longPatrol" False stored
    , satellite = switch "satellite" True stored
    , drone = switch "drone" True stored
    , omniscientChart = switch "omniscientChart" False stored
    , orbitCamera = switch "orbitCamera" True stored
    , instantReplay = switch "instantReplay" True stored
    , enemyReplay = switch "enemyReplay" False stored
    , torpedoCam = switch "torpedoCam" True stored
    }


encode : Difficulty -> E.Value
encode d =
    E.object
        [ ( "damage", E.float d.damage )
        , ( "detection", E.float d.detection )
        , ( "pingDetection", E.float d.pingDetection )
        , ( "showSuspicion", E.bool d.showSuspicion )
        , ( "depthStealth", E.float d.depthStealth )
        , ( "pursuit", E.float d.pursuit )
        , ( "airSupport", E.bool d.airSupport )
        , ( "longPatrol", E.bool d.longPatrol )
        , ( "satellite", E.bool d.satellite )
        , ( "drone", E.bool d.drone )
        , ( "omniscientChart", E.bool d.omniscientChart )
        , ( "orbitCamera", E.bool d.orbitCamera )
        , ( "instantReplay", E.bool d.instantReplay )
        , ( "enemyReplay", E.bool d.enemyReplay )
        , ( "torpedoCam", E.bool d.torpedoCam )
        ]
