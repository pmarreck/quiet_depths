module Sim.AircraftFlight exposing (updateAircraft)

{-| Flying a sortie: aircraft take off, approach the last report, search
around it, and attack a boat they can see, strafing it on the surface; each
drops one depth bomb over the report and turns away, and the search is
called off once the report is older than the hunters would search. A shot
down aircraft falls into the sea; at the end of a sortie they fly home.
-}

import PatrolMission exposing (Mission(..))
import Sim.Acoustics as Acoustics
import Sim.AirSupport exposing (AirReport, AirSupport, Aircraft, Skies, Sortie(..), fromReport, toReport)
import Sim.AircraftPhase exposing (Phase(..))
import Sim.CombatGeometry as CombatGeometry
import Sim.HunterReports as Reports exposing (Track)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.Ordnance exposing (BlastKind(..), GunOwner(..))
import Sim.Periscope as Periscope
import Sim.Systems as Systems


{-| One tick of every aircraft, with `visibility` the conditions' range for
seeing a surfaced boat.
-}
updateAircraft : { e | subVisualRange : Float } -> Float -> Skies s p d -> Skies s p d
updateAircraft visibility dt start =
    let
        step : Aircraft -> ( List Aircraft, Skies s p d ) -> ( List Aircraft, Skies s p d )
        step plane ( done, state ) =
            let
                ( flown, after ) =
                    fly visibility dt plane state
            in
            ( flown :: done, after )

        ( planes, moved ) =
            List.foldl step ( [], start ) start.aircraft

        s : Skies s p d
        s =
            { moved | aircraft = List.filter (\p -> p.phase /= Gone) planes |> List.reverse }

        support : AirSupport
        support =
            s.airSupport
    in
    if support.status /= Airborne then
        s

    else if not (List.any (\p -> 0 < p.hull) s.aircraft) then
        { s | airSupport = { support | status = Spent } }

    else
        let
            lastReport : Float
            lastReport =
                M.max (Maybe.withDefault 0 support.launchAt) (Maybe.map .time support.lastKnown |> Maybe.withDefault 0)
        in
        if Reports.searchDuration s < s.time - lastReport then
            { s
                | airSupport = { support | status = Spent }
                , aircraft =
                    List.map
                        (\p ->
                            if 0 < p.hull then
                                { p | phase = Return }

                            else
                                p
                        )
                        s.aircraft
            }
                |> Mechanics.log "Intercepted radio traffic. Air search called off." Info

        else
            s


fly : { e | subVisualRange : Float } -> Float -> Aircraft -> Skies s p d -> ( Aircraft, Skies s p d )
fly visibility dt start s =
    let
        p : Aircraft
        p =
            { start | previous = Just { x = start.x, y = start.y, altitude = start.altitude }, attack = M.max 0 (Mechanics.orZero start.attack - dt) }
    in
    if p.hull <= 0 then
        let
            altitude : Float
            altitude =
                p.altitude - dt * 45
        in
        ( { p
            | altitude = altitude
            , bank = Mechanics.orZero p.bank + dt * 1.3
            , phase =
                if altitude < -10 then
                    Gone

                else
                    Down
          }
        , s
        )

    else if p.phase == Return then
        let
            home : { x : Float, y : Float }
            home =
                s.airSupport.base

            remaining : Float
            remaining =
                Mechanics.distance p home

            travel : Float
            travel =
                p.speed * dt
        in
        if remaining <= M.max 10 travel then
            ( { p | phase = Gone }, s )

        else
            ( { p | heading = Mechanics.bearing p home, bank = 0, x = p.x + (home.x - p.x) * travel / remaining, y = p.y + (home.y - p.y) * travel / remaining }, s )

    else
        let
            ( pursued, after ) =
                case s.airSupport.lastKnown of
                    Just report ->
                        pursue visibility dt p report s

                    Nothing ->
                        ( p, s )
        in
        ( { pursued
            | x = pursued.x + sin (Mechanics.rad pursued.heading) * pursued.speed * dt
            , y = pursued.y + cos (Mechanics.rad pursued.heading) * pursued.speed * dt
          }
        , after
        )


