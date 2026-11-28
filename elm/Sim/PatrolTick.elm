module Sim.PatrolTick exposing (Input, step)

{-| The patrol's clock: a frame of play split into quarter-second ticks,
each moving the sea, the sky, the boat, every ship, the traffic and the
fleets, the boat's contacts, reconnaissance, weapons, sound and the drone,
then judging the objective and how the patrol ends.
-}

import PatrolMission exposing (Mission(..))
import Sim.AlliedWatch as AlliedWatch
import Sim.BoatMotion as BoatMotion
import Sim.Combat as Combat
import Sim.Contact exposing (Contact)
import Sim.ContactReports as ContactReports
import Sim.ConvoyWatch as ConvoyWatch
import Sim.DroneFlight as DroneFlight
import Sim.Environment as Env exposing (Environment)
import Sim.Equipment as Equipment exposing (System)
import Sim.HullContacts as HullContacts
import Sim.HullTraffic as HullTraffic
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.Missions as Missions
import Sim.PatrolCreate as PatrolCreate
import Sim.PatrolEnd as PatrolEnd
import Sim.PatrolHazards as PatrolHazards
import Sim.PatrolHearing as PatrolHearing
import Sim.PatrolSearch as PatrolSearch
import Sim.PatrolShips as PatrolShips
import Sim.Recon as Recon
import Sim.ReconPasses as ReconPasses
import Sim.ReplayEvents as Replay
import Sim.Ship exposing (Ship)
import Sim.Site exposing (Site)
import Sim.SonarTransmitters exposing (Instrument(..), Profile)
import Sim.Status exposing (Status(..))
import Sim.SurfaceWake as SurfaceWake
import Sim.Systems as Systems
import Sim.TrackEstimates as TrackEstimates
import Sim.Vessel exposing (Kind(..))
import Sim.World exposing (World)


{-| What the page passes each frame: whether play is paused or a dialog is
open, the time compression, where the player looks and through what, any
imaging sweep held down, and the allied ship whose lamp is in view.
-}
type alias Input =
    { paused : Bool
    , modal : Bool
    , timeRate : Maybe Float
    , look : Maybe Float
    , observation : Maybe String
    , imaging : Maybe { mode : Instrument, profile : Profile }
    , lampInView : Maybe String
    }


{-| A frame of play, at most a minute, in quarter-second ticks so time
compression obeys the same collision and resource rules; nothing moves once
the patrol has ended, while paused, or behind a dialog.
-}
step : Float -> Input -> World -> World
step dt input s =
    if s.status /= Patrol || dt <= 0 || input.paused || input.modal then
        s

    else
        ticks input (M.min dt 60) s


ticks : Input -> Float -> World -> World
ticks input left s =
    if 0 < left && s.status == Patrol then
        let
            t : Float
            t =
                M.min 0.25 left
        in
        ticks input (left - t) (tick t input s)

    else
        s


{-| The patrol as the sky reads it.
-}
sky : World -> Env.Sky {}
sky s =
    { environment = Just s.environment
    , time = s.time
    , wavePhase = s.wavePhase
    , lightning = List.map (\e -> { time = e.time, x = e.x, y = e.y }) s.lightning
    , x = s.x
    , y = s.y
    }


{-| A waypoint steers the boat, and on arrival she stops.
-}
followRoute : World -> World
followRoute s =
    case s.route of
        Just r ->
            let
                steered : World
                steered =
                    { s | targetHeading = Mechanics.bearing s r }

                radius : Float
                radius =
                    case r.radius of
                        Just v ->
                            if M.truthy v then
                                v

                            else
                                100

                        Nothing ->
                            100
            in
            if Mechanics.distance steered r < radius then
                Mechanics.log "Waypoint reached. All stop." Info { steered | route = Nothing, targetSpeed = 0 }

            else
                steered

        Nothing ->
            s


{-| The scope trains on a steering bearing until the boat's head comes round
to it.
-}
steerScope : World -> World
steerScope s =
    case s.scopeSteerBearing of
        Just b ->
            if M.abs (Mechanics.delta b s.heading) < 0.1 then
                { s | scopeAngle = 0, scopeSteerBearing = Nothing }

            else
                { s | scopeAngle = M.remainder (b - s.heading + 360) 360 }

        Nothing ->
            s


