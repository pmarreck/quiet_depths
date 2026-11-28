module Sim.Operation exposing (Conditions, Operation, Setting, casualtyDeadline, decoder, encode, operationApproach, operationConditions, rescueCriteria, setupOperation, startRescue)

{-| A rescue or survey: the site its mission makes, the boat's approach and
station keeping beside it, and the operation's tally of survivors, scans and
photographs. Survivors move one at a time, so their counts are whole.
-}

import Json.Decode as D exposing (Decoder)
import Json.Encode as E
import PatrolCriteria exposing (RescueCriteria)
import PatrolMission exposing (Mission(..))
import Sim.Coast as Coast exposing (Coastline)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.PatrolSearch exposing (SearchArea)
import Sim.RescueOperation as RescueOperation
import Sim.Ship exposing (Ship)
import Sim.Site as Site exposing (Kind(..), Site)
import Sim.Status as Status exposing (Status)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


type alias Operation =
    { rescued : Int
    , remaining : Int
    , dead : Int
    , known : Bool
    , assessment : Float
    , boarding : Float
    , diverReturn : Float
    , holding : Bool
    , active : Bool
    , scan : Float
    , photoAngles : List Float
    , lastCasualty : Float
    , completed : Bool
    , find : Maybe String
    }


{-| A saved operation, as restore accepts it: whole survivor counts and
clocks that are never negative, its flags, finite photograph angles, and a
find that is text once made (a save from before finds has none).
-}
decoder : Decoder Operation
decoder =
    let
        count : String -> Decoder Int
        count key =
            D.field key D.int |> D.andThen (atLeastZero toFloat)

        clock : String -> Decoder Float
        clock key =
            D.field key D.float |> D.andThen (atLeastZero identity)

        atLeastZero : (a -> Float) -> a -> Decoder a
        atLeastZero toNumber v =
            if 0 <= toNumber v then
                D.succeed v

            else
                D.fail "an operation's counts and clocks are never negative"
    in
    D.succeed Operation
        |> andMap (count "rescued")
        |> andMap (count "remaining")
        |> andMap (count "dead")
        |> andMap (D.field "known" D.bool)
        |> andMap (clock "assessment")
        |> andMap (clock "boarding")
        |> andMap (clock "diverReturn")
        |> andMap (D.field "holding" D.bool)
        |> andMap (D.field "active" D.bool)
        |> andMap (clock "scan")
        |> andMap (D.field "photoAngles" (D.list D.float))
        |> andMap (clock "lastCasualty")
        |> andMap (D.field "completed" D.bool)
        |> andMap (D.maybe (D.field "find" D.value) |> D.andThen (\present -> present |> Maybe.map (\_ -> D.field "find" (D.nullable D.string)) |> Maybe.withDefault (D.succeed Nothing)))


andMap : Decoder a -> Decoder (a -> b) -> Decoder b
andMap =
    D.map2 (|>)


{-| An operation as a save writes it; a find not yet made is null.
-}
encode : Operation -> E.Value
encode o =
    E.object
        [ ( "rescued", E.int o.rescued )
        , ( "remaining", E.int o.remaining )
        , ( "dead", E.int o.dead )
        , ( "known", E.bool o.known )
        , ( "assessment", E.float o.assessment )
        , ( "boarding", E.float o.boarding )
        , ( "diverReturn", E.float o.diverReturn )
        , ( "holding", E.bool o.holding )
        , ( "active", E.bool o.active )
        , ( "scan", E.float o.scan )
        , ( "photoAngles", E.list E.float o.photoAngles )
        , ( "lastCasualty", E.float o.lastCasualty )
        , ( "completed", E.bool o.completed )
        , ( "find", Maybe.map E.string o.find |> Maybe.withDefault E.null )
        ]


{-| The boat's range from the site, the depth it keeps there, and whether it
is on station and holding.
-}
type alias Conditions =
    { range : Float, depth : Float, onStation : Bool, holding : Bool }


