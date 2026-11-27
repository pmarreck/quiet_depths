module Sim.DroneFlight exposing (updateDrone)

{-| The inspection drone's tick: charging and repairs while stowed; out of
the hatch, its link and battery, the return lane home, flight, collisions
with hulls and the seabed, depth-charge pressure waves, and recovery.
-}

import Sim.Acoustics as Acoustics
import Sim.Drone exposing (Drone, Limits, Mode(..))
import Sim.DroneCollisions exposing (collide, obstacles, seabed)
import Sim.DroneOrders as Orders exposing (Flying, dronePosition, setDrone)
import Sim.DroneReturn exposing (returnOrder)
import Sim.Equipment as Equipment
import Sim.HullGeometry as Geometry
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.PowerPlant as Plant
import Sim.Sound exposing (Sound)
import Sim.SurfaceMotion exposing (Point)
import Sim.Systems as Systems
import Sim.VehicleStatus as VehicleStatus


{-| One tick of `dt` seconds; `diesel` says whether the diesel ran.
-}
updateDrone : Float -> Bool -> Flying w -> Flying w
updateDrone dt diesel start =
    let
        cooled : Drone
        cooled =
            start.drone |> (\d -> { d | collisionCooldown = M.max 0 (d.collisionCooldown - dt) })

        s : Flying w
        s =
            setDrone cooled start
    in
    case cooled.mode of
        Stowed ->
            stowed dt diesel s

        Lost ->
            s

        _ ->
            outside dt s


stowed : Float -> Bool -> Flying w -> Flying w
stowed dt diesel s =
    let
        d0 : Drone
        d0 =
            s.drone

        docked : Drone
        docked =
            { d0 | x = s.x, y = s.y, depth = s.depth, heading = s.heading, speed = 0, targetSpeed = 0, targetHeading = s.heading, targetDepth = s.depth }

        charged : Flying w
        charged =
            if diesel || s.battery > 1 && M.truthy (Plant.batteryOutput s) then
                let
                    charge : Float
                    charge =
                        M.min (100 - docked.battery) (dt * 0.32)

                    repair : Float
                    repair =
                        dt * 0.2 * s.systems.crew / 100

                    mend : Float -> Float -> Float
                    mend condition limit =
                        (Equipment.repair repair { condition = condition, limit = limit }).condition

                    lim : Limits
                    lim =
                        docked.repairLimits
                in
                { s
                    | battery =
                        if diesel then
                            s.battery

                        else
                            M.max 0 (s.battery - charge * 0.08)
                    , drone =
                        { docked
                            | battery = docked.battery + charge
                            , hull = mend docked.hull lim.hull
                            , mobility = mend docked.mobility lim.mobility
                            , buoyancy = mend docked.buoyancy lim.buoyancy
                            , camera = mend docked.camera lim.camera
                        }
                }

            else
                setDrone docked s

        d : Drone
        d =
            charged.drone
    in
    if d.battery > 12 then
        setDrone { d | lowAlarm = False } charged

    else
        charged


boatPosition : Flying w -> Point
boatPosition s =
    { x = s.x, y = s.y, depth = s.depth }


outside : Float -> Flying w -> Flying w
outside dt s =
    let
        link : Float
        link =
            Mechanics.separation s.drone s
    in
    if Orders.droneLimits.range < link then
        Orders.loseDrone "Control link exceeded 100 m." s

    else
        let
            alarmed : Flying w
            alarmed =
                if link >= 70 && not s.drone.rangeAlarm then
                    Mechanics.log "Drone link at 70 m. Slow the sub and bring the drone home." Warning (setDrone (s.drone |> (\d -> { d | rangeAlarm = True })) s)

                else
                    s

            cleared : Flying w
            cleared =
                if link < 60 then
                    setDrone (alarmed.drone |> (\d -> { d | rangeAlarm = False })) alarmed

                else
                    alarmed

            before : Float
            before =
                cleared.drone.battery

            drained : Flying w
            drained =
                setDrone (cleared.drone |> (\d -> { d | battery = M.max 0 (d.battery - dt * (0.045 + d.speed * d.speed * 0.0013 + (100 - d.hull) * 0.0003)) })) cleared

            low : Flying w
            low =
                if before > 10 && drained.drone.battery <= 10 && not drained.drone.lowAlarm then
                    Mechanics.log "DRONE BATTERY 10%. Return immediately." Damage (setDrone (drained.drone |> (\d -> { d | lowAlarm = True })) drained)

                else
                    drained
        in
        if low.drone.battery <= 0 then
            Orders.loseDrone "Battery exhausted." low

        else
            fly dt low