{-| A repeated damage line is logged once.
-}
dropRepeat : World -> World
dropRepeat s =
    case s.events of
        first :: second :: rest ->
            if first.text == second.text then
                { s | events = first :: rest }

            else
                s

        _ ->
            s


{-| An instrument's profile while it transmits, held on or swept this frame.
-}
transmitting : Instrument -> Maybe Profile -> Maybe { mode : Instrument, profile : Profile } -> Maybe Profile
transmitting mode held scan =
    case held of
        Just p ->
            Just p

        Nothing ->
            scan
                |> Maybe.andThen
                    (\sweep ->
                        if sweep.mode == mode then
                            Just sweep.profile

                        else
                            Nothing
                    )


{-| Imaging time runs while either imager transmits through a working sonar,
with a beat every five seconds of it.
-}
image : Float -> Bool -> World -> ( Float, World )
image dt active s =
    if active && 0 < Equipment.operatingFraction s.systems.sonar then
        let
            previous : Float
            previous =
                Maybe.withDefault 0 s.imagingTime

            now : Float
            now =
                previous + dt
        in
        ( if floor (previous / 5) < floor (now / 5) then
            toFloat (floor (now / 5))

          else
            0
        , { s | imagingTime = Just now }
        )

    else
        ( 0, s )


systemKeyed : String -> Maybe System
systemKeyed key =
    List.filter (\k -> Equipment.systemKey k == key) Equipment.systems |> List.head


{-| The fields hull contacts work on, with those damage to the boat reads.
-}
type alias Hulls =
    Systems.World { verticalSpeed : Float, site : Maybe Site, ships : List Ship, collisions : List HullTraffic.Collision }


{-| Hulls touching hulls and the seabed, each collision with the boat
entering the replay.
-}
resolveHulls : World -> World
resolveHulls s =
    let
        after : Hulls
        after =
            HullContacts.resolveTraffic (\severity text part v -> Systems.hurt severity text (systemKeyed part) Nothing v)
                { status = s.status
                , time = s.time
                , rng = s.rng
                , difficulty = s.difficulty
                , x = s.x
                , y = s.y
                , depth = s.depth
                , heading = s.heading
                , pitch = s.pitch
                , roll = s.roll
                , speed = s.speed
                , systems = s.systems
                , repairLimits = s.repairLimits
                , hull = s.hull
                , outerHull = s.outerHull
                , flood = s.flood
                , shock = s.shock
                , fuel = s.fuel
                , fuelLeak = s.fuelLeak
                , battery = s.battery
                , scope = s.scope
                , scopeTravel = s.scopeTravel
                , torps = s.torps
                , cookoff = s.cookoff
                , collisionHits = s.collisionHits
                , drone = s.drone
                , chart = s.chart
                , impacts = s.impacts
                , weaponSequence = s.weaponSequence
                , events = s.events
                , debrief = s.debrief
                , acoustics = s.acoustics
                , soundSequence = s.soundSequence
                , replay = s.replay
                , invalid = s.invalid
                , verticalSpeed = s.verticalSpeed
                , site = s.site
                , ships = s.ships
                , collisions = []
                }
    in
    List.foldl (\c w -> Replay.mark { kind = Replay.Collision, point = c.point, heading = Nothing, target = c.target, shot = Nothing, enemy = Nothing } w)
        { s
            | status = after.status
            , rng = after.rng
            , x = after.x
            , y = after.y
            , depth = after.depth
            , heading = after.heading
            , pitch = after.pitch
            , roll = after.roll
            , speed = after.speed
            , systems = after.systems
            , repairLimits = after.repairLimits
            , hull = after.hull
            , outerHull = after.outerHull
            , flood = after.flood
            , shock = after.shock
            , fuel = after.fuel
            , fuelLeak = after.fuelLeak
            , battery = after.battery
            , scope = after.scope
            , scopeTravel = after.scopeTravel
            , torps = after.torps
            , cookoff = after.cookoff
            , collisionHits = after.collisionHits
            , drone = after.drone
            , impacts = after.impacts
            , weaponSequence = after.weaponSequence
            , events = after.events
            , debrief = after.debrief
            , acoustics = after.acoustics
            , soundSequence = after.soundSequence
            , replay = after.replay
            , invalid = after.invalid
            , verticalSpeed = after.verticalSpeed
            , site = after.site
            , ships = after.ships
        }
        after.collisions


