module Sim.Systems exposing (Difficulty, Impact, World, addDebrief, bottom, damageScale, damageSystem, draw, emitSound, hullOf, hurt, onboardExplosion)

{-| Damage to the boat: its systems, its hulls, and onboard explosions. The
drone's orders and damage are in `Sim.DroneOrders`, the boat's per-tick motion
in `Sim.BoatMotion`, the drone's flight in `Sim.DroneFlight`. Each function threads the patrol's random stream through
`rng` in the TypeScript's order, drawing only where it draws.
-}

import Dict exposing (Dict)
import Sim.Acoustics as Acoustics
import Sim.Boat as Boat exposing (Limits, Systems)
import Sim.Coast as Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.Drone exposing (Drone)
import Sim.Equipment as Equipment exposing (Section(..), System(..))
import Sim.InvalidNumber as InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.Periscope as Periscope
import Sim.ReplayEvents as Replay
import Sim.Sound exposing (Sound)
import Sim.Status as Status exposing (Status)
import Sim.SurfaceMotion exposing (Point)


type alias Difficulty =
    { drone : Maybe Bool, damage : Maybe Float }


type alias Impact =
    { id : Int, x : Float, y : Float, altitude : Float, time : Float, kind : String }


{-| The patrol fields damage and the drone's orders read and write.
-}
type alias World w =
    { w
        | status : Status
        , time : Float
        , rng : Int
        , difficulty : Maybe Difficulty
        , x : Float
        , y : Float
        , depth : Float
        , heading : Float
        , pitch : Float
        , roll : Maybe Float
        , speed : Float
        , systems : Systems
        , repairLimits : Limits
        , hull : Float
        , outerHull : Float
        , flood : Float
        , shock : Float
        , fuel : Float
        , fuelLeak : Float
        , battery : Float
        , scope : Bool
        , scopeTravel : Maybe Float
        , torps : Int
        , cookoff : Bool
        , collisionHits : Dict String Float
        , drone : Drone
        , chart : Maybe Coastline
        , impacts : List Impact
        , weaponSequence : Int
        , events : List LogEntry
        , debrief : List Debrief.Entry
        , acoustics : List Sound
        , soundSequence : Int
        , replay : List Replay.Marked
        , invalid : List InvalidNumber
    }


damageScale : World w -> Float
damageScale s =
    2 ^ negate (s.difficulty |> Maybe.andThen .damage |> Maybe.withDefault 0)


{-| The boat as the vehicle-status helpers take it; a missing roll is 0, as
`roll || 0` makes it.
-}
hullOf : World w -> { x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float }
hullOf s =
    { x = s.x, y = s.y, heading = s.heading, depth = s.depth, pitch = s.pitch, roll = Maybe.withDefault 0 s.roll }


{-| The charted seabed under a point.
-}
bottom : World w -> Float -> Float -> Float
bottom s =
    Coast.chartDepth s.chart


addDebrief : String -> World w -> World w
addDebrief text s =
    { s | debrief = Debrief.add s.time text s.debrief }


damageSystem : System -> Float -> World w -> World w
damageSystem key amount s =
    if isNaN amount || isInfinite amount then
        InvalidNumber.report "damageSystem" amount s

    else
        damageFinite key amount s


damageFinite : System -> Float -> World w -> World w
damageFinite key amount s =
    let
        old : Float
        old =
            Boat.condition key s.systems

        part : Equipment.Part
        part =
            Equipment.damage amount { condition = old, limit = Boat.condition key s.repairLimits }

        health : Float
        health =
            part.condition

        damaged : World w
        damaged =
            { s | systems = Boat.setCondition key health s.systems, repairLimits = Boat.setCondition key part.limit s.repairLimits }

        leaking : World w
        leaking =
            if key == FuelTank && health < old then
                let
                    fuel : Float
                    fuel =
                        M.min damaged.fuel health
                in
                if fuel > 0 then
                    Mechanics.log "Fuel tank leaking. Assign damage control." Damage { damaged | fuel = fuel, fuelLeak = M.min 1 (damaged.fuelLeak + (old - health) / 100) }

                else
                    { damaged | fuel = fuel }

            else
                damaged

        drained : World w
        drained =
            if key == BatteryBank then
                { leaking | battery = M.min leaking.battery health }

            else
                leaking

        lowered : World w
        lowered =
            if key == Periscope && not (M.truthy (Equipment.operatingFraction health)) then
                let
                    ordered : World w
                    ordered =
                        Periscope.orderScope False drained
                in
                if M.isZero health then
                    { ordered | scopeTravel = Nothing }

                else
                    ordered

            else
                drained

        name : String
        name =
            Equipment.systemName key
    in
    if old > 0 && M.isZero health then
        Mechanics.log (name ++ " destroyed. Beyond onboard repair.") Damage lowered

    else if old >= 20 && health < 20 && key /= Crew then
        Mechanics.log (name ++ " offline.") Damage lowered

    else if old >= 60 && health < 60 then
        Mechanics.log (name ++ " damaged. Performance reduced.") Damage lowered

    else
        lowered