fly : Float -> Flying w -> Flying w
fly dt s =
    let
        dock : Point
        dock =
            VehicleStatus.recoveryDock (Systems.hullOf s)

        ordered : Flying w
        ordered =
            if s.drone.mode == Returning then
                returnOrder dt s

            else
                s

        d : Drone
        d =
            ordered.drone

        mobility : Float
        mobility =
            Equipment.operatingFraction d.mobility

        order : Float
        order =
            M.clamp (-3 * mobility) (VehicleStatus.droneReturnSpeed (Just d.mobility)) d.targetSpeed

        change : Float
        change =
            dt
                * (if not (M.isZero order) && M.sign order == M.sign (order - d.speed) then
                    mobility

                   else
                    1
                  )

        speed : Float
        speed =
            d.speed + M.clamp (negate change) change (order - d.speed)

        heading : Float
        heading =
            M.remainder (d.heading + M.clamp (negate dt * 12 * mobility) (dt * 12 * mobility) (Mechanics.delta d.targetHeading d.heading) + 360) 360

        pitch : Float
        pitch =
            case d.nosePitch of
                Nothing ->
                    0

                Just degrees ->
                    Mechanics.rad degrees

        forward : Float
        forward =
            speed * 0.514444 * cos pitch

        flying : Bool
        flying =
            d.mode == Remote && d.nosePitch /= Nothing && not (M.isZero d.targetSpeed)

        vertical : Float
        vertical =
            if flying then
                negate speed * 0.514444 * sin pitch

            else
                M.clamp -1 1 ((d.targetDepth - d.depth) * 0.8)

        desired : Float
        desired =
            vertical * Equipment.operatingFraction d.buoyancy + (100 - d.buoyancy) * 0.003

        verticalSpeed : Float
        verticalSpeed =
            d.verticalSpeed + M.clamp (negate dt * 0.6) (dt * 0.6) (desired - d.verticalSpeed)

        depth : Float
        depth =
            M.clamp 0 280 (d.depth + verticalSpeed * dt)

        moved : Drone
        moved =
            { d
                | speed = speed
                , heading = heading
                , verticalSpeed = verticalSpeed
                , depth = depth
                , targetDepth =
                    if flying then
                        depth

                    else
                        d.targetDepth
                , x = d.x + sin (Mechanics.rad heading) * forward * dt
                , y = d.y + cos (Mechanics.rad heading) * forward * dt
            }

        afterHulls : Flying w
        afterHulls =
            List.foldl (collide forward) (setDrone moved ordered) (obstacles ordered)
    in
    afterHulls
        |> seabed
        |> pressureWaves
        |> finish dock


{-| Each blast's pressure front reaches the drone on its own schedule,
independent of when the boat hears it.
-}
pressureWaves : Flying w -> Flying w
pressureWaves s =
    let
        wave : Sound -> ( List Sound, Flying w ) -> ( List Sound, Flying w )
        wave sound ( kept, state ) =
            let
                d : Drone
                d =
                    state.drone
            in
            if sound.kind == Acoustics.Blast && (sound.droneHit /= Just True) && Acoustics.propagationTime sound { x = d.x, y = d.y, depth = Just d.depth, heading = Just d.heading } <= state.time - sound.time then
                let
                    r : Float
                    r =
                        Mechanics.separation d { x = sound.x, y = sound.y, depth = Geometry.orZero sound.depth }
                in
                ( { sound | droneHit = Just True } :: kept
                , if r < 140 then
                    Orders.damageDrone (85 * (1 - r / 140)) "depth charge pressure wave" state

                  else
                    state
                )

            else
                ( sound :: kept, state )

        ( sounds, after ) =
            List.foldl wave ( [], s ) s.acoustics
    in
    { after | acoustics = List.reverse sounds }


finish : Point -> Flying w -> Flying w
finish dock s =
    let
        d : Drone
        d =
            s.drone
    in
    if d.mode == Lost then
        s

    else
        let
            recovered : Flying w
            recovered =
                if d.mode == Returning && d.returnStage == 3 && Mechanics.separation (dronePosition d) dock < 1.2 && M.abs s.speed <= 3 then
                    Mechanics.log "Drone recovered. Charging and repairs underway." Success (setDrone { d | mode = Stowed, speed = 0, targetSpeed = 0 } s)

                else
                    s
        in
        if Mechanics.separation recovered.drone (boatPosition recovered) > 100 then
            Orders.loseDrone "Control link exceeded 100 m." recovered

        else
            recovered
