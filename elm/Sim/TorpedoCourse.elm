module Sim.TorpedoCourse exposing (Course, Seeking, torpedoCourse)

{-| Where a torpedo steers each moment. The boat's torpedoes home on the
loudest return ahead, preferring the intended target, and a submarine they
close on may drop a decoy; an enemy's torpedo knows only the point it was
aimed at, may be pulled off by the boat's noisemaker, and searches once past
it. Both ping as they run and circle outward when they have nothing.
-}

import Sim.Acoustics as Acoustics
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.Ship exposing (Ship)
import Sim.Sound exposing (Sound)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems
import Sim.Torpedo as Torpedo exposing (DecoyTarget, Owner(..), Torpedo)
import Sim.TorpedoWatch as TorpedoWatch
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


{-| The patrol fields steering reads and writes.
-}
type alias Seeking s p n =
    { s
        | x : Float
        , y : Float
        , depth : Float
        , time : Float
        , rng : Int
        , patrol : { p | seed : Float }
        , ships : List Ship
        , noisemaker : Maybe { n | x : Float, y : Float, time : Float }
        , soundSequence : Int
        , acoustics : List Sound
        , invalid : List InvalidNumber
    }


type alias Course =
    { heading : Float, depth : Float }


{-| The depth a torpedo runs at to meet a ship: a submarine's own (65 m when
unknown), otherwise just under the surface.
-}
targetRunDepth : Ship -> Float
targetRunDepth ship =
    if ship.kind == Submarine then
        Maybe.withDefault 65 ship.depth

    else
        Torpedo.surfaceRunDepth


{-| The loudest return within 1,800 m and 40 degrees of the torpedo's
heading, weighed by range; the intended target counts two and a half times
until the torpedo is diverted.
-}
seekerReturn : Torpedo -> List Ship -> Maybe ( Int, Ship )
seekerReturn p ships =
    let
        consider : ( Int, Ship ) -> ( Maybe ( Int, Ship ), Float ) -> ( Maybe ( Int, Ship ), Float )
        consider ( i, ship ) ( best, score ) =
            let
                d : Float
                d =
                    M.hypot2 (Mechanics.distance p ship) (targetRunDepth ship - p.depth)
            in
            if ship.hull <= 0 || 1800 < d || 40 < M.abs (Mechanics.delta (Mechanics.bearing p ship) p.heading) then
                ( best, score )

            else
                let
                    loud : Float
                    loud =
                        case ship.noise of
                            Just noise ->
                                noise

                            Nothing ->
                                (case ship.kind of
                                    Surface Merchant ->
                                        75

                                    Surface Escort ->
                                        65

                                    Submarine ->
                                        28

                                    _ ->
                                        40
                                )
                                    + M.abs ship.speed
                                    * 3

                    preference : Float
                    preference =
                        if Just ship.id == p.intended && not p.diverted then
                            2.5

                        else
                            1

                    value : Float
                    value =
                        loud * preference / (d + 80)
                in
                if score < value then
                    ( Just ( i, ship ), value )

                else
                    ( best, score )
    in
    List.foldl consider ( Nothing, 0 ) (List.indexedMap Tuple.pair ships) |> Tuple.first


