module Sim.AirSupport exposing (AirReport, AirSupport, Aircraft, Skies, Sortie(..), fromReport, raiseCarrierAlarm, requestSupport, sortieName, sorties, toReport)

{-| Enemy air support: hunters that hold the player in their sights call for
aircraft, which arm and launch from the carrier's deck or the island
airstrip; a strike on the carrier scrambles its fighters at once. Flying
the sortie is `Sim.AircraftFlight`.
-}

import PatrolMission exposing (Mission(..))
import Sim.AircraftPhase exposing (Phase(..))
import Sim.Boat exposing (Systems)
import Sim.Carrier as Carrier
import Sim.Coast as Coast exposing (Coastline)
import Sim.ColdWatch as ColdWatch
import Sim.Debrief as Debrief
import Sim.FleetTheater as FleetTheater
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.Ordnance exposing (Aloft, Blast, Round)
import Sim.Ship exposing (Report, Ship)
import Sim.Sound exposing (Sound)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


{-| Where the sortie stands: nothing asked for, aircraft arming, aircraft
airborne, or the sortie spent.
-}
type Sortie
    = Idle
    | Arming
    | Airborne
    | Spent


sortieName : Sortie -> String
sortieName sortie =
    case sortie of
        Idle ->
            "idle"

        Arming ->
            "arming"

        Airborne ->
            "airborne"

        Spent ->
            "spent"


{-| Every sortie state, built so that a new one cannot be left out: the
`case` in `after` stops compiling until it is given a successor.
-}
sorties : List Sortie
sorties =
    let
        after : Sortie -> Maybe Sortie
        after sortie =
            case sortie of
                Idle ->
                    Just Arming

                Arming ->
                    Just Airborne

                Airborne ->
                    Just Spent

                Spent ->
                    Nothing

        from : Sortie -> List Sortie
        from sortie =
            sortie :: (Maybe.map from (after sortie) |> Maybe.withDefault [])
    in
    from Idle


{-| What the aircraft were last told of the player. A report saved before
reports carried a depth, course and speed may lack them.
-}
type alias AirReport =
    { x : Float, y : Float, time : Float, depth : Maybe Float, heading : Maybe Float, speed : Maybe Float, reason : Maybe String }


fromReport : Report -> AirReport
fromReport r =
    { x = r.x, y = r.y, time = r.time, depth = Just r.depth, heading = Just r.heading, speed = Just r.speed, reason = r.reason }


{-| The report as a hunter's, for projecting it: a report without a course or
speed is projected standing still, as the TypeScript's `?? 0` does. Its depth
is carried along but not projected.
-}
toReport : AirReport -> Report
toReport r =
    { x = r.x
    , y = r.y
    , depth = Maybe.withDefault 0 r.depth
    , heading = Maybe.withDefault 0 r.heading
    , speed = Maybe.withDefault 0 r.speed
    , time = r.time
    , reason = r.reason
    }


type alias AirSupport =
    { status : Sortie, requestedAt : Maybe Float, launchAt : Maybe Float, base : { x : Float, y : Float }, lastKnown : Maybe AirReport }


type alias Aircraft =
    { id : String
    , name : String
    , x : Float
    , y : Float
    , altitude : Float
    , heading : Float
    , speed : Float
    , hull : Float
    , phase : Phase
    , takeoffUntil : Float
    , attack : Float
    , bank : Float
    , bombDropped : Bool
    , previous : Maybe Aloft
    , egress : Maybe Float
    }


{-| The patrol fields air support reads and writes.
-}
type alias Skies s p d =
    { s
        | x : Float
        , y : Float
        , depth : Float
        , heading : Float
        , speed : Float
        , time : Float
        , mission : Mission
        , rng : Int
        , patrol : { p | seed : Float }
        , chart : Maybe Coastline
        , difficulty : Maybe { d | airSupport : Maybe Bool, detection : Maybe Float, pursuit : Maybe Float }
        , systems : Systems
        , scope : Bool
        , scopeTravel : Maybe Float
        , ships : List Ship
        , aircraft : List Aircraft
        , airSupport : AirSupport
        , blasts : List Blast
        , gunRounds : List Round
        , weaponSequence : Int
        , soundSequence : Int
        , acoustics : List Sound
        , invalid : List InvalidNumber
        , events : List LogEntry
        , debrief : List Debrief.Entry
    }


{-| A strike raises the alarm at the impact site, with no shooter position
known: the carrier scrambles its fighters, when air support is enabled, and
every escort afloat comes to at least 60 alert.
-}
raiseCarrierAlarm : Ship -> Skies s p d -> Skies s p d
raiseCarrierAlarm carrier s =
    let
        armed : Skies s p d
        armed =
            if s.airSupport.status == Idle && Maybe.andThen .airSupport s.difficulty == Just True then
                let
                    alarm : AirReport
                    alarm =
                        { x = carrier.x, y = carrier.y, time = s.time, depth = Just 0, heading = Just 0, speed = Just 0, reason = Just "an explosion near the carrier" }
                in
                prepareSortie (Just carrier) alarm s

            else
                s

        alerted : Ship -> Ship
        alerted escort =
            if escort.kind == Surface Escort && 0 < escort.hull then
                { escort | alert = M.max 60 escort.alert }

            else
                escort
    in
    { armed | ships = List.map alerted armed.ships }


