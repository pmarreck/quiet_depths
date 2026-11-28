module Sim.PatrolOrders exposing (Orders, apply, decoder, fields)

{-| The patrol fields the page writes itself between commands: the helm and
the drone's, silent running, the engine and its diesel routing, the route,
the scope, the tower, the gun's aim, the torpedo run setting, the imagers,
damage control, the photo cooldown and the count of archived reconnaissance
packets. The page keeps writing them on its mirror of the world, as it did
on the TypeScript world; each command brings them, and the world takes them
before acting. Everything else in the world only the simulation changes.
-}

import Json.Decode as D
import Sim.Drone exposing (Drone)
import Sim.PowerPlant as Plant exposing (DieselMode, EngineMode)
import Sim.SaveCodec exposing (andMap, optional)
import Sim.SonarTransmitters as SonarTransmitters exposing (Transmitters)
import Sim.World exposing (World)
import Sim.WorldDecoder as WorldDecoder


type alias Orders =
    { targetSpeed : Float
    , targetDepth : Float
    , targetHeading : Float
    , silent : Bool
    , engine : EngineMode
    , dieselMode : DieselMode
    , route : Maybe { x : Float, y : Float, radius : Maybe Float }
    , scopeAngle : Float
    , scopeSteerBearing : Maybe Float
    , towerAngle : Float
    , towerPitch : Float
    , gun : { angle : Float, elevation : Float }
    , runSetting : Float
    , imagers : Transmitters
    , repair : Float
    , photoCooldown : Float
    , reconArchivedSequence : Float
    , drone : { targetSpeed : Float, targetDepth : Float, targetHeading : Float, nosePitch : Maybe Float }
    }


{-| The order fields by name, top-level and within the gun and the drone, as
the page's adapter sends them.
-}
fields : { boat : List String, gun : List String, drone : List String }
fields =
    { boat =
        [ "targetSpeed", "targetDepth", "targetHeading", "silent", "engine", "dieselMode", "route", "scopeAngle", "scopeSteerBearing", "towerAngle", "towerPitch", "runSetting", "imagers", "repair", "photoCooldown", "reconArchivedSequence" ]
    , gun = [ "angle", "elevation" ]
    , drone = [ "targetSpeed", "targetDepth", "targetHeading", "nosePitch" ]
    }


named : (a -> String) -> List a -> D.Decoder a
named name values =
    D.string
        |> D.andThen
            (\given ->
                case List.filter (\v -> name v == given) values of
                    v :: _ ->
                        D.succeed v

                    [] ->
                        D.fail ("not one of the expected names: " ++ given)
            )


{-| A field JavaScript reads as null when it is absent.
-}
nullable : String -> D.Decoder a -> D.Decoder (Maybe a)
nullable key value =
    optional key (D.nullable value) |> D.map (Maybe.andThen identity)


{-| The orders as the mirror holds them, in the save's shape; the route, the
scope's steering bearing and the drone's nose pitch may be absent, as
JavaScript reads an undefined one as none.
-}
decoder : D.Decoder Orders
decoder =
    D.succeed Orders
        |> andMap (D.field "targetSpeed" D.float)
        |> andMap (D.field "targetDepth" D.float)
        |> andMap (D.field "targetHeading" D.float)
        |> andMap (D.field "silent" D.bool)
        |> andMap (D.field "engine" (named WorldDecoder.engineName [ Plant.Diesel, Plant.Electric ]))
        |> andMap (D.field "dieselMode" (named WorldDecoder.dieselModeName [ Plant.Charge, Plant.Drive, Plant.Assist ]))
        |> andMap (nullable "route" WorldDecoder.route)
        |> andMap (D.field "scopeAngle" D.float)
        |> andMap (nullable "scopeSteerBearing" D.float)
        |> andMap (D.field "towerAngle" D.float)
        |> andMap (D.field "towerPitch" D.float)
        |> andMap (D.field "gun" (D.map2 (\angle elevation -> { angle = angle, elevation = elevation }) (D.field "angle" D.float) (D.field "elevation" D.float)))
        |> andMap (D.field "runSetting" D.float)
        |> andMap (D.field "imagers" SonarTransmitters.decoder)
        |> andMap (D.field "repair" D.float)
        |> andMap (D.field "photoCooldown" D.float)
        |> andMap (D.field "reconArchivedSequence" D.float)
        |> andMap
            (D.field "drone"
                (D.map4 (\speed depth heading pitch -> { targetSpeed = speed, targetDepth = depth, targetHeading = heading, nosePitch = pitch })
                    (D.field "targetSpeed" D.float)
                    (D.field "targetDepth" D.float)
                    (D.field "targetHeading" D.float)
                    (nullable "nosePitch" D.float)
                )
            )


{-| The world with the page's orders in place.
-}
apply : Orders -> World -> World
apply o s =
    let
        gun : { ammo : Float, cooldown : Float, shots : Float, angle : Float, elevation : Float }
        gun =
            s.gun

        drone : Drone
        drone =
            s.drone
    in
    { s
        | targetSpeed = o.targetSpeed
        , targetDepth = o.targetDepth
        , targetHeading = o.targetHeading
        , silent = o.silent
        , engine = o.engine
        , dieselMode = o.dieselMode
        , route = o.route
        , scopeAngle = o.scopeAngle
        , scopeSteerBearing = o.scopeSteerBearing
        , towerAngle = o.towerAngle
        , towerPitch = o.towerPitch
        , gun = { gun | angle = o.gun.angle, elevation = o.gun.elevation }
        , runSetting = o.runSetting
        , imagers = o.imagers
        , repair = o.repair
        , photoCooldown = o.photoCooldown
        , reconArchivedSequence = o.reconArchivedSequence
        , drone = { drone | targetSpeed = o.drone.targetSpeed, targetDepth = o.drone.targetDepth, targetHeading = o.drone.targetHeading, nosePitch = o.drone.nosePitch }
    }
