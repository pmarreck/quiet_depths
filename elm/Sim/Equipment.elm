module Sim.Equipment exposing
    ( Part
    , Section(..)
    , System
    , compartment
    , conditionLabel
    , damage
    , hitSection
    , hitSystem
    , operatingFraction
    , repair
    , systemKey
    , systemName
    , systems
    )

{-| The submarine's equipment: its fourteen systems, the compartment each sits
in, and how hits damage and repairs restore them. Condition and repair limit
are independent: a light hit may leave more working equipment intact than the
crew could rebuild after a later hit.
-}

import Sim.Math as M


type System
    = Diesel
    | FuelTank
    | BatteryBank
    | Tubes
    | Engine
    | Propeller
    | Oxygen
    | Ballast
    | Planes
    | Rudder
    | Sonar
    | Periscope
    | Deckgun
    | Crew


{-| Every system, in the order saves list them and hits draw from them.
-}
systems : List System
systems =
    [ Diesel, FuelTank, BatteryBank, Tubes, Engine, Propeller, Oxygen, Ballast, Planes, Rudder, Sonar, Periscope, Deckgun, Crew ]


systemKey : System -> String
systemKey system =
    case system of
        Diesel ->
            "diesel"

        FuelTank ->
            "fuelTank"

        BatteryBank ->
            "batteryBank"

        Tubes ->
            "tubes"

        Engine ->
            "engine"

        Propeller ->
            "propeller"

        Oxygen ->
            "oxygen"

        Ballast ->
            "ballast"

        Planes ->
            "planes"

        Rudder ->
            "rudder"

        Sonar ->
            "sonar"

        Periscope ->
            "periscope"

        Deckgun ->
            "deckgun"

        Crew ->
            "crew"


systemName : System -> String
systemName system =
    case system of
        Diesel ->
            "DIESEL GENERATOR"

        FuelTank ->
            "FUEL TANK / FEED"

        BatteryBank ->
            "BATTERY BANK"

        Tubes ->
            "BOW TUBES"

        Engine ->
            "ELECTRIC DRIVE MOTOR"

        Propeller ->
            "PROPELLER"

        Oxygen ->
            "AIR / SCRUBBERS"

        Ballast ->
            "BALLAST"

        Planes ->
            "DIVE PLANES"

        Rudder ->
            "RUDDER"

        Sonar ->
            "SONAR"

        Periscope ->
            "PERISCOPE"

        Deckgun ->
            "DECK GUN"

        Crew ->
            "REPAIR CREW"


type Section
    = Bow
    | Midships
    | Stern


{-| Fictional board-game compartments. A shock can also damage equipment
elsewhere.
-}
compartment : System -> Section
compartment system =
    case system of
        Tubes ->
            Bow

        Deckgun ->
            Bow

        Crew ->
            Bow

        Ballast ->
            Midships

        Oxygen ->
            Midships

        Periscope ->
            Midships

        Sonar ->
            Midships

        BatteryBank ->
            Midships

        Diesel ->
            Stern

        FuelTank ->
            Stern

        Engine ->
            Stern

        Propeller ->
            Stern

        Rudder ->
            Stern

        Planes ->
            Stern


{-| A part's condition and the most a repair can restore, both in percent.
-}
type alias Part =
    { condition : Float, limit : Float }


{-| Equipment below 20% does not work at all; above that it works in
proportion to its condition.
-}
operatingFraction : Float -> Float
operatingFraction condition =
    if condition >= 20 then
        condition / 100

    else
        0


{-| A hit takes condition away and lowers what the crew can rebuild; a part
reduced to nothing can never be rebuilt. A part already destroyed, or a hit
of no size, changes nothing.
-}
damage : Float -> Part -> Part
damage amount part =
    if isNaN amount || isInfinite amount || amount <= 0 || part.condition <= 0 then
        part

    else
        let
            condition =
                M.max 0 (part.condition - amount)
        in
        { condition = condition
        , limit =
            if M.isZero condition then
                0

            else
                part.limit * 0.85
        }


{-| Repairs restore condition up to the part's limit; destroyed equipment and
equipment already at its limit stay as they are.
-}
repair : Float -> Part -> Part
repair amount part =
    if part.condition <= 0 || part.limit <= part.condition then
        part

    else
        { part | condition = M.min part.limit (part.condition + amount) }


conditionLabel : Bool -> Part -> String
conditionLabel offlineBelow20 part =
    if M.isZero part.condition then
        "DESTROYED"

    else
        String.fromInt (floor part.condition)
            ++ "%"
            ++ (if part.condition < 20 && offlineBelow20 then
                    " · OFFLINE"

                else
                    ""
               )
            ++ (if part.limit < 100 then
                    " · MAX REPAIR " ++ String.fromFloat (toFloat (floor (part.limit * 100)) / 100) ++ "%"

                else
                    ""
               )


{-| Which third of the hull a hit lands in, by its position along the boat
relative to the distance from the hull, never less than 30 m.
-}
hitSection : { a | x : Float, y : Float, heading : Float } -> { b | x : Float, y : Float } -> Section
hitSection boat hit =
    let
        angle =
            boat.heading * pi / 180

        dx =
            hit.x - boat.x

        dy =
            hit.y - boat.y

        longitudinal =
            (dx * sin angle + dy * cos angle) / M.max 30 (M.hypot2 dx dy)
    in
    if longitudinal > 0.34 then
        Bow

    else if longitudinal < -0.34 then
        Stern

    else
        Midships


{-| The system a hit damages. A located hit strikes its own section four
times in five and anywhere aboard otherwise; an unlocated shock can strike
anything.
-}
hitSystem : Maybe Section -> Float -> System
hitSystem section roll =
    let
        ( pool, pick ) =
            case section of
                Nothing ->
                    ( systems, roll )

                Just local ->
                    if roll < 0.8 then
                        ( List.filter (\system -> compartment system == local) systems, roll / 0.8 )

                    else
                        ( systems, (roll - 0.8) / 0.2 )

        count =
            List.length pool
    in
    pool
        |> List.drop (Basics.min (count - 1) (floor (pick * toFloat count)))
        |> List.head
        -- Every section holds at least one system, so the pool is never empty.
        |> Maybe.withDefault Crew
