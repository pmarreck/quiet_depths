module Sim.PatrolHearing exposing (advanceTraffic, hear, patrolSweep)

{-| What the patrol hears and what hears it: an escort's search sweep, which
may cross the hull and fix the boat; each sound as it reaches the boat
(launches and splashes by bearing, a torpedo's seeker, a hit, a sweep, a
wreck breaking up); and the coastal traffic's signals, from arrivals and
challenge pings to the shots answering the boat.
-}

import Sim.Acoustics as Acoustics exposing (Kind(..))
import Sim.Boat as Boat
import Sim.ColdWatch as ColdWatch
import Sim.Contact exposing (Contact, Sighting(..))
import Sim.ContactReports as ContactReports
import Sim.Debrief as Debrief
import Sim.Equipment as Equipment
import Sim.FleetVolleys exposing (Volley)
import Sim.HunterReports as HunterReports
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.MessWatch as MessWatch
import Sim.PatrolReports as PatrolReports
import Sim.ReplayEvents as Replay
import Sim.SeabedRest as SeabedRest
import Sim.Ship exposing (Ship)
import Sim.Sound exposing (Sound)
import Sim.Stands as Stands
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems exposing (Difficulty)
import Sim.TorpedoWatch as TorpedoWatch
import Sim.World exposing (World)


{-| A difficulty setting; a patrol always has every one, and a missing one
reads as a number no roll can beat.
-}
setting : (Difficulty -> Maybe Float) -> World -> Float
setting field s =
    s.difficulty |> Maybe.andThen field |> Maybe.withDefault (0 / 0)


{-| A patrol escort's sweep when it falls due, or at once when it inquires
after a clue: the boat may hear it, and it may cross the hull, which tells
the escort where she is.
-}
patrolSweep : Bool -> Ship -> World -> ( Ship, World )
patrolSweep inquiry ship s =
    let
        waiting : Bool
        waiting =
            case ship.nextSweep of
                Just next ->
                    s.time < next

                Nothing ->
                    True
    in
    if ship.disabled == Just True || not inquiry && waiting then
        ( ship, s )

    else
        let
            ( scheduled, rng1 ) =
                if inquiry then
                    ( ship, s.rng )

                else
                    let
                        ( roll, rng ) =
                            Mechanics.rand s.rng
                    in
                    ( { ship | nextSweep = Just (s.time + 28 + roll * 45) }, rng )

            nearby : Float
            nearby =
                M.clamp 0 1 (1 - Mechanics.distance scheduled s / 4500)

            ( heardRoll, rng2 ) =
                Mechanics.rand rng1

            ( touchRoll, rng3 ) =
                Mechanics.rand rng2

            heard : Bool
            heard =
                heardRoll < setting .pingDetection s * nearby * Equipment.operatingFraction s.systems.sonar

            touched : Bool
            touched =
                touchRoll < 0.25 * nearby * setting .detection s * SeabedRest.sweepClutter s.bottomed (M.max (M.abs s.speed) (M.abs s.targetSpeed))

            rolled : World
            rolled =
                { s | rng = rng3 }

            sounded : World
            sounded =
                if heard then
                    Systems.emitWith (\sound -> { sound | vessel = Just scheduled.id, touched = Just touched })
                        { kind = Sweep, x = scheduled.x, y = scheduled.y, depth = Just (Maybe.withDefault 0 scheduled.depth), altitude = Nothing, power = 0.85 }
                        rolled

                else
                    rolled
        in
        if touched then
            ( { scheduled | report = Just (HunterReports.playerReport s |> (\r -> { r | reason = Just "a patrol sweep" })), alert = M.max 55 scheduled.alert }, sounded )

        else
            ( scheduled, sounded )


{-| A three-figure bearing, as the reports read it.
-}
threeFigures : Int -> String
threeFigures n =
    String.padLeft 3 '0' (String.fromInt n) ++ "°"


