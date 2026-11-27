module Sim.VehicleStatus exposing (DroneStatus, Hull, droneReturnSpeed, droneStatus, isSurfaced, recoveryDock, surfaceDepth, tetherAttachment)

{-| Whether the boat is surfaced, where the ROV's tether and recovery dock
attach, and whether a deployed ROV can still be recovered.
-}

import Sim.Equipment exposing (operatingFraction)
import Sim.Math as M
import Sim.Mechanics exposing (separation)
import Sim.SurfaceMotion exposing (Point, boatPoint)
import Sim.Text exposing (toFixed)


surfaceDepth : Float
surfaceDepth =
    1


isSurfaced : { a | depth : Float } -> Bool
isSurfaced s =
    not (isNaN s.depth || isInfinite s.depth) && s.depth <= surfaceDepth


{-| A missing mobility reading counts as fully working.
-}
droneReturnSpeed : Maybe Float -> Float
droneReturnSpeed mobility =
    10 * operatingFraction (Maybe.withDefault 100 mobility)


type alias Hull a =
    { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float }


tetherAttachment : Hull a -> Point
tetherAttachment s =
    boatPoint s { side = 4.65, forward = 0, down = 2 }


recoveryDock : Hull a -> Point
recoveryDock s =
    let
        p : Point
        p =
            boatPoint s { side = 6.8, forward = 0, down = 2.5 }
    in
    { p | depth = M.clamp 2.5 280 p.depth }


type alias DroneStatus =
    { deployed : Bool, distance : Float, returnSpeed : Float, outrunning : Bool, canRecover : Bool, warning : String }


droneStatus : { a | x : Float, y : Float, depth : Float, speed : Float } -> { d | x : Float, y : Float, depth : Float, mode : String, mobility : Maybe Float } -> DroneStatus
droneStatus s d =
    let
        deployed : Bool
        deployed =
            d.mode == "remote" || d.mode == "return"

        distance : Float
        distance =
            separation s d

        returnSpeed : Float
        returnSpeed =
            droneReturnSpeed d.mobility

        outrunning : Bool
        outrunning =
            deployed && returnSpeed <= M.abs s.speed

        canRecover : Bool
        canRecover =
            deployed && M.abs s.speed <= 3
    in
    { deployed = deployed
    , distance = distance
    , returnSpeed = returnSpeed
    , outrunning = outrunning
    , canRecover = canRecover
    , warning =
        if not deployed then
            ""

        else if M.isZero returnSpeed then
            "ROV PROPULSION OFFLINE · bring the sub alongside for pickup"

        else if outrunning then
            "DRONE CANNOT CATCH SUB · " ++ toFixed 0 distance ++ " m · slow below " ++ toFixed 1 returnSpeed ++ " kn"

        else if not canRecover then
            "DRONE DEPLOYED · " ++ toFixed 0 distance ++ " m · slow to 3 kn for pickup"

        else if distance >= 70 then
            "DRONE LINK " ++ toFixed 0 distance ++ " / 100 m · recall now"

        else
            ""
    }