{-| An aircraft working a report: it refreshes the report when it can see the
boat, moves through its phases, turns at 22 degrees a second toward its
destination, climbs or dives toward its working height, and attacks.
-}
pursue : { e | subVisualRange : Float } -> Float -> Aircraft -> AirReport -> Skies s p d -> ( Aircraft, Skies s p d )
pursue visibility dt p told s0 =
    let
        d : Float
        d =
            Mechanics.distance p s0

        sensitivity : Float
        sensitivity =
            Maybe.andThen .detection s0.difficulty |> Maybe.withDefault 1

        visible : Bool
        visible =
            (s0.depth <= 2 && d < M.min 2600 visibility.subVisualRange * sensitivity)
                || (s0.depth <= 15 && 0 < s0.systems.periscope && d < 400 * sensitivity * Periscope.scopeExtension s0)

        ( s, report ) =
            if visible then
                let
                    seen : AirReport
                    seen =
                        fromReport (Reports.playerReport s0)

                    support : AirSupport
                    support =
                        s0.airSupport
                in
                ( { s0 | airSupport = { support | lastKnown = Just seen } }, seen )

            else
                ( s0, told )

        target : Track
        target =
            Reports.projectedReport s.time 0 (toReport report)

        r : Float
        r =
            Mechanics.distance p target

        ahead : { x : Float, y : Float }
        ahead =
            { x = p.x + sin (Mechanics.rad p.heading) * 1000, y = p.y + cos (Mechanics.rad p.heading) * 1000 }

        phase : Phase
        phase =
            p.phase
                |> (\ph ->
                        if ph == Takeoff && M.notLess s.time p.takeoffUntil then
                            Approach

                        else
                            ph
                   )
                |> (\ph ->
                        if ph == Approach && r < 1300 then
                            Search

                        else
                            ph
                   )
                |> (\ph ->
                        if visible && r < 1800 && ph /= Egress && (s.mission /= BigKahuna || ph /= Takeoff) then
                            Attack

                        else
                            ph
                   )

        ( nextPhase, egress, destination ) =
            case phase of
                Takeoff ->
                    ( phase, p.egress, ahead )

                Search ->
                    if visible then
                        ( phase, p.egress, { x = target.x, y = target.y } )

                    else
                        let
                            a : Float
                            a =
                                s.time * 0.06
                        in
                        ( phase, p.egress, { x = target.x + sin a * 650, y = target.y + cos a * 650 } )

                Egress ->
                    let
                        left : Float
                        left =
                            Mechanics.orZero (Maybe.withDefault 0 p.egress) - dt
                    in
                    ( if left <= 0 then
                        Search

                      else
                        Egress
                    , Just left
                    , ahead
                    )

                _ ->
                    ( phase, p.egress, { x = target.x, y = target.y } )

        turn : Float
        turn =
            M.clamp (negate dt * 22) (dt * 22) (Mechanics.delta (Mechanics.bearing p destination) p.heading)

        desiredAltitude : Float
        desiredAltitude =
            if nextPhase == Attack then
                65

            else
                180

        turned : Aircraft
        turned =
            { p
                | phase = nextPhase
                , egress = egress
                , heading = CombatGeometry.wrap (p.heading + turn)
                , bank =
                    if M.isZero turn then
                        0

                    else
                        M.clamp -0.5 0.5 (negate turn / M.max dt 0.001 * 0.02)
                , altitude = p.altitude + M.clamp (negate dt * 10) (dt * 5) (desiredAltitude - p.altitude)
            }
    in
    ( turned, s ) |> attack visible r report


