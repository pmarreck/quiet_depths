module Sim.AlliedWatch exposing (Watching, updateAlliedWatch)

{-| Friendly surface ships take discrete sonar observations every 36 seconds,
each on her own beat, and signal a fresh fix on a hostile submarine by lamp
to a surfaced boat within range. A telegram freezes the observation at
issue, including what was known before the boat surfaced.
-}

import Sim.Acoustics as Acoustics
import Sim.ConvoyWatch as ConvoyWatch exposing (AlliedLamp, Convoy, Observation)
import Sim.Environment exposing (Environment)
import Sim.FleetTheater exposing (Battle)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.PatrolReports as PatrolReports exposing (Report)
import Sim.Ship exposing (Ship)
import Sim.SignalLamp as SignalLamp exposing (LampFix, Transmission)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems
import Sim.Vessel exposing (Kind(..), Side(..))


{-| The patrol fields the allied watch reads and writes.
-}
type alias Watching s p y d =
    Systems.Sounding
        { s
            | x : Float
            , y : Float
            , depth : Float
            , heading : Float
            , pitch : Float
            , scope : Bool
            , scopeTravel : Maybe Float
            , systems : { y | periscope : Float }
            , patrol : { p | seed : Float }
            , difficulty : Maybe { d | pingDetection : Maybe Float }
            , battle : Maybe Battle
            , convoy : Maybe Convoy
            , alliedLamp : Maybe AlliedLamp
            , ships : List Ship
            , reports : List Report
            , events : List LogEntry
        }


find : String -> List Ship -> Maybe Ship
find id ships =
    List.filter (\v -> v.id == id) ships |> List.head