sectionName : Section -> String
sectionName section =
    case section of
        Bow ->
            "BOW"

        Midships ->
            "MIDSHIPS"

        Stern ->
            "STERN"


draw : World w -> ( Float, World w )
draw s =
    let
        ( r, rng ) =
            Mechanics.rand s.rng
    in
    ( r, { s | rng = rng } )


{-| Damage to the boat: the outer and pressure hulls, flooding, a system hit
in the struck section, and, rarely, a torpedo-room cook-off.
-}
hurt : Float -> String -> Maybe System -> Maybe Point -> World w -> World w
hurt given text subsystem point start =
    if isNaN given || isInfinite given then
        InvalidNumber.report "hurt" given start

    else if given <= 0 || start.status /= Status.Patrol then
        start

    else
        let
            amount : Float
            amount =
                given * damageScale start

            hullPart : Equipment.Part
            hullPart =
                Equipment.damage amount { condition = start.hull, limit = start.repairLimits.hull }

            limits : Limits
            limits =
                start.repairLimits

            struck : World w
            struck =
                Mechanics.log text
                    Damage
                    { start
                        | outerHull = M.clamp 0 100 (start.outerHull - amount * 0.85)
                        , hull = hullPart.condition
                        , repairLimits = { limits | hull = hullPart.limit }
                        , flood = M.clamp 0 25 (start.flood + amount * 0.11)
                        , shock = 2
                    }

            section : Maybe Section
            section =
                Maybe.map (Equipment.hitSection struck) point

            systemHit : World w
            systemHit =
                if amount >= 2 || subsystem /= Nothing then
                    let
                        ( key, keyed ) =
                            case subsystem of
                                Just chosen ->
                                    ( chosen, struck )

                                Nothing ->
                                    draw struck |> Tuple.mapFirst (Equipment.hitSystem section)

                        ( r, drawn ) =
                            draw keyed

                        damaged : World w
                        damaged =
                            damageSystem key (amount * (1.2 + r)) drawn
                    in
                    case section of
                        Just hit ->
                            Mechanics.log (sectionName hit ++ " hit · " ++ Equipment.systemName key ++ " " ++ String.fromInt (ceiling (Boat.condition key damaged.systems)) ++ "%.") Damage damaged

                        Nothing ->
                            damaged

                else
                    struck
        in
        case ( section, point ) of
            ( Just Bow, Just at ) ->
                if amount > 24 && systemHit.torps > 0 then
                    let
                        ( r, drawn ) =
                            draw systemHit
                    in
                    if r < 0.025 then
                        cookoff at drawn

                    else
                        lostIfBreached drawn

                else
                    lostIfBreached systemHit

            _ ->
                lostIfBreached systemHit


cookoff : Point -> World w -> World w
cookoff at s =
    let
        hullPart : Equipment.Part
        hullPart =
            Equipment.damage 100 { condition = s.hull, limit = s.repairLimits.hull }

        limits : Limits
        limits =
            s.repairLimits

        message : String
        message =
            "Torpedo-room cook-off. The submarine is lost."
    in
    { s | torps = s.torps - 1, cookoff = True, status = Status.Lost, hull = hullPart.condition, repairLimits = { limits | hull = hullPart.limit } }
        |> onboardExplosion "cookoff" at
        |> Mechanics.log message Damage
        |> addDebrief message


lostIfBreached : World w -> World w
lostIfBreached s =
    if s.hull <= 0 then
        Mechanics.log "Pressure hull lost. All stations, abandon ship." Damage { s | status = Status.Lost }

    else
        s


onboardExplosion : String -> Point -> World w -> World w
onboardExplosion kind at s =
    { s
        | shock = 2
        , impacts = s.impacts ++ [ { id = s.weaponSequence, x = at.x, y = at.y, altitude = negate at.depth, time = s.time, kind = kind } ]
        , weaponSequence = s.weaponSequence + 1
    }
        |> emitSound Acoustics.Detonation
            at
            (if kind == "cookoff" then
                2

             else
                0.8
            )


{-| A sound at a point, appended to the patrol's acoustic history.
-}
emitSound : Acoustics.Kind -> Point -> Float -> World w -> World w
emitSound kind at power start =
    let
        s : World w
        s =
            if isNaN power || isInfinite power || power < 0 then
                InvalidNumber.report "emitSound power" power start

            else
                start

        sound : Sound
        sound =
            { id = s.soundSequence
            , time = s.time
            , kind = kind
            , x = at.x
            , y = at.y
            , power = Just power
            , heard = False
            , depth = Just at.depth
            , altitude = Nothing
            , heardAt = Nothing
            , perceived = Nothing
            , vessel = Nothing
            , friendly = Nothing
            , own = Nothing
            , touched = Nothing
            , missed = Nothing
            , warning = Nothing
            , ownHit = Nothing
            , droneHit = Nothing
            , echo = Nothing
            }
    in
    { s | acoustics = s.acoustics ++ [ sound ], soundSequence = s.soundSequence + 1 }