{-| Aircraft arm on the report: two seconds on the carrier's deck, 45 to 59
on the island.
-}
prepareSortie : Maybe Ship -> AirReport -> Skies s p d -> Skies s p d
prepareSortie carrier report s =
    let
        support : AirSupport
        support =
            s.airSupport

        ( wait, text ) =
            case carrier of
                Just _ ->
                    ( 2, "Intercepted flight-deck alarm. Fighters scrambling." )

                Nothing ->
                    ( 45 + toFloat (floor (hash01 s.patrol.seed 591 * 15)), "Intercepted radio traffic. Island aircraft are preparing to launch." )
    in
    { s | airSupport = { support | lastKnown = Just report, status = Arming, requestedAt = Just s.time, launchAt = Just (s.time + wait) } }
        |> Mechanics.log text Warning


setStatus : Sortie -> Skies s p d -> Skies s p d
setStatus status s =
    let
        support : AirSupport
        support =
            s.airSupport
    in
    { s | airSupport = { support | status = status } }


{-| A hunter that may attack the player and saw the boat within four seconds
calls in its report, unless a noisemaker fooled it or a newer report is
already in: the first call arms a sortie. Once armed and due, the aircraft
launch. On the carrier mission the deck is the base while the carrier
floats; once she is sunk, an unlaunched sortie is spent.
-}
requestSupport : Skies s p d -> Skies s p d
requestSupport s =
    if Maybe.andThen .airSupport s.difficulty == Just False then
        s

    else
        let
            carrier : Maybe Ship
            carrier =
                if s.mission == BigKahuna then
                    List.filter (\v -> v.id == Carrier.carrierId) s.ships |> List.head

                else
                    Nothing

            deckOpen : Bool
            deckOpen =
                Maybe.map (\c -> 0 < c.hull) carrier |> Maybe.withDefault False

            based : Skies s p d
            based =
                case carrier of
                    Just c ->
                        let
                            support : AirSupport
                            support =
                                s.airSupport
                        in
                        { s
                            | airSupport =
                                { support
                                    | base =
                                        if deckOpen then
                                            { x = c.x, y = c.y }

                                        else
                                            { x = -3200, y = 3400 }
                                }
                        }

                    Nothing ->
                        s
        in
        if based.airSupport.status == Spent then
            based

        else if carrier /= Nothing && not deckOpen && based.airSupport.status /= Airborne then
            setStatus Spent based

        else
            launch carrier (List.foldl (hear carrier) based based.ships)


hear : Maybe Ship -> Ship -> Skies s p d -> Skies s p d
hear carrier v s =
    case v.report of
        Just report ->
            let
                support : AirSupport
                support =
                    s.airSupport

                newest : Float
                newest =
                    Maybe.map .time support.lastKnown |> Maybe.withDefault 0
            in
            if not (FleetTheater.isOpponent v) || v.hull <= 0 || v.alert <= 55 || not (ColdWatch.canAttackPlayer s v) || report.reason == Just "noisemaker" || 4 < s.time - report.time || report.time < newest then
                s

            else if support.status == Idle then
                prepareSortie carrier (fromReport report) s

            else
                { s | airSupport = { support | lastKnown = Just (fromReport report) } }

        Nothing ->
            s


{-| An armed sortie launches when due: the carrier's fighters along her deck,
or two attack aircraft from the island airstrip.
-}
launch : Maybe Ship -> Skies s p d -> Skies s p d
launch carrier s =
    let
        support : AirSupport
        support =
            s.airSupport
    in
    -- The TypeScript compares with a missing launch time as 0.
    if support.status /= Arming || s.time < Maybe.withDefault 0 support.launchAt then
        s

    else
        let
            count : Int
            count =
                case carrier of
                    Just c ->
                        floor (Maybe.withDefault 0 c.fighterCount)

                    Nothing ->
                        2

            plane : Int -> ( Int, List Aircraft ) -> ( Int, List Aircraft )
            plane i ( sequence, planes ) =
                ( sequence + 1, planes ++ [ aircraftAt carrier support.base s i sequence ] )

            ( nextSequence, launched ) =
                List.foldl plane ( s.weaponSequence, [] ) (List.range 0 (count - 1))

            text : String
            text =
                case carrier of
                    Just _ ->
                        "Flight-deck transmission. "
                            ++ (if count == 1 then
                                    "One fighter is"

                                else
                                    String.fromInt count ++ " fighters are"
                               )
                            ++ " airborne."

                    Nothing ->
                        "Aircraft airborne from Greybank. They still have to reach the patrol area."
        in
        { s | airSupport = { support | status = Airborne }, aircraft = s.aircraft ++ launched, weaponSequence = nextSequence }
            |> Mechanics.log text Warning


aircraftAt : Maybe Ship -> { x : Float, y : Float } -> Skies s p d -> Int -> Int -> Aircraft
aircraftAt carrier base s i sequence =
    let
        heading : Float
        heading =
            Maybe.map .heading carrier |> Maybe.withDefault 45

        ( position, altitude, name ) =
            case carrier of
                Just c ->
                    let
                        along : Float
                        along =
                            25 - toFloat i * 18
                    in
                    ( { x = c.x + sin (Mechanics.rad heading) * along, y = c.y + cos (Mechanics.rad heading) * along }
                    , Carrier.carrierSize.deckHeight + 2
                    , "Carrier fighter "
                    )

                Nothing ->
                    ( { x = base.x - toFloat i * 20, y = base.y }
                    , M.max 8 (negate (Coast.chartDepth s.chart base.x base.y) + 8 + toFloat i * 12)
                    , "Island attack aircraft "
                    )
    in
    { id = "air-" ++ String.fromInt sequence
    , name = name ++ String.fromInt (i + 1)
    , x = position.x
    , y = position.y
    , altitude = altitude
    , heading = heading
    , speed = 70
    , hull = 100
    , phase = Takeoff
    , takeoffUntil =
        s.time
            + (if carrier == Nothing then
                6

               else
                2
              )
    , attack = 0
    , bank = 0
    , bombDropped = False
    , previous = Nothing
    , egress = Nothing
    }
