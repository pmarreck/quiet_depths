module Sim.PatrolShips exposing (Watch, sailShips)

{-| Each ship afloat in turn, as the tick works through them: the boat may
hear, see or glimpse her lights; an opponent hunts the boat on her track or
on a clue, sweeps for her, signals and attacks; then she moves, in formation
during a fleet action's approach. Each ship is written back before the next,
as the TypeScript changes ships in place.
-}

import PatrolMission exposing (Mission(..))
import Sim.BoatSensors as BoatSensors
import Sim.ColdWatch as ColdWatch
import Sim.Combat as Combat
import Sim.Contact exposing (Sighting(..))
import Sim.ContactReports as ContactReports
import Sim.Environment exposing (Environment)
import Sim.Equipment as Equipment
import Sim.FleetTheater as FleetTheater
import Sim.HostileTracks as HostileTracks
import Sim.HunterReports exposing (Track)
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.Ordnance exposing (BlastKind(..))
import Sim.PatrolContacts as PatrolContacts
import Sim.PatrolHearing as PatrolHearing
import Sim.Ship exposing (Ship)
import Sim.SonarTransmitters exposing (Instrument(..), Profile)
import Sim.Suspicion as Suspicion exposing (Clue)
import Sim.Systems
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))
import Sim.World exposing (World)


{-| What the tick knows of this moment: the step, the weather, where the
player looks and through what, whether a long patrol's approach is under way
and how far the fleets close in it, and any imaging beat with the profiles
transmitting.
-}
type alias Watch =
    { dt : Float
    , env : Environment
    , look : Maybe Float
    , observation : Maybe String
    , approaching : Bool
    , formationTravel : Float
    , newTriad : Bool
    , beat : Float
    , scribbler : Maybe Profile
    , painter : Maybe Profile
    }


{-| The patrol as the suspicion rules read it.
-}
suspicion : World -> Suspicion.Patrol {} { startingTorpedoes : Int, photoGoal : Float, trackGoal : Float, variant : Int } {}
suspicion s =
    let
        setting : (Sim.Systems.Difficulty -> Maybe Float) -> Float
        setting field =
            s.difficulty |> Maybe.andThen field |> Maybe.withDefault (0 / 0)
    in
    { x = s.x
    , y = s.y
    , time = s.time
    , heading = s.heading
    , depth = s.depth
    , patrol = s.patrol
    , difficulty = { pingDetection = setting .pingDetection, detection = setting .detection, pursuit = setting .pursuit }
    }


put : Int -> Ship -> World -> World
put i ship s =
    { s
        | ships =
            List.indexedMap
                (\j old ->
                    if j == i then
                        ship

                    else
                        old
                )
                s.ships
    }


{-| Every ship in turn, returning the greatest alert among those tracking
the boat, holding a clue or freshly reporting her.
-}
sailShips : Watch -> World -> ( Float, World )
sailShips watch s =
    visit watch 0 0 s


visit : Watch -> Int -> Float -> World -> ( Float, World )
visit watch i danger s =
    case List.drop i s.ships |> List.head of
        Just ship ->
            if ship.hull <= 0 then
                visit watch (i + 1) danger s

            else
                let
                    ( raised, after ) =
                        sail watch i danger ship s
                in
                visit watch (i + 1) raised after

        Nothing ->
            ( danger, s )


{-| What the boat makes of a ship: heard on a new three-second beat,
seen from the tower or scope, or her lights glimpsed in fog.
-}
sight : Watch -> Ship -> World -> World
sight watch ship s0 =
    let
        sonar : Float
        sonar =
            Equipment.operatingFraction s0.systems.sonar

        d : Float
        d =
            Mechanics.distance s0 ship

        reach : Float
        reach =
            (if ship.kind == Surface Fishing then
                2300

             else
                5600
            )
                * (1 - watch.env.storm * 0.25 * M.exp (negate s0.depth / 80))
                * sonar

        report : Sighting -> World -> World
        report method s =
            ContactReports.contact (ContactReports.sighted ship) method s |> Tuple.second

        s1 : World
        s1 =
            if 0 < sonar && (s0.silent || s0.speed < 9) && d < reach && watch.newTriad then
                report Passive s0

            else
                s0

        topside : Bool
        topside =
            (watch.observation == Just "tower" || watch.observation == Just "gun") && s1.depth <= 1

        look : Float
        look =
            Maybe.withDefault (M.remainder (s1.heading + s1.scopeAngle) 360) watch.look

        within : Float -> Bool
        within arc =
            M.abs (Mechanics.delta (Mechanics.bearing s1 ship) look) < arc

        seen : Bool
        seen =
            if topside then
                ship.kind /= Submarine && d < watch.env.opticalRange && within 25

            else
                PatrolContacts.isVisible watch.env (Just look) s1 ship
    in
    if seen then
        report Visual s1

    else if
        0.16
            < watch.env.fog
            && ship.kind
            /= Submarine
            && ship.lights
            /= Just False
            && ship.blackout
            /= Just True
            && d
            < watch.env.lightRange
            && (topside || watch.observation == Just "scope" && s1.scope && s1.depth <= 15 && 0 < Equipment.operatingFraction s1.systems.periscope && not (BoatSensors.scopeWashed s1 watch.env))
            && within 19
            && watch.newTriad
    then
        report Lights s1

    else
        s1