{-| Contacts age and lose confidence; each is dropped after four minutes,
a satellite fix after fifteen.
-}
ageContacts : Float -> World -> World
ageContacts dt s =
    let
        kept : Contact -> Bool
        kept c =
            c.age
                < 240
                || (case c.fix of
                        Just f ->
                            f.source == Just "satellite" && s.time - f.time < 900

                        Nothing ->
                            False
                   )
    in
    { s | contacts = List.filter kept (List.map (\c -> { c | age = c.age + dt, confidence = M.max 0.05 (c.confidence - dt * 0.0006) }) s.contacts) }


{-| A packet's tracks as the chart's estimates take them.
-}
estimates : Recon.Packet -> TrackEstimates.Packet
estimates p =
    { tracks =
        List.map
            (\t ->
                { id = t.id
                , x = t.x
                , y = t.y
                , time = Just t.time
                , vx = Just t.vx
                , vy = Just t.vy
                , positionSigma = Just t.positionSigma
                , velocitySigma = Just t.velocitySigma
                , maneuverSigma = Just t.maneuverSigma
                , identified = t.identified
                , name = t.name
                , side = t.side
                , kind = Maybe.map Surface t.kind
                , military = t.military
                }
            )
            p.tracks
    , capturedAt = p.capturedAt
    , receivedAt = Maybe.withDefault (0 / 0) p.receivedAt
    }


{-| Reconnaissance passes overhead, and a received packet's tracks join the
contacts.
-}
recon : Float -> World -> World
recon dt s =
    let
        ( packet, passed ) =
            ReconPasses.updateRecon (Env.environmentAt (sky s)) dt { status = s.status, time = s.time, depth = s.depth, recon = Just s.recon, ships = s.ships, patrol = s.patrol, wavePhase = s.wavePhase }

        s1 : World
        s1 =
            { s | recon = Maybe.withDefault s.recon passed.recon, ships = passed.ships }
    in
    case packet |> Maybe.andThen (\p -> TrackEstimates.applyReconPacket (estimates p) s1 |> Maybe.map (Tuple.pair p)) of
        Just ( p, applied ) ->
            Mechanics.log ("Orbital reconnaissance received. " ++ String.fromInt (List.length p.tracks) ++ " timestamped surface tracks.") Success applied

        Nothing ->
            s1


