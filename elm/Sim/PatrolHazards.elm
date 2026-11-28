module Sim.PatrolHazards exposing (blasts, lightning, shells)

{-| What falls on the patrol each tick: lightning in a storm, which now and
then strikes a surfaced hull; depth charges and bombs splashing down and
exploding, a convoy escort's charge judged as it goes off; and escort shells
arriving near the boat.
-}

import Sim.Acoustics as Acoustics
import Sim.Carrier as Carrier
import Sim.ConvoyWatch as ConvoyWatch
import Sim.Environment exposing (Environment)
import Sim.Equipment exposing (System(..))
import Sim.HostileTracks exposing (Shell)
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.Ordnance as Ordnance exposing (BlastKind(..))
import Sim.Ship exposing (Ship)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems
import Sim.World exposing (Strike, World)


{-| What a strike may hit: the surfaced boat, or the ship at an index.
-}
type Target
    = Boat
    | Vessel Int Ship


{-| A strike may hit the surfaced boat or a ship on the surface within 6 km;
lightning damages the boat, and a ship's hull down to a carrier's floor.
-}
strikeTarget : Strike -> World -> ( Strike, World )
strikeTarget bolt s =
    let
        exposed : List Target
        exposed =
            List.filterMap
                (\( i, v ) ->
                    if 0 < v.hull && Maybe.withDefault 0 v.depth <= 1 && Mechanics.distance s v < 6000 then
                        Just (Vessel i v)

                    else
                        Nothing
                )
                (List.indexedMap Tuple.pair s.ships)
                ++ (if s.depth <= 1 then
                        [ Boat ]

                    else
                        []
                   )

        damage : Float
        damage =
            5 + toFloat (floor (12 * hash01 bolt.seed 912))
    in
    case List.drop (floor (hash01 bolt.seed 911 * toFloat (List.length exposed))) exposed |> List.head of
        Just Boat ->
            ( { bolt | x = s.x, y = s.y, altitude = Just 9 }, Systems.hurt damage "Lightning struck the surfaced sub." Nothing Nothing s )

        Just (Vessel i ship) ->
            let
                struck : Ship
                struck =
                    { ship | hull = Carrier.incidentalHull { kind = ship.kind, hull = ship.hull, directHits = floor (Maybe.withDefault 0 ship.directHits) } damage }
            in
            ( { bolt | x = ship.x, y = ship.y, altitude = Just 18 }
            , Systems.addDebrief ("Lightning struck " ++ ship.name ++ ".")
                { s
                    | ships =
                        List.indexedMap
                            (\j v ->
                                if j == i then
                                    struck

                                else
                                    v
                            )
                            s.ships
                }
            )

        Nothing ->
            ( bolt, s )


{-| A strike somewhere around the boat, toward where she looks in the first
half minute, with its thunder.
-}
strike : Maybe Float -> World -> World
strike look s0 =
    let
        ( a, rng1 ) =
            Mechanics.rand s0.rng

        angle : Float
        angle =
            if s0.time < 30 then
                Mechanics.rad (Maybe.withDefault (s0.heading + s0.scopeAngle) look + (a - 0.5) * 26)

            else
                a * pi * 2

        ( r, rng2 ) =
            Mechanics.rand rng1

        ( h, rng3 ) =
            Mechanics.rand rng2

        ( sd, rng4 ) =
            Mechanics.rand rng3

        range : Float
        range =
            1800 + r * 4000

        seed : Float
        seed =
            toFloat (floor (sd * 1000000))

        bolt0 : Strike
        bolt0 =
            { id = s0.soundSequence, time = s0.time, x = s0.x + sin angle * range, y = s0.y + cos angle * range, height = 1050 + h * 900, seed = seed, altitude = Nothing }

        ( bolt, s1 ) =
            if hash01 seed 910 < 0.09 then
                strikeTarget bolt0 { s0 | rng = rng4 }

            else
                ( bolt0, { s0 | rng = rng4 } )

        ( p, rng5 ) =
            Mechanics.rand s1.rng
    in
    Systems.emit { kind = Acoustics.Thunder, x = bolt.x, y = bolt.y, depth = Nothing, altitude = Just (bolt.height * 0.65), power = 0.8 + p * 0.4 }
        { s1 | rng = rng5, lightning = s1.lightning ++ [ bolt ] }