{-| A military submarine the torpedo closes within 220 m of spends one of its
decoys (two to start), once per torpedo; a quarter of the time the decoy
takes, dropped short of the submarine to one side of the shot.
-}
releaseEnemyDecoy : Torpedo -> Maybe ( Int, Ship ) -> Seeking s p n -> ( Torpedo, Seeking s p n )
releaseEnemyDecoy p chosen s =
    case chosen of
        Just ( i, ship ) ->
            let
                depth : Float
                depth =
                    targetRunDepth ship

                remaining : Int
                remaining =
                    Maybe.withDefault Torpedo.enemyDecoySupply ship.torpedoDecoys
            in
            if ship.kind /= Submarine || ship.military /= Just True || List.member ship.id p.decoysChecked || 220 < M.hypot2 (Mechanics.distance p ship) (depth - p.depth) || M.isZero (toFloat remaining) then
                ( p, s )

            else
                let
                    spent : Seeking s p n
                    spent =
                        { s
                            | ships =
                                List.indexedMap
                                    (\j v ->
                                        if j == i then
                                            { v | torpedoDecoys = Just (remaining - 1) }

                                        else
                                            v
                                    )
                                    s.ships
                        }

                    checked : Torpedo
                    checked =
                        { p | decoysChecked = p.decoysChecked ++ [ ship.id ] }

                    ( r, rolled ) =
                        Systems.draw spent
                in
                if M.notLess r 0.25 then
                    ( checked, rolled )

                else
                    let
                        a : Float
                        a =
                            Mechanics.rad (Mechanics.bearing p ship)

                        side : Float
                        side =
                            p.searchDirection

                        decoy : DecoyTarget
                        decoy =
                            { x = ship.x - sin a * 60 + cos a * 24 * side
                            , y = ship.y - cos a * 60 - sin a * 24 * side
                            , depth = depth
                            , expiresAt = rolled.time + 18
                            }
                    in
                    ( { checked | decoyTarget = Just decoy }, rolled )

        Nothing ->
            ( p, s )


{-| Circling outward: the turn rate falls as the search goes on.
-}
searchCourse : Float -> Torpedo -> ( Course, Torpedo )
searchCourse dt p =
    let
        searchAge : Float
        searchAge =
            p.searchAge + dt

        turnRate : Float
        turnRate =
            8 / (1 + searchAge / 24)
    in
    ( { heading = p.heading + p.searchDirection * turnRate * dt, depth = p.orderedDepth }, { p | searchAge = searchAge } )


{-| The course and depth a torpedo steers for this moment. Until it arms it
holds its ordered course (a tube-launched one first runs straight out); then
it pings every 2.4 seconds and seeks.
-}
torpedoCourse : Float -> Torpedo -> Seeking s p n -> ( Course, Torpedo, Seeking s p n )
torpedoCourse dt p0 s0 =
    if not (M.isZero p0.tubeSide) && p0.age <= Torpedo.armingTime / 2 then
        ( { heading = p0.heading, depth = p0.orderedDepth }, p0, s0 )

    else if p0.age < Torpedo.armingTime then
        ( { heading = p0.orderedHeading, depth = p0.orderedDepth }, p0, s0 )

    else
        let
            ( p, s ) =
                if M.notLess p0.pingAge 2.4 then
                    ( { p0 | pingAge = 0 }, ping p0 s0 )

                else
                    ( p0, s0 )
        in
        case p.owner of
            EnemyTorpedo knows ->
                let
                    ( course, steered ) =
                        enemyCourse dt knows p s
                in
                ( course, steered, s )

            PlayerTorpedo ->
                playerCourse dt p s


ping : Torpedo -> Seeking s p n -> Seeking s p n
ping p s =
    let
        knows : { enemy : Bool, aim : Maybe { x : Float, y : Float } }
        knows =
            case p.owner of
                EnemyTorpedo enemy ->
                    { enemy = True, aim = enemy.aim }

                PlayerTorpedo ->
                    { enemy = False, aim = Nothing }

        echo : TorpedoWatch.Echo
        echo =
            TorpedoWatch.gameEcho s
                { id = p.id, x = p.x, y = p.y, depth = p.depth, enemy = knows.enemy, aim = knows.aim, orderedDepth = p.orderedDepth, diverted = p.diverted }
                s.time
                Torpedo.torpedoSpeed
    in
    Systems.emitWith
        (\sound -> { sound | echo = Just { id = toFloat echo.id, x = echo.x, y = echo.y, depth = echo.depth, speed = echo.speed, time = echo.time, inboundRun = echo.inboundRun } })
        { kind = Acoustics.Seeker, x = p.x, y = p.y, depth = Just p.depth, altitude = Nothing, power = 0.24 }
        s


