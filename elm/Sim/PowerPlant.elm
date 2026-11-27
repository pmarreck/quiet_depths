module Sim.PowerPlant exposing
    ( DieselMode(..)
    , EngineMode(..)
    , Plant
    , Propulsion
    , batteryOutput
    , dieselRoutingStatus
    , electricKnots
    , energyDraw
    , generatorOutput
    , propulsion
    , surfaceKnots
    , throttleOrder
    , throttlePercent
    )

{-| The diesel-electric plant: how much the generator and battery can give,
the speeds they allow, battery charging and assist, and the energy each
second of running costs.
-}

import Sim.Equipment exposing (operatingFraction)
import Sim.Math as M exposing (cbrt)


surfaceKnots : Float
surfaceKnots =
    20.5


electricKnots : Float
electricKnots =
    16


type EngineMode
    = Diesel
    | Electric


{-| Where the diesel's output goes: charging the battery, the shaft alone, or
the shaft with the battery's help.
-}
type DieselMode
    = Charge
    | Drive
    | Assist


{-| Only the system conditions the plant reads.
-}
type alias Plant a c =
    { a
        | engine : EngineMode
        , depth : Float
        , fuel : Float
        , battery : Float
        , systems : { c | diesel : Float, fuelTank : Float, batteryBank : Float, engine : Float, propeller : Float }
    }


{-| The diesel needs air, so it runs at snorkel depth or shallower.
-}
generatorOutput : Plant a c -> Float
generatorOutput s =
    if s.engine == Diesel && s.depth <= 14 && s.fuel > 0 then
        M.min (operatingFraction s.systems.diesel) (operatingFraction s.systems.fuelTank)

    else
        0


batteryOutput : Plant a c -> Float
batteryOutput s =
    if s.battery > 0 then
        operatingFraction s.systems.batteryBank

    else
        0


{-| The saved lever runs from -4 to 17; both directions reach full throttle.
-}
throttlePercent : Float -> Float
throttlePercent order =
    M.min 100
        (M.max -100
            (order
                * 100
                / (if order < 0 then
                    4

                   else
                    17
                  )
            )
        )


throttleOrder : Float -> Float
throttleOrder percent =
    percent
        * (if percent < 0 then
            4

           else
            17
          )
        / 100


type alias Propulsion =
    { generator : Float, drive : Float, ahead : Float, astern : Float, chargeRate : Float, assistDrain : Float }


propulsion : Plant { a | dieselMode : DieselMode, targetSpeed : Float, silent : Bool } c -> Propulsion
propulsion s =
    let
        generator : Float
        generator =
            generatorOutput s

        battery : Float
        battery =
            batteryOutput s

        shaft : Float
        shaft =
            M.min (operatingFraction s.systems.engine) (operatingFraction s.systems.propeller)
    in
    case s.engine of
        Electric ->
            let
                drive : Float
                drive =
                    M.min battery shaft
            in
            { generator = generator, drive = drive, ahead = drive * electricKnots, astern = 4 * drive, chargeRate = 0, assistDrain = 0 }

        Diesel ->
            let
                submerged : Float
                submerged =
                    M.max 0 (M.min 1 ((s.depth - 1) / 4))

                rating : Float -> Float -> Float
                rating surface snorkeling =
                    surface + (snorkeling - surface) * submerged

                dieselRating : Float
                dieselRating =
                    rating surfaceKnots 13

                space : Float
                space =
                    M.max 0 (s.systems.batteryBank - s.battery)

                charging : Float
                charging =
                    if s.dieselMode == Charge && space > 0 then
                        operatingFraction s.systems.batteryBank

                    else
                        0

                reserve : Float
                reserve =
                    charging * M.min 1 (space / 2)

                drive : Float
                drive =
                    M.min generator shaft

                ( ahead, assistDrain ) =
                    if s.dieselMode == Assist && generator > 0 && battery > 0 then
                        let
                            genKnots : Float
                            genKnots =
                                drive * dieselRating

                            -- Shaft power goes roughly as speed cubed. Only demand above
                            -- the generator's capacity draws on the battery; both
                            -- sources share one motor.
                            combined : Float
                            combined =
                                cbrt (genKnots ^ 3 + (M.min battery shaft * electricKnots) ^ 3)

                            assisted : Float
                            assisted =
                                M.min (shaft * rating 22 17) combined

                            demand : Float
                            demand =
                                M.min
                                    (if s.silent then
                                        3

                                     else
                                        assisted
                                    )
                                    (M.max 0 (throttlePercent s.targetSpeed) / 100 * assisted)
                        in
                        ( assisted, 0.2 * M.max 0 (demand ^ 3 - genKnots ^ 3) / electricKnots ^ 3 )

                    else
                        let
                            allocated : Float
                            allocated =
                                generator * (dieselRating - reserve * (dieselRating - rating 18.5 9))
                        in
                        ( M.min (shaft * dieselRating) allocated, 0 )

                acceleration : Float
                acceleration =
                    if reserve > 0 || assistDrain > 0 then
                        ahead / dieselRating

                    else
                        drive
            in
            { generator = generator, drive = acceleration, ahead = ahead, astern = 4 * drive, chargeRate = 0.12 * generator * charging, assistDrain = assistDrain }


dieselRoutingStatus : Plant { a | dieselMode : DieselMode } c -> Propulsion -> String
dieselRoutingStatus s plant =
    if not (M.truthy plant.generator) then
        ""

    else
        case s.dieselMode of
            Charge ->
                if plant.chargeRate > 0 then
                    "CHARGING"

                else if M.truthy (operatingFraction s.systems.batteryBank) then
                    "BATTERY FULL"

                else
                    "BATTERY OFFLINE"

            Drive ->
                "CHARGE OFF"

            Assist ->
                if not (M.truthy (batteryOutput s)) then
                    "ASSIST UNAVAILABLE"

                else if plant.assistDrain > 0 then
                    "BATTERY ASSIST ACTIVE"

                else
                    "BATTERY ASSIST READY"


{-| Patrol-scale energy per simulation second. The fixed load keeps the
lights, pumps and instruments running; propulsion follows a cubic
speed-power curve.
-}
energyDraw : Float -> Float -> Float -> { electric : Float, diesel : Float }
energyDraw speed chargeRate assistDrain =
    let
        knots : Float
        knots =
            M.abs speed
    in
    { electric = 0.009 + 0.18 * (knots / electricKnots) ^ 3
    , diesel = 0.004 + 0.032 * M.max 0 ((knots / surfaceKnots) ^ 3 - assistDrain / 0.2 * (electricKnots / surfaceKnots) ^ 3) + 0.1 * chargeRate
    }
