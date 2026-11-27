module Sim.DroneReturn exposing (returnOrder)

{-| The drone's way home: hold clear of the hull, run in along the starboard
lane, rise to the hatch, then close on the recovery dock, steering for where
the turning boat will be.
-}

import Sim.Drone exposing (Drone)
import Sim.DroneOrders exposing (Flying, dronePosition, setDrone)
import Sim.Equipment as Equipment
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.SurfaceMotion exposing (Point, boatLocal, boatPoint)
import Sim.Systems as Systems
import Sim.VehicleStatus as VehicleStatus


returnOrder : Float -> Flying w -> Flying w
returnOrder dt s =
    let
        hull : { x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float }
        hull =
            Systems.hullOf s

        d : Drone
        d =
            s.drone

        local : { side : Float, forward : Float, down : Float }
        local =
            boatLocal hull (dronePosition d)

        clear : Float
        clear =
            d.returnClearance

        lane : Float
        lane =
            M.hypot2 (local.side - 14) local.forward

        stage : Int
        stage =
            [ ( 0, M.abs (local.down - clear) < 0.7 ), ( 1, lane < 3 && M.abs (local.down - clear) < 1 ), ( 2, lane < 3 && M.abs (local.down - 2.5) < 0.7 ) ]
                |> List.foldl
                    (\( from, ready ) current ->
                        if current == from && ready then
                            from + 1

                        else
                            current
                    )
                    d.returnStage

        goal : Point
        goal =
            case stage of
                0 ->
                    boatPoint hull { side = d.returnHoldSide, forward = d.returnHoldForward, down = clear }

                1 ->
                    boatPoint hull { side = 14, forward = 0, down = clear }

                2 ->
                    boatPoint hull { side = 14, forward = 0, down = 2.5 }

                _ ->
                    VehicleStatus.recoveryDock hull

        a : Float
        a =
            Mechanics.rad s.heading

        turnRate : Float
        turnRate =
            1.7 * (0.25 + 0.75 * M.min 1 (M.abs s.speed / 4)) * Equipment.operatingFraction s.systems.rudder

        omega : Float
        omega =
            Mechanics.rad (M.clamp (negate turnRate) turnRate (Mechanics.delta s.targetHeading s.heading / M.max dt 0.001))

        vx : Float
        vx =
            sin a * s.speed * 0.514444 + omega * (goal.y - s.y)

        vy : Float
        vy =
            cos a * s.speed * 0.514444 - omega * (goal.x - s.x)

        requestX : Float
        requestX =
            vx + (goal.x - d.x) * 0.35 - (sin (Mechanics.rad d.heading) * d.speed * 0.514444 - vx) * 0.6

        requestY : Float
        requestY =
            vy + (goal.y - d.y) * 0.35 - (cos (Mechanics.rad d.heading) * d.speed * 0.514444 - vy) * 0.6

        magnitude : Float
        magnitude =
            M.hypot2 requestX requestY

        targetHeading : Float
        targetHeading =
            if magnitude > 0.02 then
                M.remainder (atan2 requestX requestY * 180 / pi + 360) 360

            else
                d.targetHeading

        alignment : Float
        alignment =
            M.max 0 (cos (Mechanics.rad (Mechanics.delta targetHeading d.heading)))
    in
    setDrone
        { d
            | returnStage = stage
            , targetDepth = M.clamp 0 280 goal.depth
            , targetHeading = targetHeading
            , targetSpeed = M.min (VehicleStatus.droneReturnSpeed (Just d.mobility)) (magnitude / 0.514444) * alignment * alignment
        }
        s