{-| An enemy torpedo: the boat's noisemaker within 650 m diverts it a quarter
of the time, once per noisemaker, and a diverted torpedo locks on to any other
military ship within 750 m. Otherwise it runs at its aim point until past it,
then searches.
-}
enemyCourse : Float -> { launcher : Maybe String, aim : Maybe { x : Float, y : Float } } -> Torpedo -> Seeking s p n -> ( Course, Torpedo )
enemyCourse dt knows p0 s =
    let
        p : Torpedo
        p =
            case s.noisemaker of
                Just decoy ->
                    if p0.decoyCheckedAt /= Just decoy.time && Mechanics.distance p0 decoy < 650 then
                        if hash01 s.patrol.seed (toFloat (p0.id + floor decoy.time * 19)) < 0.25 then
                            { p0 | decoyCheckedAt = Just decoy.time, diverted = True, owner = EnemyTorpedo { knows | aim = Nothing } }

                        else
                            { p0 | decoyCheckedAt = Just decoy.time }

                    else
                        p0

                Nothing ->
                    p0

        other : Maybe Ship
        other =
            if p.diverted then
                List.filter (\v -> v.military == Just True && Just v.id /= knows.launcher && 0 < v.hull && Mechanics.distance p v < 750) s.ships |> List.head

            else
                Nothing
    in
    case other of
        Just ship ->
            ( { heading = Mechanics.bearing p ship, depth = targetRunDepth ship }, { p | lock = Just ship.id } )

        Nothing ->
            let
                aim : Maybe { x : Float, y : Float }
                aim =
                    case p.owner of
                        EnemyTorpedo k ->
                            k.aim

                        PlayerTorpedo ->
                            Nothing

                unlocked : Torpedo
                unlocked =
                    if p.diverted then
                        { p | lock = Nothing }

                    else
                        p
            in
            case aim of
                Just point ->
                    let
                        a : Float
                        a =
                            Mechanics.rad p.orderedHeading
                    in
                    if 0 < (point.x - p.x) * sin a + (point.y - p.y) * cos a then
                        ( { heading = Mechanics.bearing p point, depth = p.orderedDepth }, unlocked )

                    else
                        searchCourse dt { unlocked | owner = EnemyTorpedo { knows | aim = Nothing } }

                Nothing ->
                    searchCourse dt unlocked


{-| The boat's torpedo: a decoy it follows expires after 18 seconds; it homes
on the best return, or the decoy, and resets its search there; with nothing,
it holds its ordered course until its run-out distance, then searches.
-}
playerCourse : Float -> Torpedo -> Seeking s p n -> ( Course, Torpedo, Seeking s p n )
playerCourse dt p0 s0 =
    let
        live : Torpedo
        live =
            case p0.decoyTarget of
                Just decoy ->
                    if M.notLess s0.time decoy.expiresAt then
                        { p0 | decoyTarget = Nothing }

                    else
                        p0

                Nothing ->
                    p0

        best : Maybe ( Int, Ship )
        best =
            if live.decoyTarget == Nothing then
                seekerReturn live s0.ships

            else
                Nothing

        ( released, s ) =
            releaseEnemyDecoy live best s0

        p : Torpedo
        p =
            { released
                | lock =
                    if released.decoyTarget == Nothing then
                        Maybe.map (Tuple.second >> .id) best

                    else
                        Nothing
            }
    in
    case ( p.decoyTarget, best ) of
        ( Just decoy, _ ) ->
            ( { heading = Mechanics.bearing p decoy, depth = decoy.depth }, { p | searchAge = 0, runOut = 0 }, s )

        ( Nothing, Just ( _, ship ) ) ->
            ( { heading = Mechanics.bearing p ship, depth = targetRunDepth ship }, { p | searchAge = 0, runOut = 0, orderedDepth = targetRunDepth ship }, s )

        ( Nothing, Nothing ) ->
            if p.traveled < p.runOut then
                ( { heading = p.orderedHeading, depth = p.orderedDepth }, p, s )

            else
                let
                    ( course, searching ) =
                        searchCourse dt p
                in
                ( course, searching, s )