{-| The rest of a tick once the boat is still on patrol after moving.
-}
afloat : Float -> Input -> Environment -> Bool -> ( Bool, Float ) -> World -> World
afloat dt input env diesel ( approaching, formationTravel ) s0 =
    let
        s1 : World
        s1 =
            { s0 | wake = SurfaceWake.recordWake s0 env s0.wake }
                |> steerScope
                |> dropRepeat
                |> (\s ->
                        if s.hull <= 0 then
                            { s | status = Lost }

                        else
                            s
                   )

        scribbler : Maybe Profile
        scribbler =
            transmitting Scribbler s1.imagers.scribbler input.imaging

        painter : Maybe Profile
        painter =
            transmitting Painter s1.imagers.painter input.imaging

        ( beat, s2 ) =
            image dt (scribbler /= Nothing || painter /= Nothing) s1

        ( danger, s3 ) =
            PatrolShips.sailShips
                { dt = dt
                , env = env
                , look = input.look
                , observation = input.observation
                , approaching = approaching
                , formationTravel = formationTravel
                , newTriad = floor (s2.time / 3) /= floor ((s2.time - dt) / 3)
                , beat = beat
                , scribbler = scribbler
                , painter = painter
                }
                s2

        observed : ConvoyWatch.Observation
        observed =
            { observation = input.observation, lampInView = input.lampInView, timeRate = input.timeRate }

        s4 : World
        s4 =
            PatrolHearing.advanceTraffic (env.holiday /= Nothing) s3
                |> (\s ->
                        if s.mission == Tiebreaker && not approaching then
                            Missions.updateFleetBattle s

                        else
                            s
                   )

        s5 : World
        s5 =
            if s4.convoy /= Nothing then
                let
                    raided : World
                    raided =
                        ConvoyWatch.updateConvoyRaid dt approaching s4
                in
                ConvoyWatch.updateLamp env
                    (if (raided.alliedLamp |> Maybe.andThen .message) /= Nothing then
                        { observed | lampInView = Nothing }

                     else
                        observed
                    )
                    dt
                    raided

            else
                s4

        s6 : World
        s6 =
            AlliedWatch.updateAlliedWatch env observed dt ContactReports.recordLampContact s5
                |> PatrolEnd.locate input.observation input.look env
                |> resolveHulls
                |> (\s -> ageContacts dt { s | alert = M.clamp 0 100 danger })
                |> recon dt
    in
    Combat.updateCombat (Env.environmentAt (sky s6)) dt s6
        |> PatrolHazards.blasts dt
        |> PatrolHazards.shells dt
        |> PatrolHearing.hear
        |> (\s -> { s | torpedoTracks = List.filter (\t -> s.time - t.time < 35) s.torpedoTracks })
        |> DroneFlight.updateDrone dt diesel
        |> PatrolCreate.updateWatchWarnings
        |> PatrolEnd.sightings input.observation input.look env
        |> PatrolEnd.conclude dt


tick : Float -> Input -> World -> World
tick dt input s0 =
    let
        -- Continue older saves from the wave they last displayed.
        s1 : World
        s1 =
            case s0.wavePhase of
                Just _ ->
                    s0

                Nothing ->
                    { s0 | wavePhase = Just (s0.time * (Env.environmentAt (sky s0)).waveSpeed) }

        s2 : World
        s2 =
            { s1
                | time = s1.time + dt
                , pingAge = s1.pingAge + dt
                , pingCooldown = M.max 0 (s1.pingCooldown - dt)
                , photoCooldown = M.max 0 (s1.photoCooldown - dt)
                , shock = M.max 0 (Mechanics.orZero s1.shock - dt)
            }

        s3 : World
        s3 =
            case s2.noisemaker of
                Just n ->
                    if 32 < s2.time - n.time then
                        { s2 | noisemaker = Nothing }

                    else
                        s2

                Nothing ->
                    s2

        env0 : Environment
        env0 =
            Env.environmentAt (sky s3)

        rate : Float
        rate =
            case input.timeRate of
                Just r ->
                    if M.truthy r then
                        r

                    else
                        1

                Nothing ->
                    1

        ( approach, s4 ) =
            case s3.search of
                Just area ->
                    let
                        ( moving, advanced ) =
                            PatrolSearch.advanceApproach dt rate area
                    in
                    ( ( moving
                      , if moving && s3.battle /= Nothing then
                            800 * (PatrolSearch.approachProgress advanced - PatrolSearch.approachProgress area)

                        else
                            0
                      )
                    , { s3 | search = Just advanced }
                    )

                Nothing ->
                    ( ( False, 0 ), s3 )

        s5 : World
        s5 =
            case ( Tuple.first approach, s4.operation ) of
                ( True, Just o ) ->
                    { s4 | operation = Just { o | lastCasualty = o.lastCasualty + dt } }

                _ ->
                    s4

        -- Only the next interval uses the new weather speed. The sea keeps wall
        -- time during compression while objectives and traffic keep patrol time.
        phase : Float
        phase =
            Maybe.withDefault 0 s5.wavePhase + env0.waveSpeed * dt / M.max 1 rate

        env : Environment
        env =
            { env0 | wavePhase = Just phase }

        ( s6, diesel ) =
            { s5 | wavePhase = Just phase }
                |> PatrolHazards.lightning input.look env
                |> followRoute
                |> BoatMotion.updateBoat dt
    in
    if s6.status /= Patrol then
        s6

    else
        afloat dt input env diesel approach s6