{-| The attack run: within 900 m and off its cooldown, an aircraft strafes a
boat it can see on the surface and drops its bomb inside 450 m; inside 180 m
of the report it drops the bomb if it still has it and turns away for ten
seconds. A boat out of sight still draws the bomb, aimed at the report.
-}
attack : Bool -> Float -> AirReport -> ( Aircraft, Skies s p d ) -> ( Aircraft, Skies s p d )
attack visible r report ( p0, s0 ) =
    let
        bombIf : Bool -> ( Aircraft, Skies s p d ) -> ( Aircraft, Skies s p d )
        bombIf condition ( plane, s ) =
            if condition && not plane.bombDropped then
                dropBomb plane report s

            else
                ( plane, s )

        ( p1, s1 ) =
            if p0.phase == Attack && r < 900 && p0.attack <= 0 then
                (if visible && s0.depth <= 2 then
                    strafe r report p0 s0

                 else
                    ( p0, s0 )
                )
                    |> bombIf (r < 450)

            else
                ( p0, s0 )

        ( p2, s2 ) =
            if (p1.phase == Attack || p1.phase == Search) && r < 180 then
                bombIf True ( p1, s1 ) |> Tuple.mapFirst (\plane -> { plane | phase = Egress, egress = Just 10 })

            else
                ( p1, s1 )
    in
    bombIf (not visible && r < 450) ( p2, s2 )


{-| A burst of tracer from the aircraft toward the boat's projected position,
scattered more with range, at 500 m/s.
-}
strafe : Float -> AirReport -> Aircraft -> Skies s p d -> ( Aircraft, Skies s p d )
strafe r report p s =
    let
        ( point, aimed ) =
            Reports.scatterAim (8 + r * 0.045) (Reports.projectedReport s.time (r / 500) (toReport report)) s

        to : { x : Float, y : Float, altitude : Float }
        to =
            { x = point.x, y = point.y, altitude = 2 }

        n : Float
        n =
            M.hypot3 (to.x - p.x) (to.y - p.y) (to.altitude - p.altitude)

        round : Sim.Ordnance.Round
        round =
            { id = aimed.weaponSequence
            , owner = AircraftGun
            , x = p.x
            , y = p.y
            , altitude = p.altitude
            , vx = (to.x - p.x) / n * 500
            , vy = (to.y - p.y) / n * 500
            , vz = (to.altitude - p.altitude) / n * 500
            , age = 0
            , tracer = True
            , previous = Nothing
            }
    in
    ( { p | attack = 0.45 }
    , { aimed | gunRounds = aimed.gunRounds ++ [ round ], weaponSequence = aimed.weaponSequence + 1 }
        |> Systems.emit { kind = Acoustics.Gunfire, x = p.x, y = p.y, depth = Nothing, altitude = Just p.altitude, power = 0.5 }
    )


{-| The aircraft's one depth bomb, fused for the reported depth (40 m when a
legacy report has none, between 15 and 90 m) and aimed where the report will
be when it goes off, scattered more the older the report. The carrier's
alarm names no position, so it draws no bomb.
-}
dropBomb : Aircraft -> AirReport -> Skies s p d -> ( Aircraft, Skies s p d )
dropBomb plane report s =
    if report.reason == Just "an explosion near the carrier" then
        ( plane, s )

    else
        let
            depth : Float
            depth =
                M.clamp 15 90 (Maybe.withDefault 40 report.depth)

            airTime : Float
            airTime =
                2 + plane.altitude / 70

            delay : Float
            delay =
                airTime + depth / 6

            aim : Track
            aim =
                Reports.projectedReport s.time delay (toReport report)

            ( point, aimed ) =
                Reports.scatterAim (45 + aim.age * 0.9) aim s

            blast : Sim.Ordnance.Blast
            blast =
                { id = aimed.soundSequence
                , x = point.x
                , y = point.y
                , depth = depth
                , delay = delay
                , totalDelay = delay
                , airTime = Just airTime
                , airHeight = Just plane.altitude
                , age = 0
                , exploded = False
                , kind = Bomb
                , splashed = Nothing
                , explodedAt = Nothing
                , convoyCharge = Nothing
                }
        in
        ( { plane | bombDropped = True }
        , { aimed | blasts = aimed.blasts ++ [ blast ], soundSequence = aimed.soundSequence + 1 }
            |> Systems.addDebrief "An aircraft dropped its charge over the last reported position."
        )