replaceContact : Contact -> World -> World
replaceContact c s =
    { s
        | contacts =
            List.map
                (\other ->
                    if other.id == c.id then
                        c

                    else
                        other
                )
                s.contacts
    }


markMissed : Sound -> World -> World
markMissed source s =
    { s
        | acoustics =
            List.map
                (\sound ->
                    if sound.id == source.id then
                        { sound | missed = Just True }

                    else
                        sound
                )
                s.acoustics
    }


{-| Another vessel's launch or splash, heard as a bearing with odds falling
off with distance. A miss marks the sound and ends its receipt.
-}
launchOrSplash : Sound -> Float -> World -> Maybe World
launchOrSplash source heardDistance s =
    let
        splash : Bool
        splash =
            source.kind == Splashdown

        chance : Float
        chance =
            (if splash then
                0.85

             else
                0.97
            )
                * Equipment.operatingFraction s.systems.sonar
                / (1
                    + (heardDistance
                        / (if splash then
                            2200

                           else
                            3500
                          )
                      )
                    ^ 2
                  )
    in
    if chance <= hash01 s.patrol.seed (42000 + toFloat source.id) then
        Nothing

    else
        let
            direction : Int
            direction =
                modBy 360 (round (Mechanics.bearing s source + (hash01 s.patrol.seed (43000 + toFloat source.id) - 0.5) * 9) + 360)

            what : String
            what =
                if splash then
                    "Possible depth-charge splash"

                else
                    "Possible torpedo launch"

            kept : List { x : Float, y : Float, bearing : Float, time : Float, kind : String }
            kept =
                s.soundBearings ++ [ { x = s.x, y = s.y, bearing = toFloat direction, time = s.time, kind = Acoustics.kindName source.kind } ]
        in
        Just
            ({ s | soundBearings = List.drop (List.length kept - 16) kept }
                |> PatrolReports.report (Acoustics.kindName source.kind ++ "-" ++ String.fromInt source.id) (what ++ " heard · bearing " ++ threeFigures direction)
            )


{-| A search sweep heard: a bearing to the emitter with no range or
identity, and the chart square it searched when two sweeps from one
emitter come within two minutes.
-}
sweepHeard : Sound -> World -> World
sweepHeard source s =
    let
        ( c, reported ) =
            ContactReports.contact { id = Maybe.withDefault "" source.vessel, x = source.x, y = source.y, kind = Nothing, depth = Nothing, name = Nothing, military = Nothing, side = Nothing } Passive s

        size : Float
        size =
            900

        square : Float -> Float
        square v =
            (toFloat (floor (v / size)) + 0.5) * size

        swept : Contact
        swept =
            case c.lastSweep of
                Just last ->
                    if reported.time - last < 120 then
                        { c | sweepArea = Just { x = square source.x, y = square source.y, size = size, time = reported.time } }

                    else
                        c

                Nothing ->
                    c

        text : String
        text =
            if source.warning == Just True then
                "Challenge ping heard · bearing "

            else if source.friendly == Just True then
                "Surface sweep heard · bearing "

            else if source.touched == Just True then
                "Search ping crossed our hull · bearing "

            else
                "Search ping heard · bearing "
    in
    replaceContact { swept | lastSweep = Just reported.time } reported
        |> PatrolReports.report "sweep" (text ++ threeFigures (modBy 360 (round c.bearing)))


