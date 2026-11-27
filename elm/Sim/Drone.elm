module Sim.Drone exposing (Drone, Limits, Mode, decoder, encode)

{-| The inspection drone as current saves hold it.
-}

import Json.Decode as D
import Json.Encode as E


type Mode
    = Stowed
    | Remote
    | Returning
    | Lost


modeName : Mode -> String
modeName m =
    case m of
        Stowed ->
            "stowed"

        Remote ->
            "remote"

        Returning ->
            "return"

        Lost ->
            "lost"


modes : List Mode
modes =
    [ Stowed, Remote, Returning, Lost ]


type alias Limits =
    { hull : Float, mobility : Float, buoyancy : Float, camera : Float }


type alias Drone =
    { mode : Mode
    , x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , battery : Float
    , nosePitch : Maybe Float
    , verticalSpeed : Float
    , speed : Float
    , targetSpeed : Float
    , targetDepth : Float
    , targetHeading : Float
    , collisionCooldown : Float
    , lowAlarm : Bool
    , rangeAlarm : Bool
    , lostReason : String
    , returnStage : Int
    , returnClearance : Float
    , returnHoldSide : Float
    , returnHoldForward : Float
    , repairLimits : Limits
    , buoyancy : Float
    , camera : Float
    , hull : Float
    , mobility : Float
    }


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


check : String -> (a -> Bool) -> D.Decoder a -> D.Decoder a
check problem ok =
    D.andThen
        (\v ->
            if ok v then
                D.succeed v

            else
                D.fail problem
        )


finite : D.Decoder Float
finite =
    check "a finite number" (\n -> not (isNaN n || isInfinite n)) D.float


percent : D.Decoder Float
percent =
    check "0 to 100" (\n -> 0 <= n && n <= 100) finite


{-| A current save's drone, rejected where restore rejects it: a known mode,
finite numbers, a nose pitch within 60 degrees or none, a return stage from
0 to 3, and parts and limits from 0 to 100 (a destroyed part's limit is 0).
-}
decoder : D.Decoder Drone
decoder =
    D.map4 (\hull mobility buoyancy camera -> { hull = hull, mobility = mobility, buoyancy = buoyancy, camera = camera })
        (D.field "hull" percent)
        (D.field "mobility" percent)
        (D.field "buoyancy" percent)
        (D.field "camera" percent)
        |> D.andThen
            (\parts ->
                let
                    limit key part =
                        D.field key percent
                            |> D.map
                                (\v ->
                                    if part <= 0 then
                                        0

                                    else
                                        v
                                )
                in
                D.succeed Drone
                    |> andMap (D.field "mode" (D.string |> D.andThen (\given -> List.filter (\m -> modeName m == given) modes |> List.head |> Maybe.map D.succeed |> Maybe.withDefault (D.fail given))))
                    |> andMap (D.field "x" finite)
                    |> andMap (D.field "y" finite)
                    |> andMap (D.field "depth" finite)
                    |> andMap (D.field "heading" finite)
                    |> andMap (D.field "battery" finite)
                    |> andMap (D.field "nosePitch" (D.nullable (check "within 60 degrees" (\p -> -60 <= p && p <= 60) finite)))
                    |> andMap (D.field "verticalSpeed" finite)
                    |> andMap (D.field "speed" finite)
                    |> andMap (D.field "targetSpeed" finite)
                    |> andMap (D.field "targetDepth" finite)
                    |> andMap (D.field "targetHeading" finite)
                    |> andMap (D.field "collisionCooldown" finite)
                    |> andMap (D.field "lowAlarm" D.bool)
                    |> andMap (D.field "rangeAlarm" D.bool)
                    |> andMap (D.field "lostReason" D.string)
                    |> andMap (D.field "returnStage" (check "stage 0 to 3" (\n -> 0 <= n && n <= 3) D.int))
                    |> andMap (D.field "returnClearance" finite)
                    |> andMap (D.field "returnHoldSide" finite)
                    |> andMap (D.field "returnHoldForward" finite)
                    |> andMap
                        (D.field "repairLimits"
                            (D.map4 Limits (limit "hull" parts.hull) (limit "mobility" parts.mobility) (limit "buoyancy" parts.buoyancy) (limit "camera" parts.camera))
                        )
                    |> andMap (D.succeed parts.buoyancy)
                    |> andMap (D.succeed parts.camera)
                    |> andMap (D.succeed parts.hull)
                    |> andMap (D.succeed parts.mobility)
            )


encode : Drone -> E.Value
encode d =
    E.object
        [ ( "mode", E.string (modeName d.mode) )
        , ( "x", E.float d.x )
        , ( "y", E.float d.y )
        , ( "depth", E.float d.depth )
        , ( "heading", E.float d.heading )
        , ( "battery", E.float d.battery )
        , ( "nosePitch", Maybe.map E.float d.nosePitch |> Maybe.withDefault E.null )
        , ( "verticalSpeed", E.float d.verticalSpeed )
        , ( "speed", E.float d.speed )
        , ( "targetSpeed", E.float d.targetSpeed )
        , ( "targetDepth", E.float d.targetDepth )
        , ( "targetHeading", E.float d.targetHeading )
        , ( "collisionCooldown", E.float d.collisionCooldown )
        , ( "lowAlarm", E.bool d.lowAlarm )
        , ( "rangeAlarm", E.bool d.rangeAlarm )
        , ( "lostReason", E.string d.lostReason )
        , ( "returnStage", E.int d.returnStage )
        , ( "returnClearance", E.float d.returnClearance )
        , ( "returnHoldSide", E.float d.returnHoldSide )
        , ( "returnHoldForward", E.float d.returnHoldForward )
        , ( "repairLimits", E.object [ ( "hull", E.float d.repairLimits.hull ), ( "mobility", E.float d.repairLimits.mobility ), ( "buoyancy", E.float d.repairLimits.buoyancy ), ( "camera", E.float d.repairLimits.camera ) ] )
        , ( "buoyancy", E.float d.buoyancy )
        , ( "camera", E.float d.camera )
        , ( "hull", E.float d.hull )
        , ( "mobility", E.float d.mobility )
        ]
