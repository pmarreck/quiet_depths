module Sim.DroneOrders exposing (Flying, damageDrone, deployDrone, droneDeployReason, droneLimits, dronePosition, loseDrone, recallDrone, setDrone)

{-| The inspection drone's launch, recall, damage and loss.
-}

import Sim.Drone exposing (Drone, Mode(..))
import Sim.Equipment as Equipment
import Sim.HullGeometry exposing (Body)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.PowerPlant exposing (EngineMode)
import Sim.Ship exposing (Ship)
import Sim.Status as Status
import Sim.SurfaceMotion exposing (Point, boatLocal)
import Sim.Systems exposing (World, bottom, damageScale, hullOf)


droneLimits : { deploySpeed : Float, depth : Float, range : Float, speed : Float, returnSpeed : Float }
droneLimits =
    { deploySpeed = 3, depth = 280, range = 100, speed = 10, returnSpeed = 10 }


{-| `2 ** -(difficulty?.damage ?? 0)`.
-}
droneDeployReason : World w -> String
droneDeployReason s =
    if (s.difficulty |> Maybe.andThen .drone) == Just False then
        "The ROV is disabled for this patrol."

    else
        let
            d : Drone
            d =
                s.drone
        in
        if d.mode == Lost then
            if String.isEmpty d.lostReason then
                "Drone lost for this patrol."

            else
                d.lostReason

        else if d.mode /= Stowed then
            "Drone is already outside."

        else if M.abs s.speed > 3 then
            "Slow to 3 knots or less before launching."

        else if s.depth > 280 then
            "Rise to 280 meters or less."

        else if d.battery < 15 then
            "Drone needs at least 15% charge."

        else if d.hull < 20 || d.mobility < 20 then
            "Drone requires onboard repairs."

        else
            ""


deployDrone : World w -> ( World w, Bool )
deployDrone s =
    if s.status /= Status.Patrol || not (String.isEmpty (droneDeployReason s)) then
        ( s, False )

    else
        let
            a : Float
            a =
                Mechanics.rad s.heading

            x : Float
            x =
                s.x + cos a * 18

            y : Float
            y =
                s.y - sin a * 18

            depth : Float
            depth =
                M.min droneLimits.depth (s.depth + 3)

            heading : Float
            heading =
                Mechanics.bearing { x = x, y = y } s

            d : Drone
            d =
                s.drone
        in
        ( Mechanics.log "Inspection drone deployed. Stay within 100 m; slow the sub for recovery."
            Info
            { s | drone = { d | mode = Remote, nosePitch = Nothing, x = x, y = y, depth = depth, targetDepth = depth, heading = heading, targetHeading = heading, speed = 0, targetSpeed = 0, verticalSpeed = 0, collisionCooldown = 0 } }
        , True
        )


recallDrone : World w -> World w
recallDrone s =
    if s.drone.mode /= Remote then
        s

    else
        let
            d : Drone
            d =
                s.drone

            p : { side : Float, forward : Float, down : Float }
            p =
                boatLocal (hullOf s) { x = d.x, y = d.y, depth = d.depth }

            below : Bool
            below =
                s.depth + 8 < M.min 279 (bottom s s.x s.y - 1)
        in
        Mechanics.log "Drone returning by the clearance lane to the starboard recovery hatch."
            Info
            { s
                | drone =
                    { d
                        | mode = Returning
                        , nosePitch = Nothing
                        , returnStage =
                            if p.side >= 9 && M.abs p.forward < 24 then
                                3

                            else
                                0
                        , returnClearance =
                            if below then
                                8

                            else if s.depth > 10 then
                                -8

                            else
                                8
                        , returnHoldSide = p.side
                        , returnHoldForward = p.forward
                    }
            }


loseDrone : String -> World w -> World w
loseDrone reason s =
    if s.drone.mode == Lost then
        s

    else
        let
            d : Drone
            d =
                s.drone
        in
        Mechanics.log ("DRONE LOST. " ++ reason) Damage { s | drone = { d | mode = Lost, speed = 0, targetSpeed = 0, lostReason = reason } }


damageDrone : Float -> String -> World w -> World w
damageDrone given reason s =
    let
        d : Drone
        d =
            s.drone
    in
    if not (d.mode == Remote || d.mode == Returning) || given <= 0 then
        s

    else
        let
            amount : Float
            amount =
                given * damageScale s

            hull : Equipment.Part
            hull =
                Equipment.damage amount { condition = d.hull, limit = d.repairLimits.hull }

            mobility : Equipment.Part
            mobility =
                Equipment.damage (amount * 0.8) { condition = d.mobility, limit = d.repairLimits.mobility }

            buoyancy : Equipment.Part
            buoyancy =
                Equipment.damage (amount * 0.7) { condition = d.buoyancy, limit = d.repairLimits.buoyancy }

            camera : Equipment.Part
            camera =
                Equipment.damage (amount * 0.95) { condition = d.camera, limit = d.repairLimits.camera }

            hit : Drone
            hit =
                { d
                    | hull = hull.condition
                    , mobility = mobility.condition
                    , buoyancy = buoyancy.condition
                    , camera = camera.condition
                    , repairLimits = { hull = hull.limit, mobility = mobility.limit, buoyancy = buoyancy.limit, camera = camera.limit }
                }

            logged : World w
            logged =
                Mechanics.log ("Drone impact: " ++ reason ++ " Integrity " ++ String.fromInt (ceiling hit.hull) ++ "%.") Damage { s | drone = hit }
        in
        if hit.hull <= 0 then
            loseDrone "Drone destroyed." logged

        else
            logged


{-| The patrol fields the drone's tick reads and writes, beyond those damage
uses.
-}
type alias Flying w =
    World { w | targetHeading : Float, engine : EngineMode, ships : List Ship, site : Maybe Body }


setDrone : Drone -> Flying w -> Flying w
setDrone d s =
    { s | drone = d }


dronePosition : Drone -> Point
dronePosition d =
    { x = d.x, y = d.y, depth = d.depth }