{-| A sound reaching the boat loud enough to register.
-}
receive : Sound -> World -> World
receive source s0 =
    let
        heardDistance : Float
        heardDistance =
            source.perceived |> Maybe.map .distance |> Maybe.withDefault (0 / 0)

        sonar : World -> Float
        sonar s =
            Equipment.operatingFraction s.systems.sonar

        bearingHeard : Maybe World
        bearingHeard =
            if (source.kind == Launch || source.kind == Splashdown) && source.own /= Just True then
                launchOrSplash source heardDistance s0

            else
                Just s0
    in
    case bearingHeard of
        Nothing ->
            markMissed source s0

        Just s1 ->
            let
                s2 : World
                s2 =
                    case ( source.kind, source.echo ) of
                        ( Seeker, Just e ) ->
                            if M.truthy (sonar s1) && heardDistance < 6000 * sonar s1 then
                                { s1 | torpedoTracks = TorpedoWatch.observe s1 { id = round e.id, time = e.time, x = e.x, y = e.y, depth = e.depth, speed = e.speed, inboundRun = e.inboundRun } False s1.torpedoTracks }

                            else
                                s1

                        _ ->
                            s1

                s3 : World
                s3 =
                    if source.ownHit == Just True then
                        PatrolReports.report "impact" "Explosion heard. Possible torpedo hit." s2

                    else
                        s2

                s4 : World
                s4 =
                    if source.kind == Sweep && 0 < sonar s3 then
                        sweepHeard source s3

                    else
                        s3
            in
            if source.kind == Collapse || source.kind == Settling then
                let
                    s5 : World
                    s5 =
                        if source.kind == Collapse then
                            PatrolReports.report "collapse" "Possible implosion heard" s4

                        else
                            PatrolReports.report "settling" "Heavy breakup heard. Probable wreck." s4
                in
                if 0 < sonar s5 then
                    { s5 | ships = PatrolReports.hearWreck s5 { id = toFloat source.id, vessel = source.vessel, x = source.x, y = source.y } s5.ships }

                else
                    s5

            else
                s4


{-| The fields the coastal traffic and its signals work on.
-}
type alias Listening =
    Stands.Watching
        { systems : Boat.Systems
        , debrief : List Debrief.Entry
        , soundSequence : Int
        , acoustics : List Sound
        , invalid : List InvalidNumber
        , impacts : List Systems.Impact
        , replay : List Replay.Marked
        , crewQuietUntil : Float
        }
        { startingTorpedoes : Int, photoGoal : Float, trackGoal : Float, variant : Int }


{-| A shot answering the boat lands: a warning shot underwater makes no
mark, any other leaves an impact, and a damaging torpedo enters the replay.
-}
answer : Volley -> Listening -> Listening
answer volley s =
    if volley.warning == Just True && volley.underwater then
        s

    else
        let
            p : { x : Float, y : Float, altitude : Float }
            p =
                volley.to

            depth : Float
            depth =
                M.max 0 (negate p.altitude)

            sounded : Listening
            sounded =
                if volley.warning == Just True then
                    s

                else
                    Systems.emit { kind = Detonation, x = p.x, y = p.y, depth = Just depth, altitude = Nothing, power = 0.8 } s

            kind : String
            kind =
                if M.truthy volley.damage then
                    if volley.underwater then
                        "torpedo"

                    else
                        "hit"

                else
                    "splash"

            marked : Listening
            marked =
                { sounded | impacts = sounded.impacts ++ [ { id = sounded.weaponSequence, x = p.x, y = p.y, altitude = p.altitude, time = sounded.time, kind = kind } ], weaponSequence = sounded.weaponSequence + 1 }
        in
        if M.truthy volley.damage && volley.underwater then
            Replay.mark { kind = Replay.Torpedo, point = { x = p.x, y = p.y, depth = depth }, heading = Nothing, target = Just volley.target, shot = Just (toFloat volley.id), enemy = Just True } marked

        else
            marked