{-| The rules a site's kind sets; with no site, the undersea rules.
-}
rescueCriteria : { s | site : Maybe Site } -> RescueCriteria
rescueCriteria s =
    RescueOperation.criteriaFor (Maybe.map .kind s.site)


{-| Where the chart's approach marker stands once the site is known: west of
it, at the surface for a surface casualty or eleven meters above the site.
-}
operationApproach : { s | site : Maybe Site, search : Maybe SearchArea } -> Maybe { x : Float, y : Float, depth : Float, radius : Float }
operationApproach s =
    case s.site of
        Just site ->
            if Maybe.map .located s.search == Just False then
                Nothing

            else
                Just
                    { x = site.x - 55
                    , y = site.y
                    , depth =
                        if site.kind == SurfaceCasualty then
                            0

                        else
                            M.max 0 (site.depth - 11)
                    , radius = 8
                    }

        Nothing ->
            Nothing


operationConditions : { s | x : Float, y : Float, speed : Float, depth : Float, site : Maybe Site } -> Maybe Conditions
operationConditions s =
    Maybe.map
        (\site ->
            let
                range : Float
                range =
                    Mechanics.distance s site

                depth : Float
                depth =
                    if site.kind == SurfaceCasualty then
                        0

                    else
                        site.depth - 11

                keeping : RescueOperation.StationKeeping
                keeping =
                    RescueOperation.stationKeeping range s.speed (s.depth - depth) (RescueOperation.criteriaFor (Just site.kind))
            in
            { range = range, depth = depth, onStation = keeping.onStation, holding = keeping.holding }
        )
        s.site


{-| When the next survivor is lost: the first loss and each later one draw
their own delay.
-}
casualtyDeadline : { s | patrol : { p | seed : Float }, site : Maybe Site } -> Operation -> Float
casualtyDeadline s o =
    let
        draw : Float
        draw =
            if M.isZero (toFloat o.dead) then
                821

            else
                822 + toFloat o.dead
    in
    o.lastCasualty + RescueOperation.nextLossDelay o.dead (hash01 s.patrol.seed draw) (rescueCriteria s)


{-| The patrol fields a rescue's start and setup read and write.
-}
type alias Setting s p d =
    { s
        | x : Float
        , y : Float
        , depth : Float
        , targetDepth : Float
        , heading : Float
        , targetHeading : Float
        , speed : Float
        , targetSpeed : Float
        , scope : Bool
        , time : Float
        , status : Status
        , mission : Mission
        , route : Maybe { x : Float, y : Float, radius : Maybe Float }
        , home : { x : Float, y : Float }
        , chart : Maybe Coastline
        , patrol : { p | seed : Float }
        , difficulty : Maybe { d | longPatrol : Maybe Bool }
        , ships : List Ship
        , site : Maybe Site
        , operation : Maybe Operation
        , events : List LogEntry
    }


{-| Starting the transfers once on station: the helm stops, the boat takes
rescue depth, and the team reports.
-}
startRescue : Setting s p d -> ( Bool, Setting s p d )
startRescue s =
    case ( operationConditions s, s.operation ) of
        ( Just c, Just o ) ->
            if c.onStation && s.status == Status.Patrol && s.mission /= Survey && not o.completed then
                ( True
                , Mechanics.log
                    (if c.holding then
                        "Rescue team on station. Hold here for transfers."

                     else
                        "Holding station. Moving to rescue depth."
                    )
                    Info
                    { s | route = Nothing, targetSpeed = 0, targetDepth = c.depth }
                )

            else
                ( False, s )

        _ ->
            ( False, s )


siteKindOf : Mission -> Maybe Site.Kind
siteKindOf mission =
    case mission of
        UnderseaRescue ->
            Just DownedSubmarine

        SurfaceRescue ->
            Just SurfaceCasualty

        Survey ->
            Just SurveyWreck

        Recon ->
            Nothing

        Intercept ->
            Nothing

        Convoy ->
            Nothing

        BigKahuna ->
            Nothing

        SubHunt ->
            Nothing

        Transit ->
            Nothing

        Shadow ->
            Nothing

        Tiebreaker ->
            Nothing

        Henhouse ->
            Nothing


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


