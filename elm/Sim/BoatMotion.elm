module Sim.BoatMotion exposing (updateBoat)

{-| The boat's tick: propulsion, steering, depth keeping, the plant's fuel,
battery and air, the periscope, then the seabed (`Sim.SeabedContact`),
pressure, and the crew's work (`Sim.DamageControl`). The TypeScript mutates
one record in place; here each step takes the state the step before it left.
-}

import Sim.DamageControl exposing (Moving, crewWork, lose)
import Sim.Equipment as Equipment
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.Periscope as Periscope
import Sim.PowerPlant as Plant exposing (Propulsion)
import Sim.Pressure as Pressure
import Sim.SeabedContact exposing (seabed)
import Sim.Status as Status


{-| One tick of `dt` seconds. Returns the state and whether the diesel ran.
-}
updateBoat : Float -> Moving w -> ( Moving w, Bool )
updateBoat dt start =
    if start.water >= 70 || start.hull <= 0 then
        ( lose start, False )

    else
        let
            power : Propulsion
            power =
                Plant.propulsion start

            diesel : Bool
            diesel =
                power.generator > 0
        in
        start
            |> drive dt power
            |> keepDepth dt
            |> runPlant dt power diesel
            |> Result.map (afterPlant dt diesel)
            |> unwrap diesel


unwrap : Bool -> Result (Moving w) (Moving w) -> ( Moving w, Bool )
unwrap diesel result =
    case result of
        Ok s ->
            ( s, diesel )

        Err s ->
            ( s, False )


drive : Float -> Propulsion -> Moving w -> Moving w
drive dt power s =
    let
        lever : Float
        lever =
            Plant.throttlePercent s.targetSpeed / 100

        order : Float
        order =
            M.clamp
                (if s.silent then
                    -3

                 else
                    -4
                )
                (if s.silent then
                    3

                 else
                    power.ahead
                )
                (lever
                    * (if lever < 0 then
                        power.astern

                       else
                        power.ahead
                      )
                )

        accelerating : Bool
        accelerating =
            M.sign order == M.sign (order - s.speed)

        change : Float
        change =
            dt
                * 0.35
                * (if accelerating && not (M.isZero order) then
                    power.drive

                   else
                    1
                  )

        speed : Float
        speed =
            s.speed + M.clamp (negate change) change (order - s.speed)

        turn : Float
        turn =
            Mechanics.delta s.targetHeading s.heading

        steering : Float
        steering =
            Equipment.operatingFraction s.systems.rudder

        direction : Float
        direction =
            if M.truthy speed then
                speed

            else if M.truthy s.targetSpeed then
                s.targetSpeed

            else
                1

        helm : Float
        helm =
            steering * M.clamp -1 1 (turn / 8) * M.sign direction

        rudder : Float
        rudder =
            s.rudder + M.clamp (negate dt * 1.8) (dt * 1.8) (helm - s.rudder)

        yaw : Float
        yaw =
            if M.truthy steering then
                let
                    flow : Float
                    flow =
                        M.tanh (speed / 5)
                in
                3 * flow * rudder * dt

            else
                0

        swing : Float
        swing =
            if M.sign yaw == M.sign turn && M.abs turn < M.abs yaw then
                turn

            else
                yaw
    in
    { s | speed = speed, rudder = rudder, heading = M.remainder (s.heading + swing + 360) 360 }


keepDepth : Float -> Moving w -> Moving w
keepDepth dt s =
    let
        error : Float
        error =
            s.targetDepth - s.depth

        v : Float
        v =
            s.verticalSpeed

        throughWater : Float
        throughWater =
            s.speed * 0.514444

        demand : Float
        demand =
            if M.isZero s.targetDepth && s.depth > 0 then
                M.min -4 error

            else
                error

        ballastAuthority : Float
        ballastAuthority =
            Equipment.operatingFraction s.systems.ballast

        ballast : Float
        ballast =
            s.ballast + M.clamp (negate dt * 0.24) (dt * 0.24) (ballastAuthority * M.clamp -1 1 (demand * 0.16 - v * 0.8) - s.ballast)

        planeAuthority : Float
        planeAuthority =
            Equipment.operatingFraction s.systems.planes

        planes : Float
        planes =
            s.planes + M.clamp (negate dt * 0.5) (dt * 0.5) (planeAuthority * M.clamp -0.55 0.55 (error * 0.09 - v * 0.65) * M.sign s.speed - s.planes)

        authority : Float
        authority =
            if M.truthy planeAuthority then
                let
                    flow : Float
                    flow =
                        M.tanh (s.speed / 5)
                in
                flow * flow

            else
                0

        pitch : Float
        pitch =
            s.pitch + M.clamp (negate dt * 0.065) (dt * 0.065) (negate planes * authority * 0.54 - s.pitch)

        buoyancy : Float
        buoyancy =
            (if M.truthy ballastAuthority then
                ballast * 0.72

             else
                0
            )
                + s.water
                * 0.008

        verticalSpeed : Float
        verticalSpeed =
            M.clamp -2.8 3.2 (v + (buoyancy + (negate throughWater * sin pitch - v) * 0.8) * dt)

        depth : Float
        depth =
            M.clamp 0 330 (s.depth + verticalSpeed * dt)

        horizontal : Float
        horizontal =
            throughWater * cos pitch
    in
    { s
        | ballast = ballast
        , planes = planes
        , pitch = pitch
        , verticalSpeed =
            if M.isZero depth && verticalSpeed < 0 then
                0

            else
                verticalSpeed
        , depth = depth
        , x = s.x + sin (Mechanics.rad s.heading) * horizontal * dt
        , y = s.y + cos (Mechanics.rad s.heading) * horizontal * dt
    }