{-| Lightning falls due: a storm strikes, and the next is scheduled; strikes
fade from the sky after 20 seconds.
-}
lightning : Maybe Float -> Environment -> World -> World
lightning look env s0 =
    let
        s1 : World
        s1 =
            if s0.nextLightningAt <= s0.time then
                let
                    struck : World
                    struck =
                        if 0.35 < env.storm then
                            strike look s0

                        else
                            s0

                    ( roll, rng ) =
                        Mechanics.rand struck.rng
                in
                { struck | rng = rng, nextLightningAt = struck.time + 18 + roll * 36 }

            else
                s0
    in
    { s1 | lightning = List.filter (\e -> s1.time - e.time < 20) s1.lightning }


{-| One blast's tick: a bomb splashes down after its time aloft, a charge
explodes when its fuse runs out (a convoy escort's judged as it does), and
an exploded blast ages.
-}
burst : Float -> Ordnance.Blast -> World -> ( Ordnance.Blast, World )
burst dt b0 s0 =
    let
        b1 : Ordnance.Blast
        b1 =
            { b0 | delay = b0.delay - dt }

        ( b2, s1 ) =
            if b1.kind == Bomb && b1.splashed /= Just True && Maybe.withDefault (0 / 0) b1.airTime <= b1.totalDelay - b1.delay then
                ( { b1 | splashed = Just True }, Systems.emit { kind = Acoustics.Splashdown, x = b1.x, y = b1.y, depth = Just 0, altitude = Nothing, power = 0.65 } s0 )

            else
                ( b1, s0 )

        ( b3, s2 ) =
            if b2.delay <= 0 && not b2.exploded then
                let
                    fired : Ordnance.Blast
                    fired =
                        { b2 | exploded = True, explodedAt = Just s1.time }

                    judged : World
                    judged =
                        if s1.convoy /= Nothing && fired.convoyCharge == Just True then
                            ConvoyWatch.resolveConvoyCharge fired s1

                        else
                            s1
                in
                ( fired, Systems.emit { kind = Acoustics.Blast, x = fired.x, y = fired.y, depth = Just fired.depth, altitude = Nothing, power = 1.2 } judged )

            else
                ( b2, s1 )
    in
    if b3.exploded then
        ( { b3 | age = s2.time - Maybe.withDefault (0 / 0) b3.explodedAt }, s2 )

    else
        ( b3, s2 )


{-| Every blast's tick, keeping those exploded less than five seconds ago or
yet to explode.
-}
blasts : Float -> World -> World
blasts dt s0 =
    let
        ( kept, s1 ) =
            List.foldl
                (\b ( done, s ) ->
                    let
                        ( after, next ) =
                            burst dt b s
                    in
                    ( after :: done, next )
                )
                ( [], s0 )
                s0.blasts
    in
    { s1 | blasts = List.reverse (List.filter (\b -> b.age < 5) kept) }


{-| One shell's tick: on arrival it detonates, damaging the boat if she is
shallower than 7 m and within 65 m, and the debrief records how it fell.
-}
arrive : Float -> Shell -> World -> ( Shell, World )
arrive dt shell0 s0 =
    let
        shell : Shell
        shell =
            { shell0 | delay = shell0.delay - dt }
    in
    if shell.delay <= 0 && shell.hit /= Just True then
        let
            s1 : World
            s1 =
                Systems.emit { kind = Acoustics.Detonation, x = shell.x, y = shell.y, depth = Just 0, altitude = Nothing, power = 0.8 } s0

            range : Float
            range =
                Mechanics.distance s1 shell

            hit : Bool
            hit =
                s1.depth < 7 && range < 65

            s2 : World
            s2 =
                if hit then
                    Systems.hurt (M.max 4 (24 * (1 - range / 65))) "Shell impact near the hull." (Just Engine) Nothing s1

                else
                    s1
        in
        ( { shell | hit = Just True }
        , Systems.addDebrief
            (if hit then
                "An escort shell struck close enough to damage the hull."

             else if 7 <= s2.depth then
                "You were below the surface shell’s damage zone when it arrived."

             else
                "An escort shell splashed wide of your sub."
            )
            s2
        )

    else
        ( shell, s0 )


{-| Every shell's tick, keeping each until three seconds after it arrives.
-}
shells : Float -> World -> World
shells dt s0 =
    let
        ( kept, s1 ) =
            List.foldl
                (\p ( done, s ) ->
                    let
                        ( after, next ) =
                            arrive dt p s
                    in
                    ( after :: done, next )
                )
                ( [], s0 )
                s0.shells
    in
    { s1 | shells = List.reverse (List.filter (\p -> -3 < p.delay) kept) }
