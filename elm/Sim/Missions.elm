module Sim.Missions exposing (Battling, Judged, Randomizing, objectiveComplete, randomizePatrol, updateFleetBattle)

{-| A patrol's mission at sea: the fleet action's shots and arrivals as the
patrol hears and records them, whether the objective is met, and the seeded
layout a new patrol starts from.
-}

import PatrolCriteria
import PatrolMission exposing (Mission(..))
import Sim.Acoustics as Acoustics
import Sim.Carrier as Carrier
import Sim.Coast exposing (Coastline)
import Sim.ConvoyTracking as ConvoyTracking
import Sim.ConvoyWatch as ConvoyWatch
import Sim.FleetAction as FleetAction
import Sim.FleetTheater as FleetTheater exposing (Battle)
import Sim.FleetVolleys exposing (Volley)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.MessWatch as MessWatch
import Sim.MissionObjective as MissionObjective
import Sim.Operation as Operation exposing (Operation)
import Sim.OperationWork as OperationWork
import Sim.PatrolPhase exposing (Phase(..))
import Sim.PatrolSearch exposing (SearchArea)
import Sim.ReconPhotos as ReconPhotos
import Sim.ReplayEvents as Replay
import Sim.Ship as Ship exposing (Ship)
import Sim.Site exposing (Site)
import Sim.Sound exposing (Sound)
import Sim.Status exposing (Status)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems exposing (Impact)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


{-| The patrol fields the fleet action's events read and write.
-}
type alias Battling s p =
    { s
        | x : Float
        , y : Float
        , time : Float
        , weaponSequence : Int
        , ships : List Ship
        , battle : Maybe Battle
        , patrol : { p | seed : Float }
        , crewQuietUntil : Float
        , soundSequence : Int
        , acoustics : List Sound
        , invalid : List InvalidNumber
        , impacts : List Impact
        , replay : List Replay.Marked
    }


type alias Heard t =
    { t
        | x : Float
        , y : Float
        , crewQuietUntil : Float
        , soundSequence : Int
        , acoustics : List Sound
        , invalid : List InvalidNumber
        , impacts : List Impact
        , replay : List Replay.Marked
    }


