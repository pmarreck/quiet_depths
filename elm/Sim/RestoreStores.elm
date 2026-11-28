module Sim.RestoreStores exposing (plant, stores)

{-| Restore's migrations of the boat's stores: an older save's power plant
from its engine, the combat stores and newer motion fields, the systems, and
the drone's newer fields from its own pose.
-}

import Dict
import Json.Decode as D
import Json.Encode as E
import Sim.Equipment as Equipment
import Sim.Math as M
import Sim.SaveFields exposing (Fields, ensure, field, fill, finite, integer, number, object, time, truthy)


{-| The power plant: an older save's diesel, tank, battery bank and tubes
from its engine; a newer one's leak, fire and cook-off checked.
-}
plant : Fields -> Maybe Fields
plant f =
    if Dict.member "plantVersion" f then
        ensure
            (number "plantVersion" f
                == Just 1
                && (number "fuelLeak" f |> Maybe.map (\v -> 0 <= v && v <= 1) |> Maybe.withDefault False)
                && (number "fuelFire" f |> Maybe.map (\v -> 0 <= v && v <= 24) |> Maybe.withDefault False)
                && field "cookoff" D.bool f
                /= Nothing
            )
            f

    else
        let
            migrateParts : String -> Fields -> Maybe Fields
            migrateParts key fields =
                case Dict.get key fields of
                    Just v ->
                        case object v of
                            Just parts ->
                                let
                                    engine : Maybe D.Value
                                    engine =
                                        Dict.get "engine" parts

                                    updated : Fields
                                    updated =
                                        parts
                                            |> (\p -> Maybe.map (\e -> Dict.insert "diesel" e p) engine |> Maybe.withDefault (Dict.remove "diesel" p))
                                            |> Dict.insert "fuelTank" (E.float 100)
                                            |> Dict.insert "batteryBank" (E.float 100)
                                            |> Dict.insert "tubes" (E.float 100)
                                in
                                Just (Dict.insert key (E.dict identity identity updated) fields)

                            Nothing ->
                                -- Arrays and other truthy values cannot take the new parts.
                                if truthy v then
                                    Nothing

                                else
                                    Just fields

                    Nothing ->
                        Just fields
        in
        -- The limits move with the systems: an older save without systems keeps
        -- its limits as they were.
        if Dict.get "systems" f |> Maybe.map truthy |> Maybe.withDefault False then
            migrateParts "systems" f |> Maybe.andThen (migrateParts "repairLimits")

        else
            Just f


freshCombat : List ( String, E.Value )
freshCombat =
    [ ( "crewQuietUntil", E.float 0 )
    , ( "tubeReadyAt", E.object [ ( "port", E.float 0 ), ( "starboard", E.float 0 ) ] )
    , ( "runSetting", E.float 4320 )
    , ( "reports", E.list identity [] )
    , ( "gun", E.object [ ( "ammo", E.float 240 ), ( "cooldown", E.float 0 ), ( "shots", E.float 0 ), ( "angle", E.float 0 ), ( "elevation", E.float 0 ) ] )
    , ( "gunRounds", E.list identity [] )
    , ( "impacts", E.list identity [] )
    , ( "aircraft", E.list identity [] )
    , ( "airSupport", E.object [ ( "status", E.string "idle" ), ( "requestedAt", E.null ), ( "launchAt", E.null ), ( "base", E.object [ ( "x", E.float -3200 ), ( "y", E.float 3400 ) ] ), ( "lastKnown", E.null ) ] )
    , ( "weaponSequence", E.float 1 )
    , ( "gunLoudUntil", E.float 0 )
    ]


freshMotion : List ( String, E.Value )
freshMotion =
    [ ( "plantVersion", E.float 1 )
    , ( "dieselMode", E.string "charge" )
    , ( "fuelLeak", E.float 0 )
    , ( "fuelFire", E.float 0 )
    , ( "cookoff", E.bool False )
    , ( "outerHull", E.float 100 )
    , ( "bottomed", E.bool False )
    , ( "pressureAlarm", E.float 0 )
    , ( "criticalExposure", E.float 0 )
    , ( "imploded", E.bool False )
    , ( "collisionHits", E.object [] )
    , ( "verticalSpeed", E.float 0 )
    , ( "ballast", E.float 0 )
    , ( "planes", E.float 0 )
    , ( "rudder", E.float 0 )
    , ( "pitch", E.float 0 )
    , ( "propAngle", E.float 0 )
    , ( "water", E.float 0 )
    , ( "collisionCooldown", E.float 0 )
    , ( "floodAlarm", E.bool False )
    , ( "towerAngle", E.float 0 )
    , ( "towerPitch", E.float 0 )
    , ( "cavitation", E.float 0 )
    , ( "propRpm", E.float 0 )
    ]


