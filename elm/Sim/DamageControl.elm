module Sim.DamageControl exposing (Moving, crewWork, lose)

{-| The crew's work through a tick: air, power for the pumps, fuel leaks and
fires, flooding and its alarm, and repairs to the hull and every system.
-}

import Sim.Boat as Boat
import Sim.Equipment as Equipment exposing (System(..))
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.PowerPlant as Plant exposing (DieselMode, EngineMode)
import Sim.ReplayEvents as Replay
import Sim.Status as Status
import Sim.Systems as Systems exposing (World)


{-| The patrol fields the boat's tick reads and writes, beyond those damage
uses.
-}
type alias Moving w =
    World
        { w
            | targetSpeed : Float
            , targetHeading : Float
            , targetDepth : Float
            , verticalSpeed : Float
            , water : Float
            , rudder : Float
            , ballast : Float
            , planes : Float
            , propAngle : Float
            , cavitation : Maybe Float
            , propRpm : Maybe Float
            , noise : Float
            , silent : Bool
            , gunLoudUntil : Maybe Float
            , oxygen : Float
            , unpoweredSince : Maybe Float
            , repair : Float
            , floodAlarm : Bool
            , collisionCooldown : Float
            , bottomed : Bool
            , engine : EngineMode
            , dieselMode : DieselMode
            , pressureAlarm : Int
            , criticalExposure : Float
            , imploded : Bool
            , fuelFire : Float
        }


lose : Moving w -> Moving w
lose s =
    Mechanics.log
        (if s.water >= 70 then
            "Flooding overwhelmed the sub. Buoyancy lost."

         else
            "Pressure hull lost."
        )
        Damage
        { s | status = Status.Lost }


crewWork : Float -> Bool -> Moving w -> Moving w
crewWork dt diesel start =
    let
        airless : Moving w
        airless =
            if start.oxygen <= 0 then
                Mechanics.log "Air exhausted. Surface immediately." Damage { start | hull = M.max 0 (start.hull - dt * 2) }

            else
                start

        crew : Float
        crew =
            airless.systems.crew / 100

        idle : Moving w
        idle =
            if M.isZero crew || (not diesel && not (M.truthy (Plant.batteryOutput airless))) then
                { airless | repair = 0 }

            else
                airless

        burning : Moving w
        burning =
            fuelEmergency dt crew idle

        working : Bool
        working =
            burning.repair > 0

        rate : Float
        rate =
            burning.flood
                - (if working then
                    5

                   else
                    1.2
                  )
                * crew

        flooded : Moving w
        flooded =
            { burning | water = M.clamp 0 100 (burning.water + rate * dt / 60) }

        alarmed : Moving w
        alarmed =
            if flooded.water > 4 && rate > 0 && not flooded.floodAlarm then
                Mechanics.log "FLOODING ALARM. Inflow exceeds pumps. Assign damage control." Damage { flooded | floodAlarm = True }

            else
                flooded

        quieted : Moving w
        quieted =
            if rate <= 0 then
                { alarmed | floodAlarm = False }

            else
                alarmed

        repaired : Moving w
        repaired =
            if working then
                repairs dt diesel crew quieted

            else
                quieted

        soaked : Moving w
        soaked =
            if repaired.water > 12 then
                { repaired | hull = M.max 0 (repaired.hull - dt * (repaired.water - 12) * 0.012) }

            else
                repaired

        ended : Moving w
        ended =
            if soaked.water >= 70 || soaked.hull <= 0 then
                lose soaked

            else
                soaked
    in
    { ended | collisionCooldown = M.max 0 (ended.collisionCooldown - dt) }


repairs : Float -> Bool -> Float -> Moving w -> Moving w
repairs dt diesel crew s =
    let
        hull : Float
        hull =
            (Equipment.repair (dt * 0.06 * crew) { condition = s.hull, limit = s.repairLimits.hull }).condition

        mended : Boat.Systems
        mended =
            List.foldl
                (\key parts -> Boat.setCondition key (Equipment.repair (dt * 0.11 * crew) { condition = Boat.condition key parts, limit = Boat.condition key s.repairLimits }).condition parts)
                s.systems
                Equipment.systems
    in
    { s
        | repair = M.max 0 (s.repair - dt)
        , flood = M.max 0 (s.flood - dt * 0.045 * crew)
        , hull = hull
        , battery =
            if diesel then
                s.battery

            else
                M.max 0 (s.battery - dt * 0.016)
        , systems = mended
    }


fuelEmergency : Float -> Float -> Moving w -> Moving w
fuelEmergency dt crew s =
    let
        working : Float
        working =
            if s.repair > 0 then
                crew

            else
                0
    in
    s |> leak dt working |> fire dt working


leak : Float -> Float -> Moving w -> Moving w
leak dt working s =
    if s.fuelLeak > 0 then
        let
            draining : Moving w
            draining =
                { s | fuel = M.max 0 (s.fuel - s.fuelLeak * 0.12 * dt), fuelLeak = M.max 0 (s.fuelLeak - working * 0.018 * dt) }

            sealed : Moving w
            sealed =
                if M.isZero draining.fuelLeak then
                    Mechanics.log "Crew sealed the fuel leak." Success draining

                else
                    draining
        in
        if sealed.fuel > 0 && not (M.truthy sealed.fuelFire) && M.truthy sealed.fuelLeak then
            let
                ( r, drawn ) =
                    Systems.draw sealed
            in
            if r < negate (M.expm1 (negate dt * drawn.fuelLeak * 0.012)) then
                { drawn | fuelFire = 24 }
                    |> Mechanics.log "Fuel fire! Damage control requested." Damage
                    |> Systems.addDebrief "Leaking fuel caught fire."

            else
                drawn

        else
            sealed

    else
        s


fire : Float -> Float -> Moving w -> Moving w
fire dt working s =
    if s.fuelFire > 0 then
        let
            burnt : Moving w
            burnt =
                { s | fuel = M.max 0 (s.fuel - dt * 0.07), hull = M.max 0 (s.hull - dt * 0.09) }

            ( exploded, drawn ) =
                if burnt.fuel > 0 then
                    Systems.draw burnt |> Tuple.mapFirst (\r -> r < negate (M.expm1 (negate dt * 0.0015)))

                else
                    ( False, burnt )
        in
        if exploded then
            let
                message : String
                message =
                    "Fuel vapor explosion in the machinery space."

                here : { x : Float, y : Float, depth : Float }
                here =
                    { x = drawn.x, y = drawn.y, depth = drawn.depth }

                blown : Moving w
                blown =
                    drawn
                        |> Systems.onboardExplosion "vapor" here
                        |> Replay.mark (Replay.at Replay.Blast here)
                        |> Systems.hurt 9 message (Just Diesel) Nothing
                        |> Systems.addDebrief message
            in
            { blown | fuelFire = 0 }

        else
            let
                out : Moving w
                out =
                    { drawn | fuelFire = M.max 0 (drawn.fuelFire - dt * (0.5 + working * 3)) }
            in
            if M.truthy out.fuelFire then
                out

            else
                Mechanics.log "Fuel fire out." Success out

    else
        s