{-| A rescue or survey's site and operation, from the patrol's seed: the boat
starts southwest of the site heading for it, the escort Kestrel patrols to
the northeast, alert when a hunter is about, and only a hostile rescue keeps
its escort and submarines.
-}
setupOperation : Float -> Setting s p d -> Setting s p d
setupOperation seed s0 =
    let
        s : Setting s p d
        s =
            { s0 | site = Nothing, operation = Nothing }
    in
    case siteKindOf s.mission of
        Nothing ->
            s

        Just kind ->
            let
                h : Float -> Float
                h =
                    hash01 seed

                x : Float
                x =
                    1430 + h 801 * 330

                y : Float
                y =
                    420 + h 802 * 450

                pick3 : String -> String -> String -> String
                pick3 a b c =
                    case floor (h 804 * 3) of
                        0 ->
                            a

                        1 ->
                            b

                        _ ->
                            c

                rules : RescueCriteria
                rules =
                    RescueOperation.criteriaFor (Just kind)

                site : Site
                site =
                    { x = x
                    , y = y
                    , hull = 100
                    , depth =
                        case rules.sinking of
                            Just sinking ->
                                sinking.startDepth

                            Nothing ->
                                Coast.chartDepth s.chart x y - 5
                    , heading = 35 + h 803 * 100
                    , kind = kind
                    , name =
                        case kind of
                            SurfaceCasualty ->
                                pick3 "R/V Halcyon" "M/V Solway" "R/V Northstar"

                            SurveyWreck ->
                                pick3 "SS Aster, 1912" "SS Caledonia, 1906" "SS Pelican, 1921"

                            DownedSubmarine ->
                                pick3 "SS-118 Lantern" "SS-142 Cormorant" "SS-107 Narwhal"
                    }

                start : { x : Float, y : Float }
                start =
                    { x = x - 260 - h 805 * 120, y = y - 200 - h 806 * 180 }

                heading : Float
                heading =
                    Mechanics.bearing start site

                depth : Float
                depth =
                    if kind == SurfaceCasualty then
                        0

                    else
                        35 + toFloat (floor (h 807 * 20))

                hostile : Bool
                hostile =
                    0.4 < h 813

                posted : List Ship
                posted =
                    updateFirst "kestrel"
                        (\v ->
                            { v
                                | x = x + 1200
                                , y = y + 700
                                , heading = 230
                                , speed = 5
                                , alert =
                                    if hostile then
                                        35

                                    else
                                        0
                            }
                        )
                        s.ships

                text : String
                text =
                    if s.difficulty |> Maybe.andThen .longPatrol |> Maybe.withDefault False then
                        "Last report received. Search the briefed area for the mission site."

                    else if kind == SurveyWreck then
                        "Wreck coordinates received. Plot an approach and inspect the reef shelf."

                    else
                        "Distress coordinates received. Survivor count unknown. Time matters."
            in
            Mechanics.log text
                Info
                { s
                    | site = Just site
                    , operation =
                        Just
                            { rescued = 0
                            , remaining = RescueOperation.initialSurvivors (h 811) (h 812) rules
                            , dead = 0
                            , known = False
                            , assessment = 0
                            , boarding = 0
                            , diverReturn = 0
                            , holding = False
                            , active = False
                            , scan = 0
                            , photoAngles = []
                            , lastCasualty = rules.casualtyClockStart
                            , completed = False
                            , find = Nothing
                            }
                    , x = start.x
                    , y = start.y
                    , depth = depth
                    , targetDepth = depth
                    , heading = heading
                    , targetHeading = heading
                    , speed = 3
                    , targetSpeed = 3
                    , scope = kind == SurfaceCasualty
                    , home = { x = start.x - 250 - h 808 * 150, y = start.y - 350 - h 809 * 180 }
                    , ships =
                        -- Civil traffic stays distant; an optional hunter is the pressure on a rescue.
                        if not hostile || kind == SurveyWreck then
                            List.filter (\v -> v.kind /= Surface Escort && v.kind /= Submarine) posted

                        else
                            posted
                }