freshDrone : List ( String, E.Value )
freshDrone =
    [ ( "mode", E.string "stowed" )
    , ( "x", E.float 0 )
    , ( "y", E.float 0 )
    , ( "depth", E.float 25 )
    , ( "heading", E.float 0 )
    , ( "battery", E.float 100 )
    , ( "hull", E.float 100 )
    , ( "mobility", E.float 100 )
    , ( "buoyancy", E.float 100 )
    , ( "camera", E.float 100 )
    , ( "nosePitch", E.null )
    , ( "verticalSpeed", E.float 0 )
    , ( "speed", E.float 0 )
    , ( "targetSpeed", E.float 0 )
    , ( "collisionCooldown", E.float 0 )
    , ( "lowAlarm", E.bool False )
    , ( "rangeAlarm", E.bool False )
    , ( "lostReason", E.string "" )
    , ( "returnStage", E.float 0 )
    , ( "returnClearance", E.float 8 )
    , ( "returnHoldSide", E.float 18 )
    , ( "returnHoldForward", E.float 0 )
    ]


fillAll : List ( String, E.Value ) -> Fields -> Fields
fillAll pairs fields =
    List.foldl (\( key, v ) -> fill key v) fields pairs


{-| The torpedo tubes' reload times, each from now to five reloads ahead.
-}
tubes : Fields -> Bool
tubes f =
    let
        t : Float
        t =
            time f

        ready : D.Decoder Bool
        ready =
            finite |> D.map (\v -> 0 <= v && M.notLess (t + 100) v)
    in
    field "tubeReadyAt" (D.map2 (&&) (D.field "port" ready) (D.field "starboard" ready)) f
        == Just True
        && (number "torps" f |> Maybe.map (\n -> integer n && 0 <= n) |> Maybe.withDefault False)


{-| The combat stores and the newer motion fields for an older save, the
systems, and the drone's newer fields from its own pose.
-}
stores : Fields -> Maybe Fields
stores f0 =
    let
        -- Air support without a last report of the boat has none.
        f1 : Fields
        f1 =
            fillAll freshCombat f0
                |> (\g ->
                        case Dict.get "airSupport" g |> Maybe.andThen object of
                            Just support ->
                                Dict.insert "airSupport" (E.dict identity identity (fill "lastKnown" E.null support)) g

                            Nothing ->
                                g
                   )
    in
    if not (tubes f1) then
        Nothing

    else
        let
            f2 : Fields
            f2 =
                (case ( Dict.member "outerHull" f1, Dict.get "hull" f1 ) of
                    ( False, Just hull ) ->
                        Dict.insert "outerHull" hull f1

                    _ ->
                        f1
                )
                    |> fillAll freshMotion

            withSystems : Maybe Fields
            withSystems =
                case Dict.get "systems" f2 of
                    Nothing ->
                        Just (Dict.insert "systems" (E.object (List.map (\k -> ( Equipment.systemKey k, E.float 100 )) Equipment.systems)) f2)

                    Just v ->
                        case object v of
                            Just parts ->
                                Just (Dict.insert "systems" (E.dict identity identity (fill "deckgun" (E.float 100) parts)) f2)

                            Nothing ->
                                if truthy v then
                                    Nothing

                                else
                                    Just f2
        in
        withSystems
            |> Maybe.map (fill "shells" (E.list identity []) >> fill "site" E.null >> fill "operation" E.null)
            |> Maybe.andThen drone


drone : Fields -> Maybe Fields
drone f =
    case Dict.get "drone" f of
        Just v ->
            case object v of
                Just d ->
                    let
                        pose : List ( String, E.Value )
                        pose =
                            List.filterMap (\( key, from ) -> Dict.get from d |> Maybe.map (Tuple.pair key)) [ ( "targetDepth", "depth" ), ( "targetHeading", "heading" ) ]
                    in
                    Just (Dict.insert "drone" (E.dict identity identity (fillAll (freshDrone ++ pose) d)) f)

                Nothing ->
                    if truthy v then
                        Nothing

                    else
                        Just f

        Nothing ->
            Just f