{-| The propeller, the noise, and the plant's fuel, battery and air. An
exhausted battery left too long ends the patrol, which is the `Err`.
-}
runPlant : Float -> Propulsion -> Bool -> Moving w -> Result (Moving w) (Moving w)
runPlant dt power diesel s =
    let
        prop : { rpm : Float, sigma : Float, cavitation : Float }
        prop =
            Mechanics.propellerState s.speed s.depth s.systems.propeller

        gunLoud : Float
        gunLoud =
            case s.gunLoudUntil of
                Just until ->
                    if M.truthy until then
                        until

                    else
                        0

                Nothing ->
                    0

        loud : Float
        loud =
            (if diesel then
                65

             else
                8
            )
                + s.speed
                * s.speed
                * 0.39
                + (if s.flood > 0 then
                    12

                   else
                    0
                  )
                + prop.cavitation
                * 23
                - (if s.silent then
                    7

                   else
                    0
                  )

        noise : Float
        noise =
            M.clamp 2
                100
                (M.max loud
                    (if s.time < gunLoud then
                        80

                     else
                        0
                    )
                )

        draw : { electric : Float, diesel : Float }
        draw =
            Plant.energyDraw s.speed power.chargeRate power.assistDrain

        turning : Moving w
        turning =
            { s | propAngle = M.remainder (s.propAngle + prop.rpm * pi / 30 * dt) (2 * pi), cavitation = Just prop.cavitation, propRpm = Just prop.rpm, noise = noise }

        fed : Moving w
        fed =
            if diesel then
                { turning
                    | fuel = M.clamp 0 turning.systems.fuelTank (turning.fuel - dt * draw.diesel)
                    , battery = M.clamp 0 turning.systems.batteryBank (turning.battery + dt * (power.chargeRate - power.assistDrain))
                    , oxygen = M.clamp 0 100 (turning.oxygen + dt * 0.35)
                }

            else
                { turning
                    | fuel = M.min turning.fuel turning.systems.fuelTank
                    , battery = M.clamp 0 turning.systems.batteryBank (turning.battery - dt * draw.electric)
                    , oxygen = M.clamp 0 100 (turning.oxygen - dt * (0.024 + (1 - Equipment.operatingFraction turning.systems.oxygen) * 0.1))
                }
    in
    if not diesel && M.isZero fed.battery then
        let
            warned : Moving w
            warned =
                case fed.unpoweredSince of
                    Nothing ->
                        Mechanics.log "Battery exhausted. Restore diesel power before the emergency watch ends." Damage { fed | unpoweredSince = Just fed.time }

                    Just _ ->
                        fed

            since : Float
            since =
                Maybe.withDefault fed.time warned.unpoweredSince
        in
        if M.isZero warned.fuel || warned.time - since >= 120 then
            Err (Mechanics.log "Ship’s power exhausted. Command recalled the patrol." Damage { warned | status = Status.Expired })

        else
            Ok warned

    else
        Ok { fed | unpoweredSince = Nothing }


afterPlant : Float -> Bool -> Moving w -> Moving w
afterPlant dt diesel s =
    let
        surfacing : Moving w
        surfacing =
            if s.depth < 2 then
                { s | oxygen = M.clamp 0 100 (s.oxygen + dt * 0.45) }

            else
                s

        scoped : Moving w
        scoped =
            (if surfacing.depth > 15 || not (M.truthy (Equipment.operatingFraction surfacing.systems.periscope)) then
                Periscope.orderScope False surfacing

             else
                surfacing
            )
                |> Periscope.advanceScope dt

        pressed : Moving w
        pressed =
            Pressure.updatePressure dt (seabed dt scoped)
    in
    if pressed.status == Status.Lost then
        pressed

    else
        crewWork dt diesel pressed
