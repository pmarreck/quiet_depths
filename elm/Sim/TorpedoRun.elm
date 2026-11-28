module Sim.TorpedoRun exposing (updateTorpedoes)

{-| Every torpedo's run this moment: it travels at 24 m/s until its run
limit or its 180 seconds are spent, turns at 10 degrees a second toward its
course, climbs or dives at up to 45 degrees (a tube-launched torpedo first
eases out of its exit pitch), may pass through a submarine's decoy, and
strikes once armed. Its wake is kept for 40 seconds.
-}

import Sim.CombatGeometry as Geometry
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.Ordnance exposing (Aloft)
import Sim.PatrolReports as PatrolReports
import Sim.Systems as Systems
import Sim.Torpedo as Torpedo exposing (Owner(..), Torpedo, Trace)
import Sim.TorpedoCourse as Course exposing (Course)
import Sim.TorpedoStrike exposing (Firing, torpedoStrike)
import Sim.TorpedoTubes as TorpedoTubes


updateTorpedoes : Float -> Firing s p n -> Firing s p n
updateTorpedoes dt start =
    let
        step : Torpedo -> ( List Torpedo, Firing s p n ) -> ( List Torpedo, Firing s p n )
        step p ( done, s ) =
            let
                ( ran, after ) =
                    run dt p s
            in
            ( ran :: done, after )

        ( torpedoes, ended ) =
            List.foldl step ( [], start ) start.projectiles
    in
    { ended | projectiles = List.filter (\p -> p.age < Torpedo.torpedoLife) torpedoes |> List.reverse }


run : Float -> Torpedo -> Firing s p n -> ( Torpedo, Firing s p n )
run dt p0 s0 =
    let
        flight : Float
        flight =
            M.min dt (M.min (M.max 0 (Torpedo.torpedoLife - p0.age)) (M.max 0 (p0.runLimit - p0.traveled) / Torpedo.torpedoSpeed))

        travel : Float
        travel =
            Torpedo.torpedoSpeed * flight

        from : Aloft
        from =
            { x = p0.x, y = p0.y, altitude = negate p0.depth }

        ( course, steered, s1 ) =
            Course.torpedoCourse flight
                { p0 | age = p0.age + flight, pingAge = p0.pingAge + flight, traveled = M.min p0.runLimit (p0.traveled + travel) }
                s0

        moved : Torpedo
        moved =
            move flight travel course steered

        ( decoyed, s2 ) =
            passDecoy from moved s1

        ( hit, struck, s3 ) =
            if 0 < flight && M.notLess decoyed.age Torpedo.armingTime then
                torpedoStrike decoyed from s2

            else
                ( False, decoyed, s2 )

        ( finished, s4 ) =
            if not hit && (M.notLess struck.traveled struck.runLimit || M.notLess struck.age Torpedo.torpedoLife) then
                ( { struck | age = Torpedo.torpedoLife }
                , if struck.owner == PlayerTorpedo then
                    PatrolReports.report ("run-" ++ String.fromInt struck.id) "Torpedo run ended at its distance limit. No impact reported." s3

                  else
                    s3
                )

            else
                ( struck, s3 )
    in
    ( { finished | path = wake s4.time finished }, s4 )


{-| Turning toward the course and pitching toward its depth. A dive or climb
that would overshoot the course's depth this moment stops at it.
-}
move : Float -> Float -> Course -> Torpedo -> Torpedo
move flight travel course p =
    let
        heading : Float
        heading =
            Geometry.wrap (p.heading + M.clamp (negate flight * 10) (flight * 10) (Mechanics.delta course.heading p.heading))

        drop : Float
        drop =
            course.depth - p.depth

        requestedPitch : Float
        requestedPitch =
            M.clamp (negate Torpedo.maxPitch) Torpedo.maxPitch (atan2 (negate drop) 32)

        pitch : Float
        pitch =
            if M.truthy p.tubeSide then
                TorpedoTubes.exitPitch p.pitch requestedPitch p.age flight Torpedo.armingTime

            else
                requestedPitch

        depthStep : Float
        depthStep =
            negate travel * sin pitch

        dz : Float
        dz =
            if 0 < depthStep * drop && M.abs drop < M.abs depthStep then
                drop

            else
                depthStep

        horizontal : Float
        horizontal =
            sqrt (travel ^ 2 - dz ^ 2)
    in
    { p
        | heading = heading
        , pitch =
            if M.isZero dz then
                0

            else
                atan2 (negate dz) horizontal
        , depth = p.depth + dz
        , x = p.x + sin (Mechanics.rad heading) * horizontal
        , y = p.y + cos (Mechanics.rad heading) * horizontal
    }


{-| A torpedo that passes through the decoy it followed resumes its search at
its present depth, diverted.
-}
passDecoy : Aloft -> Torpedo -> Firing s p n -> ( Torpedo, Firing s p n )
passDecoy from p s =
    case p.decoyTarget of
        Just decoy ->
            case Geometry.sphereHit from { x = p.x, y = p.y, altitude = negate p.depth } { x = decoy.x, y = decoy.y, altitude = negate decoy.depth } 12 of
                Just _ ->
                    ( { p | decoyTarget = Nothing, diverted = True, orderedDepth = p.depth }
                    , Systems.addDebrief "A torpedo followed a submarine decoy, passed it, then resumed its search." s
                    )

                Nothing ->
                    ( p, s )

        Nothing ->
            ( p, s )


{-| The wake gains a point every 0.24 seconds and at the end of the run, and
keeps the last 80 points of the last 40 seconds.
-}
wake : Float -> Torpedo -> List Trace
wake time p =
    let
        due : Bool
        due =
            case List.reverse p.path of
                last :: _ ->
                    M.notLess (time - last.time) 0.24 || M.notLess p.age Torpedo.torpedoLife

                [] ->
                    True

        grown : List Trace
        grown =
            if due then
                p.path ++ [ { x = p.x, y = p.y, depth = p.depth, time = time } ]

            else
                p.path

        recent : List Trace
        recent =
            List.filter (\v -> time - v.time < 40) grown
    in
    List.drop (List.length recent - 80) recent