{-| The traffic's signals as the patrol records and hears them.
-}
trafficSignal : Stands.Action -> Ship -> Maybe Volley -> Listening -> Listening
trafficSignal action v shot s =
    let
        fired : (Volley -> Listening) -> Listening
        fired with =
            Maybe.map with shot |> Maybe.withDefault s
    in
    case action of
        Stands.Arrival ->
            Systems.addDebrief (v.name ++ " entered the area.") s

        Stands.Withdraw ->
            Systems.addDebrief (v.name ++ " broke off and turned away.") s

        Stands.Ping ->
            if Mechanics.distance s v < 5600 * Equipment.operatingFraction s.systems.sonar then
                Systems.emitWith (\sound -> { sound | vessel = Just v.id, warning = Just True }) { kind = Sweep, x = v.x, y = v.y, depth = Just (Maybe.withDefault 0 v.depth), altitude = Nothing, power = 0.7 } s

            else
                s

        Stands.Answer ->
            fired (\volley -> answer volley s)

        Stands.Shell ->
            fired (\volley -> launchOrGun volley v s)

        Stands.ShortRun ->
            fired (\volley -> launchOrGun volley v s)

        Stands.Attack ->
            fired (\volley -> launchOrGun volley v s)


launchOrGun : Volley -> Ship -> Listening -> Listening
launchOrGun volley v s =
    if volley.underwater then
        MessWatch.recordLocalLaunch v s |> Systems.launchNoise v v.depth False

    else
        Systems.emit { kind = Gunfire, x = v.x, y = v.y, depth = Nothing, altitude = Just 4, power = 0.55 } s


{-| The coastal traffic's turn, its signals heard and recorded by the patrol.
-}
advanceTraffic : Bool -> World -> World
advanceTraffic holiday s =
    case s.traffic of
        Just traffic ->
            let
                after : Listening
                after =
                    ColdWatch.advanceTraffic holiday
                        trafficSignal
                        { x = s.x
                        , y = s.y
                        , time = s.time
                        , mission = s.mission
                        , chart = s.chart
                        , patrol = s.patrol
                        , ships = s.ships
                        , traffic = traffic
                        , weaponSequence = s.weaponSequence
                        , systems = s.systems
                        , debrief = s.debrief
                        , soundSequence = s.soundSequence
                        , acoustics = s.acoustics
                        , invalid = s.invalid
                        , impacts = s.impacts
                        , replay = s.replay
                        , crewQuietUntil = s.crewQuietUntil
                        }
            in
            { s
                | ships = after.ships
                , traffic = Just after.traffic
                , weaponSequence = after.weaponSequence
                , debrief = after.debrief
                , soundSequence = after.soundSequence
                , acoustics = after.acoustics
                , invalid = after.invalid
                , impacts = after.impacts
                , replay = after.replay
                , crewQuietUntil = after.crewQuietUntil
            }

        Nothing ->
            s


{-| A blast heard close: within 210 m it shakes the boat and enters the
replay, within 2.5 km it is logged as a miss.
-}
blastNear : Sound -> Float -> World -> World
blastNear source d s =
    if d < 210 then
        let
            point : { x : Float, y : Float, depth : Float }
            point =
                { x = source.x, y = source.y, depth = Maybe.withDefault (0 / 0) source.depth }
        in
        Replay.mark (Replay.at Replay.Blast point) s
            |> Systems.hurt (M.max 3 (36 * (1 - d / 210))) "Depth charge shock. Damage control responding." Nothing (Just point)
            |> Systems.addDebrief "An underwater explosion was close enough to damage your sub."

    else if d < 2500 then
        Mechanics.log "Depth charge detonation. That pattern missed." Mechanics.Info s
            |> Systems.addDebrief "The sub was outside the depth-charge damage zone when it detonated."

    else
        s


{-| Every sound that has reached the boat this tick, in the order each
arrived: received if loud enough, and a blast weighed by its distance.
-}
hear : World -> World
hear s =
    let
        ( sounds, events ) =
            Acoustics.update s.time { x = s.x, y = s.y, depth = Just s.depth, heading = Just s.heading } s.acoustics
    in
    List.foldl
        (\event w ->
            case event of
                Acoustics.Received heard ->
                    receive heard w

                Acoustics.BlastAt heard d ->
                    blastNear heard d w
        )
        { s | acoustics = sounds }
        events