{-| A shot fired is heard (a launch close by quiets the crew's mess); an
arrival is heard, marked on the chart as a torpedo, a splash or a hit, and a
torpedo hit enters the replay.
-}
onBattleEvent : Ship -> Volley -> Bool -> FleetAction.Theater (Heard t) p -> FleetAction.Theater (Heard t) p
onBattleEvent ship v fired s0 =
    let
        p : { x : Float, y : Float, altitude : Float }
        p =
            if fired then
                v.from

            else
                v.to

        launched : FleetAction.Theater (Heard t) p
        launched =
            if fired && v.underwater then
                MessWatch.recordLocalLaunch p s0 |> Systems.launchNoise p (Just (negate p.altitude)) False

            else
                s0

        heard : FleetAction.Theater (Heard t) p
        heard =
            Systems.emit
                { kind =
                    if not fired then
                        Acoustics.Detonation

                    else if v.underwater then
                        Acoustics.Seeker

                    else
                        Acoustics.Gunfire
                , x = p.x
                , y = p.y
                , depth = Just (M.max 0 (negate p.altitude))
                , altitude = Just p.altitude
                , power =
                    if fired then
                        0.55

                    else
                        0.9
                }
                launched
    in
    if fired then
        heard

    else
        let
            kind : String
            kind =
                if M.truthy v.damage && v.underwater then
                    "torpedo"

                else if not (M.truthy v.damage) && -2 <= p.altitude then
                    "splash"

                else
                    "hit"

            marked : FleetAction.Theater (Heard t) p
            marked =
                { heard | impacts = heard.impacts ++ [ { id = heard.weaponSequence, x = p.x, y = p.y, altitude = p.altitude, time = heard.time, kind = kind } ], weaponSequence = heard.weaponSequence + 1 }
        in
        if v.underwater && M.truthy v.damage then
            Replay.mark { kind = Replay.Torpedo, point = { x = p.x, y = p.y, depth = negate p.altitude }, heading = Nothing, target = Just ship.id, shot = Just (toFloat v.id), enemy = Just True } marked

        else
            marked


{-| One moment of the fleet action, heard and recorded by the patrol.
-}
updateFleetBattle : Battling s p -> Battling s p
updateFleetBattle s =
    case s.battle of
        Just battle ->
            let
                after : FleetAction.Theater (Heard {}) p
                after =
                    FleetAction.advanceFleetAction onBattleEvent
                        { x = s.x
                        , y = s.y
                        , time = s.time
                        , weaponSequence = s.weaponSequence
                        , ships = s.ships
                        , battle = battle
                        , patrol = s.patrol
                        , crewQuietUntil = s.crewQuietUntil
                        , soundSequence = s.soundSequence
                        , acoustics = s.acoustics
                        , invalid = s.invalid
                        , impacts = s.impacts
                        , replay = s.replay
                        }
            in
            { s
                | weaponSequence = after.weaponSequence
                , ships = after.ships
                , battle = Just after.battle
                , crewQuietUntil = after.crewQuietUntil
                , soundSequence = after.soundSequence
                , acoustics = after.acoustics
                , invalid = after.invalid
                , impacts = after.impacts
                , replay = after.replay
            }

        Nothing ->
            s


{-| The patrol fields the objective reads, with those a rescue or survey works on.
-}
type alias Judged s q e y ph =
    { s
        | x : Float
        , y : Float
        , depth : Float
        , speed : Float
        , time : Float
        , mission : Mission
        , home : { x : Float, y : Float }
        , patrol : { q | seed : Float, photoGoal : Float, trackGoal : Float }
        , photos : List ph
        , ships : List Ship
        , trackTime : Float
        , site : Maybe Site
        , operation : Maybe Operation
        , search : Maybe SearchArea
        , environment : { e | seed : Float }
        , chart : Maybe Coastline
        , systems : { y | sonar : Float }
        , events : List LogEntry
    }


{-| Whether the objective is met; a rescue or survey works as it is judged.
-}
objectiveComplete : Float -> Judged s q e y ph -> ( Bool, Judged s q e y ph )
objectiveComplete dt =
    MissionObjective.evaluateObjective dt { rescue = OperationWork.updateRescue, survey = OperationWork.updateSurvey }


{-| The patrol fields a new patrol's layout sets.
-}
type alias Randomizing s d a =
    Battling
        { s
            | depth : Float
            , targetDepth : Float
            , heading : Float
            , targetHeading : Float
            , speed : Float
            , targetSpeed : Float
            , scope : Bool
            , status : Status
            , mission : Mission
            , torps : Int
            , route : Maybe { x : Float, y : Float, radius : Maybe Float }
            , home : { x : Float, y : Float }
            , departure : Maybe { x : Float, y : Float }
            , phase : Phase
            , chart : Maybe Coastline
            , difficulty : Maybe { d | longPatrol : Maybe Bool }
            , site : Maybe Site
            , operation : Maybe Operation
            , convoy : Maybe ConvoyWatch.Convoy
            , airSupport : { a | base : { x : Float, y : Float } }
            , events : List LogEntry
        }
        { startingTorpedoes : Int, photoGoal : Float, trackGoal : Float, variant : Int }


{-| The first ship with the id, changed; the rest as they were.
-}
updateFirst : String -> (Ship -> Ship) -> List Ship -> List Ship
updateFirst id change ships =
    case ships of
        [] ->
            []

        v :: rest ->
            if v.id == id then
                change v :: rest

            else
                v :: updateFirst id change rest


{-| A new patrol's seeded layout: where the boat starts, the extraction point
and the convoy, the goals, the recon convoy's extra merchant, any rescue or
survey site, and each mission's own cast and briefing.
-}
randomizePatrol : Float -> Randomizing s d a -> Randomizing s d a
randomizePatrol seed s0 =
    let
        h : Float -> Float
        h =
            hash01 seed

        heading : Float
        heading =
            220 + h 21 * 65

        start : { x : Float, y : Float }
        start =
            { x = (h 22 - 0.5) * 500, y = (h 23 - 0.5) * 500 }

        speed : Float
        speed =
            3.5 + h 32 * 3

        convoy : { x : Float, y : Float }
        convoy =
            if s0.mission == Convoy then
                let
                    course : Float
                    course =
                        Mechanics.rad (-15 + h 84 * 85)

                    range : Float
                    range =
                        2700 + h 85 * 1200
                in
                { x = start.x + sin course * range, y = start.y + cos course * range }

            else
                { x = start.x + 1050 + h 30 * 650, y = start.y + 1800 + h 31 * 650 }

        militaryName : String
        militaryName =
            case floor (h 80 * 5) of
                0 ->
                    "Cobalt"

                1 ->
                    "Borealis"

                2 ->
                    "Vesper"

                3 ->
                    "Ironwood"

                _ ->
                    "Kittiwake"

        place : Int -> Ship -> Ship
        place i v =
            let
                n : Float
                n =
                    toFloat i

                ( dx, dy ) =
                    if i == 3 then
                        ( -2200, -900 )

                    else
                        ( 0, 0 )
            in
            { v
                | x = convoy.x + dx + (h (40 + n) - 0.5) * 800
                , y = convoy.y + dy + (h (50 + n) - 0.5) * 700
                , heading = heading + (h (60 + n) - 0.5) * 12
                , speed =
                    if v.kind == Surface Fishing then
                        2 + h (70 + n) * 2

                    else if v.kind == Surface Escort then
                        speed + 2

                    else
                        speed
                , flood = Just 0
                , disabled = Just False
                , sinkDepth = Just 0
                , name =
                    if v.id == "cobalt" then
                        militaryName

                    else
                        v.name
            }

        -- Recon always has enough distinct silhouettes, without reusing a photograph.
        alder : Ship
        alder =
            Ship.fresh
                { id = "alder"
                , name =
                    case floor (h 81 * 3) of
                        0 ->
                            "Alder"

                        1 ->
                            "Seaforth"

                        _ ->
                            "Larch"
                , kind = Surface Merchant
                , x = convoy.x + 400 + h 82 * 500
                , y = convoy.y + 450 + h 83 * 300
                , heading = heading
                , speed = speed
                }
                |> (\v -> { v | military = Just False, flood = Just 0, disabled = Just False, sinkDepth = Just 0 })

        laidOut : Randomizing s d a
        laidOut =
            Operation.setupOperation seed
                { s0
                    | patrol =
                        { seed = seed
                        , startingTorpedoes = s0.torps
                        , photoGoal = toFloat (ReconPhotos.photoGoal (h 24) PatrolCriteria.merchantPhotos)
                        , trackGoal = toFloat (ConvoyTracking.trackingGoal (h 25) PatrolCriteria.convoyTracking)
                        , variant = 1 + floor (h 26 * 999)
                        }
                    , x = start.x
                    , y = start.y
                    , heading = 20 + h 27 * 35
                    , targetHeading = 20 + h 27 * 35
                    , home = { x = start.x - 1100 - h 28 * 650, y = start.y - 1000 - h 29 * 650 }
                    , ships = List.indexedMap place s0.ships ++ [ alder ]
                }

        s : Randomizing s d a
        s =
            { laidOut | events = List.filter (\e -> not (String.startsWith "Helm steady." e.text)) laidOut.events }

        longPatrol : Bool
        longPatrol =
            s.difficulty |> Maybe.andThen .longPatrol |> Maybe.withDefault False

        patrolNumber : String
        patrolNumber =
            "Patrol " ++ String.fromFloat seed ++ ". "
    in
    case s.mission of
        Henhouse ->
            ConvoyWatch.setupHenhouse s

        Tiebreaker ->
            let
                theater : { ships : List Ship, battle : Battle }
                theater =
                    FleetTheater.fleetTheater start seed

                arrayed : Randomizing s d a
                arrayed =
                    { s | ships = theater.ships, battle = Just theater.battle, home = { x = start.x - 450, y = start.y - 550 } }
            in
            (if longPatrol then
                arrayed

             else
                updateFleetBattle arrayed
            )
                |> Mechanics.log "Lark, Marlin and Calliope fly blue forked pennants. The orange pennants are hostile. Nacre is our submarine." Info
                |> Mechanics.log
                    (if longPatrol then
                        "Both fleets are approaching the sector. Friendly patrol areas are marked on the chart."

                     else
                        "Fleet action in progress. Chart rings are friendly patrol areas from the briefing. No current positions confirmed."
                    )
                    Info

        BigKahuna ->
            let
                air : { a | base : { x : Float, y : Float } }
                air =
                    s.airSupport
            in
            Mechanics.log "Fleet carrier Solstice and her escort were last reported to the northeast. No alarm has been raised."
                Info
                { s | ships = Carrier.carrierGroup convoy.x convoy.y heading speed (h 981 < 0.5) (h 982), airSupport = { air | base = convoy } }

        SubHunt ->
            let
                hunters : List Ship
                hunters =
                    List.filter (\v -> v.kind == Surface Fishing || v.id == "echo") s.ships
                        |> updateFirst "echo" (\v -> { v | depth = Just (55 + h 86 * 40), heading = 188 + h 88 * 60 })

                second : List Ship
                second =
                    case ( List.filter (\v -> v.id == "echo") hunters |> List.head, h 89 < 0.36 ) of
                        ( Just primary, True ) ->
                            [ { primary | id = "echo-two", x = primary.x + 700 + h 90 * 1200, y = primary.y + 400 + h 91 * 1100, depth = Just (45 + h 92 * 45), heading = 150 + h 93 * 105 } ]

                        _ ->
                            []
            in
            Mechanics.log (patrolNumber ++ "An enemy submarine was reported in this sector. Engage or withdraw. Surface at extraction to survive.")
                Info
                { s | ships = hunters ++ second, phase = Extract }

        Transit ->
            let
                course : Float
                course =
                    Mechanics.rad (30 + h 920 * 35)

                east : Float
                east =
                    sin course

                north : Float
                north =
                    cos course

                length : Float
                length =
                    2700 + h 921 * 550

                gate : { x : Float, y : Float }
                gate =
                    { x = start.x + east * length, y = start.y + north * length }

                toGate : Float
                toGate =
                    Mechanics.bearing start gate

                patrolled : Int -> Ship -> Ship
                patrolled i v =
                    let
                        n : Float
                        n =
                            toFloat i

                        along : Float
                        along =
                            length * (0.37 + h (930 + n) * 0.36)

                        across : Float
                        across =
                            (h (940 + n) - 0.5) * 1100
                    in
                    { v
                        | x = start.x + east * along + north * across
                        , y = start.y + north * along - east * across
                        , nextSweep =
                            if v.kind == Surface Escort || v.kind == Submarine then
                                Just (15 + h (960 + n) * 35)

                            else
                                v.nextSweep
                    }
            in
            Mechanics.log "Gate A passed. Cross the convoy patrol and reach Gate B. No attack or surfacing required."
                Info
                { s | departure = Just start, home = gate, heading = toGate, targetHeading = toGate, ships = List.indexedMap patrolled s.ships }

        Convoy ->
            let
                armed : List Ship
                armed =
                    List.map
                        (\v ->
                            if List.member v.id MissionObjective.convoyTransportIds then
                                { v | military = Just True }

                            else
                                v
                        )
                        s.ships

                hunted : Randomizing s d a
                hunted =
                    { s
                        | ships =
                            if 0.4 <= h 87 then
                                List.filter (\v -> v.id /= "echo") armed

                            else
                                armed
                    }
            in
            if longPatrol then
                hunted

            else
                let
                    lastBearing : Int
                    lastBearing =
                        modBy 360 (round (Mechanics.bearing start convoy / 45) * 45)
                in
                Mechanics.log (patrolNumber ++ "Last report put the convoy around bearing " ++ String.padLeft 3 '0' (String.fromInt lastBearing) ++ "°. Listen for the transports and escort.") Info hunted

        Recon ->
            briefed patrolNumber s

        Intercept ->
            briefed patrolNumber s

        Shadow ->
            briefed patrolNumber s

        UnderseaRescue ->
            briefed patrolNumber s

        SurfaceRescue ->
            briefed patrolNumber s

        Survey ->
            briefed patrolNumber s


{-| The briefing line for the missions with no setup of their own: the
operation's site, the tracking or photograph goal, or the target's name.
-}
briefed : String -> Randomizing s d a -> Randomizing s d a
briefed patrolNumber s =
    let
        detail : String
        detail =
            case ( s.operation, s.site ) of
                ( Just _, Just site ) ->
                    site.name

                _ ->
                    if s.mission == Shadow then
                        String.fromFloat s.patrol.trackGoal ++ " seconds of passive tracking"

                    else if s.mission == Recon then
                        String.fromFloat s.patrol.photoGoal ++ " merchant photographs required"

                    else
                        (List.head s.ships |> Maybe.map .name |> Maybe.withDefault "") ++ " is the objective"
    in
    Mechanics.log (patrolNumber ++ detail ++ ".") Info s
