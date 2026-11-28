module Sim.FleetVolleys exposing (Position, Volley, activeVolleys, fleetShotPose)

{-| Shots in flight between ships that are not ours: the fleet action's
volleys, a convoy's one shot, and passing traffic's, with where each one is
at a given moment.
-}

import Sim.Math as M


type alias Position =
    { x : Float, y : Float, altitude : Float }


type alias Volley =
    { id : Int
    , underwater : Bool
    , from : Position
    , to : Position
    , source : String
    , target : String
    , launched : Float
    , arrives : Float
    , damage : Float
    , warning : Maybe Bool
    }


{-| The volleys in flight: the battle's, else the convoy's one shot, then any
from passing traffic.
-}
activeVolleys : { s | battle : Maybe { b | volleys : List Volley }, convoy : Maybe { c | shot : Maybe Volley }, traffic : Maybe { t | volleys : List Volley } } -> List Volley
activeVolleys s =
    let
        mission : List Volley
        mission =
            case s.battle of
                Just b ->
                    b.volleys

                Nothing ->
                    Maybe.andThen .shot s.convoy |> Maybe.map List.singleton |> Maybe.withDefault []
    in
    case Maybe.map .volleys s.traffic of
        Just ((_ :: _) as traffic) ->
            mission ++ traffic

        _ ->
            mission


{-| Where a volley is at `time`, as the renderer and the sonar need it.
-}
fleetShotPose : Volley -> Float -> { id : Int, x : Float, y : Float, depth : Float, time : Float, age : Float, heading : Float, pitch : Float, speed : Float }
fleetShotPose v time =
    let
        seconds : Float
        seconds =
            v.arrives - v.launched

        age : Float
        age =
            M.max 0 (time - v.launched)

        f : Float
        f =
            M.min 1 (age / seconds)

        dx : Float
        dx =
            v.to.x - v.from.x

        dy : Float
        dy =
            v.to.y - v.from.y

        dz : Float
        dz =
            v.to.altitude - v.from.altitude
    in
    { id = v.id
    , x = v.from.x + dx * f
    , y = v.from.y + dy * f
    , depth = negate (v.from.altitude + dz * f)
    , time = time
    , age = age
    , heading = M.remainder (atan2 dx dy * 180 / pi + 360) 360
    , pitch = atan2 dz (M.hypot2 dx dy)
    , speed = M.hypot3 dx dy dz / seconds
    }