{-| An opponent's hunt: imaging clues on a beat, its track on the boat, a
clue from a fresh report, and an escort's or submarine's search, signal and
attack.
-}
hunt : Watch -> Int -> Float -> Ship -> World -> ( Float, Ship, World )
hunt watch i danger ship0 s0 =
    let
        imaged : Ship
        imaged =
            if M.truthy watch.beat then
                [ ( Scribbler, watch.scribbler ), ( Painter, watch.painter ) ]
                    |> List.foldl
                        (\( mode, profile ) v ->
                            case profile of
                                Just p ->
                                    Suspicion.imagerClue (suspicion s0) mode p watch.beat v

                                Nothing ->
                                    v
                        )
                        ship0

            else
                ship0

        ( tracked, track ) =
            HostileTracks.updateHostileTrack { subVisualRange = watch.env.subVisualRange, storm = watch.env.storm } watch.dt s0 imaged

        fresh : Ship -> Bool
        fresh v =
            case v.report of
                Just r ->
                    s0.time - r.time < 2

                Nothing ->
                    False

        clued : Ship
        clued =
            case ( track, tracked.report ) of
                ( Nothing, Just r ) ->
                    if 12 <= tracked.alert && fresh tracked && (tracked.clue |> Maybe.map .time |> Maybe.withDefault -1) < r.time then
                        Suspicion.leaveClue 0 { x = r.x, y = r.y, time = r.time } tracked

                    else
                        tracked

                _ ->
                    tracked

        ( clue, held ) =
            Suspicion.activeClue (suspicion s0) clued

        raised : Float
        raised =
            if track /= Nothing || clue /= Nothing || fresh held then
                M.max danger held.alert

            else
                danger
    in
    if held.kind == Surface Escort || held.kind == Submarine then
        let
            ( reported, s1 ) =
                HostileTracks.reportHunterState held track s0

            ( searched, s2 ) =
                inquire watch i track clue reported s1

            signaled : Ship
            signaled =
                if track /= Nothing && searched.incidental /= Just True && searched.parley == Nothing && 80 <= searched.alert then
                    ColdWatch.playerSignal True (Maybe.map (\r -> { x = r.x, y = r.y }) searched.report) s2 searched

                else
                    searched

            ( attacked, s3 ) =
                attack watch i track signaled s2
        in
        ( raised, attacked, s3 )

    else
        ( raised, held, s0 )


{-| With no track but a clue due a search, the hunter sweeps at once.
-}
inquire : Watch -> Int -> Maybe Track -> Maybe Clue -> Ship -> World -> ( Ship, World )
inquire watch i track clue ship s =
    case ( track, clue ) of
        ( Nothing, Just c ) ->
            let
                ( due, searching ) =
                    Suspicion.searchClue (suspicion s) watch.dt (Just c) ship
            in
            if due then
                PatrolHearing.patrolSweep True searching (put i searching s)

            else
                ( searching, s )

        _ ->
            ( ship, s )


{-| A hunter on the boat's track that may attack her closes and attacks.
-}
attack : Watch -> Int -> Maybe Track -> Ship -> World -> ( Ship, World )
attack watch i track ship s =
    case track of
        Just t ->
            if ColdWatch.canAttackPlayer s ship then
                HostileTracks.pursueAndAttack watch.dt
                    { dropCharge = \c hunted -> PatrolContacts.dropDepthCharge { x = c.x, y = c.y, depth = c.depth, delay = c.delay, kind = Charge } hunted |> Tuple.second
                    , launchTorpedo = \launcher shot hunted -> Combat.launchHostileTorpedo launcher shot hunted
                    }
                    t
                    ship
                    (put i ship s)

            else
                ( ship, s )

        Nothing ->
            ( ship, s )


sail : Watch -> Int -> Float -> Ship -> World -> ( Float, World )
sail watch i danger ship0 s0 =
    let
        s1 : World
        s1 =
            sight watch ship0 s0

        turned : Ship
        turned =
            if watch.approaching && s1.battle == Nothing && ship0.incidental /= Just True && ship0.report == Nothing then
                { ship0 | heading = M.remainder (ship0.heading + watch.dt * 0.36) 360 }

            else
                ship0

        ( swept, s2 ) =
            if s1.mission == Transit then
                PatrolHearing.patrolSweep False turned (put i turned s1)

            else
                ( turned, s1 )

        ( raised, hunted, s3 ) =
            if FleetTheater.isOpponent swept && swept.disabled /= Just True then
                hunt watch i danger swept s2

            else
                ( danger, swept, s2 )

        stopped : Ship
        stopped =
            if hunted.disabled == Just True then
                { hunted | speed = 0 }

            else
                hunted

        travel : Float
        travel =
            if watch.approaching && s3.battle /= Nothing && stopped.incidental /= Just True && stopped.report == Nothing && stopped.disabled /= Just True then
                watch.formationTravel

            else
                stopped.speed * 0.514444 * watch.dt
    in
    ( raised
    , put i { stopped | x = stopped.x + sin (Mechanics.rad stopped.heading) * travel, y = stopped.y + cos (Mechanics.rad stopped.heading) * travel } s3
    )
