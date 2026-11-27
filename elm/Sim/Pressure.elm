module Sim.Pressure exposing (Boat, depthLimit, pressureLevel, updatePressure)

{-| The boat's depth tolerance, which shrinks with outer and pressure hull
damage, and what exceeding it does: leaking seams, then implosion after
twenty seconds past the critical depth. Gameplay limits for this fictional
boat; wear on the outer shell lasts the patrol.
-}

import Sim.Debrief as Debrief
import Sim.Equipment as Equipment
import Sim.Math as M exposing (expm1)
import Sim.Mechanics as Mechanics exposing (LogKind(..), rand)
import Sim.Status exposing (Status(..))


depthLimit : { a | outerHull : Float, hull : Float } -> Float
depthLimit s =
    toFloat (round (220 * (0.15 + 0.35 * s.outerHull / 100 + 0.5 * s.hull / 100)))


{-| 0 within tolerance, 1 beyond it, 2 beyond 112% of it.
-}
pressureLevel : { a | depth : Float, outerHull : Float, hull : Float } -> Int
pressureLevel s =
    if depthLimit s * 1.12 < s.depth then
        2

    else if depthLimit s < s.depth then
        1

    else
        0


type alias Boat a r =
    { a
        | outerHull : Float
        , hull : Float
        , depth : Float
        , pressureAlarm : Int
        , criticalExposure : Float
        , flood : Float
        , repairLimits : { r | hull : Float }
        , status : Status
        , imploded : Bool
        , shock : Float
        , rng : Int
        , events : List Mechanics.LogEntry
        , time : Float
        , debrief : List Debrief.Entry
    }


damageHull : Float -> Boat a r -> Boat a r
damageHull amount s =
    let
        limits : { r | hull : Float }
        limits =
            s.repairLimits

        part : Equipment.Part
        part =
            Equipment.damage amount { condition = s.hull, limit = limits.hull }
    in
    { s | hull = part.condition, repairLimits = { limits | hull = part.limit } }


updatePressure : Float -> Boat a r -> Boat a r
updatePressure dt s0 =
    let
        level : Int
        level =
            pressureLevel s0

        announced : Boat a r
        announced =
            if level /= s0.pressureAlarm then
                let
                    logged : Boat a r
                    logged =
                        if level == 2 then
                            Mechanics.log "CRITICAL DEPTH. Pressure bulkheads at risk. Rise now!" Damage s0

                        else if level == 1 then
                            Mechanics.log "Depth tolerance exceeded. Order a shallower depth." Warning s0

                        else
                            Mechanics.log "Back within depth tolerance." Info s0
                in
                { logged | pressureAlarm = level }

            else
                s0

        s1 : Boat a r
        s1 =
            { announced
                | criticalExposure =
                    if level == 2 then
                        announced.criticalExposure + dt

                    else
                        0
            }
    in
    if level < 1 then
        s1

    else
        let
            excess : Float
            excess =
                s1.depth / depthLimit s1 - 1

            ( leakRoll, rng1 ) =
                rand s1.rng

            s2 : Boat a r
            s2 =
                if leakRoll < negate (expm1 (negate dt * (0.012 + 0.075 * excess))) then
                    let
                        ( size, rng2 ) =
                            rand rng1
                    in
                    { s1 | rng = rng2, flood = M.clamp 0 25 (s1.flood + 0.8 + size * 1.8) }
                        |> damageHull 0.4
                        |> Mechanics.log "Pressure seam leaking. Assign damage control to seal it and pump the bilge." Damage

                else
                    { s1 | rng = rng1 }
        in
        if level == 2 && s2.criticalExposure > 20 then
            let
                ( implodeRoll, rng3 ) =
                    rand s2.rng

                s3 : Boat a r
                s3 =
                    { s2 | rng = rng3 }
            in
            if implodeRoll < negate (expm1 (negate dt * (excess - 0.12) * 0.035)) then
                let
                    text : String
                    text =
                        "Pressure hull imploded beyond the damaged sub’s depth tolerance."

                    lost : Boat a r
                    lost =
                        damageHull 100 s3
                            |> (\b -> { b | status = Lost, imploded = True, shock = 2 })
                            |> Mechanics.log text Damage
                in
                { lost | debrief = Debrief.add lost.time text lost.debrief }

            else
                s3

        else
            s2