{-| One moment of the allied watch. `recordFix` plots a copied fix on the
chart.
-}
updateAlliedWatch : Environment -> Observation -> Float -> (LampFix -> Watching s p y d -> Watching s p y d) -> Watching s p y d -> Watching s p y d
updateAlliedWatch env input dt recordFix s0 =
    if s0.battle == Nothing && s0.convoy == Nothing && not (List.any (\v -> v.incidental == Just True && v.side == Just Friendly && v.kind /= Submarine) s0.ships) then
        s0

    else
        let
            watch0 : AlliedLamp
            watch0 =
                Maybe.withDefault { message = Nothing, sequence = 0, lastIssue = -1 } s0.alliedLamp

            subs : List Ship
            subs =
                List.filter (\v -> v.kind == Submarine && v.side == Just Hostile && 0 < v.hull) s0.ships

            range : Float
            range =
                SignalLamp.lampRange env

            observe : ( Int, Ship ) -> ( ( List Ship, AlliedLamp, Maybe LampFix ), Watching s p y d ) -> ( ( List Ship, AlliedLamp, Maybe LampFix ), Watching s p y d )
            observe ( index, ship0 ) ( ( ships, watch, candidate ), s ) =
                if ship0.kind == Submarine || ship0.side /= Just Friendly || ship0.hull <= 0 || ship0.disabled == Just True then
                    ( ( ships ++ [ ship0 ], watch, candidate ), s )

                else
                    let
                        offset : Float
                        offset =
                            7 + toFloat index * 6

                        beat : Bool
                        beat =
                            M.notLess s.time offset && floor ((s.time - offset) / 36) /= floor ((s.time - dt - offset) / 36)

                        swept : Watching s p y d
                        swept =
                            if beat && Mechanics.distance s ship0 < 4200 && (s.difficulty |> Maybe.andThen .pingDetection |> Maybe.map (\chance -> hash01 s.patrol.seed (toFloat (floor s.time * 17 + index)) < chance) |> Maybe.withDefault False) then
                                Systems.emitWith (\sound -> { sound | friendly = Just True, vessel = Just ship0.id }) { kind = Acoustics.Sweep, x = ship0.x, y = ship0.y, depth = Just 0, altitude = Nothing, power = 0.6 } s

                            else
                                s

                        found : Maybe Ship
                        found =
                            if beat then
                                List.filter (\v -> Mechanics.distance ship0 v < 1800) subs |> List.sortBy (Mechanics.distance ship0) |> List.head

                            else
                                Nothing

                        ( ship, watch1 ) =
                            case found of
                                Just sub ->
                                    ( { ship0 | lampFix = Just (SignalLamp.alliedFix ship0 { id = sub.id, x = sub.x, y = sub.y, depth = Maybe.withDefault 0 sub.depth, heading = sub.heading, speed = sub.speed } s.time (watch.sequence + 1)) }, { watch | sequence = watch.sequence + 1 } )

                                Nothing ->
                                    ( ship0, watch )

                        offered : Maybe LampFix
                        offered =
                            case ship.lampFix of
                                Just fix ->
                                    if watch1.lastIssue < fix.time && s.time - fix.time < 45 && Mechanics.distance s ship <= range && (Maybe.map (\c -> c.time < fix.time) candidate |> Maybe.withDefault True) then
                                        Just fix

                                    else
                                        candidate

                                Nothing ->
                                    candidate
                    in
                    ( ( ships ++ [ ship ], watch1, offered ), swept )

            ( ( ships1, watch2, candidate1 ), s1 ) =
                List.foldl observe ( ( [], watch0, Nothing ), s0 ) (List.indexedMap Tuple.pair s0.ships)

            s2 : Watching s p y d
            s2 =
                { s1 | ships = ships1 }

            -- A delivered message stands six seconds, an uncopied one three minutes.
            standing : Maybe (Transmission LampFix)
            standing =
                watch2.message
                    |> Maybe.andThen
                        (\current ->
                            case find current.estimate.sender s2.ships of
                                Just sender ->
                                    if sender.hull <= 0 || sender.disabled == Just True || (current.delivered && M.notLess (current.elapsed - Maybe.withDefault 0 current.completedAt) 6) || (not current.delivered && 180 < s2.time - current.estimate.time) then
                                        Nothing

                                    else
                                        Just current

                                Nothing ->
                                    Just current
                        )

            ( message, watch3, s3 ) =
                case ( standing, candidate1 ) of
                    ( Nothing, Just issued ) ->
                        let
                            copyingInitial : Bool
                            copyingInitial =
                                case s2.convoy |> Maybe.andThen .message of
                                    Just initial ->
                                        not initial.delivered && (initial.elapsed < 20 || not (M.isZero (toFloat initial.copied)) || initial.since /= Nothing)

                                    Nothing ->
                                        False
                        in
                        if s2.depth <= 1 && not copyingInitial then
                            let
                                live : Transmission LampFix
                                live =
                                    SignalLamp.liveTransmission issued
                            in
                            ( Just live
                            , { watch2 | lastIssue = issued.time, message = Just live }
                            , case find issued.sender s2.ships of
                                Just sender ->
                                    PatrolReports.report "allied-hail" (ConvoyWatch.signalHail sender range) s2

                                Nothing ->
                                    s2
                            )

                        else
                            ( Nothing, { watch2 | message = Nothing }, s2 )

                    _ ->
                        ( standing, { watch2 | message = standing }, s2 )
        in
        case message of
            Nothing ->
                { s3 | alliedLamp = Just watch3 }

            Just m ->
                case find m.estimate.sender s3.ships of
                    Just ship ->
                        let
                            optical : Bool
                            optical =
                                (input.observation == Just "tower" && s3.depth <= 1) || (input.observation == Just "scope" && s3.depth <= 15 && ConvoyWatch.scopeClear s3 env)

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

                            ( copied, m1 ) =
                                SignalLamp.copyLamp (dt / M.max 1 rate) (optical && input.lampInView == Just ship.id && Mechanics.distance s3 ship <= range) m

                            s4 : Watching s p y d
                            s4 =
                                { s3 | alliedLamp = Just { watch3 | message = Just m1 } }
                        in
                        if copied then
                            let
                                fix : LampFix
                                fix =
                                    m1.estimate
                            in
                            recordFix fix s4
                                |> PatrolReports.report "allied-fix"
                                    ("TELEGRAM · "
                                        ++ String.toUpper ship.name
                                        ++ " · "
                                        ++ fix.text
                                        ++ " · Sub contact plotted, "
                                        ++ String.fromFloat fix.depth
                                        ++ " m deep, "
                                        ++ String.fromFloat fix.course
                                        ++ "° at "
                                        ++ String.fromFloat fix.speed
                                        ++ " kn. Fix age "
                                        ++ String.fromInt (round (s4.time - fix.time))
                                        ++ " s."
                                    )

                        else
                            s4

                    Nothing ->
                        { s3 | alliedLamp = Just watch3 }
