module Sim.FleetTheater exposing (Area, Battle, affiliation, classifyEcho, fleetTheater, friendlyLead, isOpponent, sidesAfloat)

{-| The fleet action's stage: two task groups of four, friendly and hostile,
laid out from the patrol's seed around their planned patrol areas; counts of
each side afloat; and how a sonar echo or a contact reads its affiliation.
-}

import Sim.FleetVolleys exposing (Volley)
import Sim.Math as M
import Sim.Ship exposing (Ship)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


type alias Area =
    { x : Float, y : Float, label : String, radius : Float }


type alias Battle =
    { areas : List Area, volleys : List Volley, round : Int, next : Float }


isOpponent : { v | military : Maybe Bool, side : Maybe Side } -> Bool
isOpponent v =
    v.military == Just True && v.side /= Just Friendly


sidesAfloat : List { v | side : Maybe Side, hull : Float, incidental : Maybe Bool } -> { friendly : Int, hostile : Int }
sidesAfloat ships =
    List.foldl
        (\v counts ->
            if v.incidental /= Just True && v.hull > 0 then
                case v.side of
                    Just Friendly ->
                        { counts | friendly = counts.friendly + 1 }

                    Just Hostile ->
                        { counts | hostile = counts.hostile + 1 }

                    Nothing ->
                        counts

            else
                counts
        )
        { friendly = 0, hostile = 0 }
        ships


friendlyLead : List { v | side : Maybe Side, hull : Float, incidental : Maybe Bool } -> Int
friendlyLead ships =
    let
        counts : { friendly : Int, hostile : Int }
        counts =
            sidesAfloat ships
    in
    counts.friendly - counts.hostile


names : Side -> Int -> String
names side i =
    let
        list : List String
        list =
            case side of
                Friendly ->
                    [ "Lark", "Marlin", "Calliope", "Nacre" ]

                Hostile ->
                    [ "Flint", "Tempest", "Greywing", "Basalt" ]
    in
    List.drop i list |> List.head |> Maybe.withDefault ""


sideName : Side -> String
sideName side =
    case side of
        Friendly ->
            "friendly"

        Hostile ->
            "hostile"


theaterShip : { id : String, name : String, side : Side, sub : Bool, x : Float, y : Float, depth : Float, heading : Float, speed : Float } -> Ship
theaterShip v =
    { id = v.id
    , name = v.name
    , kind =
        if v.sub then
            Submarine

        else
            Surface Escort
    , x = v.x
    , y = v.y
    , heading = v.heading
    , speed = v.speed
    , hull = 100
    , alert = 0
    , attack = 0
    , military = Just True
    , side = Just v.side
    , depth = Just v.depth
    , sinkDepth = Just 0
    , flood = Just 0
    , disabled = Just False
    , playerDamaged = Nothing
    , neutralHitAt = Nothing
    , wreckMark = Nothing
    , lampFix = Nothing
    , nextSweep = Nothing
    , incidental = Nothing
    , roll = Nothing
    , verticalSpeed = Nothing
    , fixedWreck = Nothing
    , groundedAt = Nothing
    , clue = Nothing
    , nextInquiry = Nothing
    , report = Nothing
    , tracking = Nothing
    , patrolSpeed = Nothing
    , lastAttackAt = Nothing
    , parley = Nothing
    , lights = Nothing
    , blackout = Nothing
    , pitch = Nothing
    , noise = Nothing
    , torpedoDecoys = Nothing
    , lastTubeSide = Nothing
    , lastHitLog = Nothing
    , directHits = Nothing
    , settled = Nothing
    , sunkAt = Nothing
    , nextCreak = Nothing
    , collapsed = Nothing
    , collapsedAt = Nothing
    , fighterCount = Nothing
    }


{-| The two task groups and their patrol areas, laid out from the patrol's
origin and seed.
-}
fleetTheater : { a | x : Float, y : Float } -> Float -> { ships : List Ship, battle : Battle }
fleetTheater origin seed =
    let
        h : Float -> Float
        h n =
            hash01 seed (1200 + n)

        east : Float
        east =
            if h 0 < 0.5 then
                -1

            else
                1

        center : { x : Float, y : Float }
        center =
            { x = origin.x + east * 250, y = origin.y + 1300 }

        surfaceArea : Area
        surfaceArea =
            { x = center.x - east * 540, y = center.y + 100, radius = 560, label = "Friendly surface patrol area" }

        subArea : Area
        subArea =
            { x = center.x - east * 250, y = center.y - 500, radius = 440, label = "Friendly submarine patrol area" }

        ship : Side -> Int -> Ship
        ship side i =
            let
                sub : Bool
                sub =
                    i == 3

                area : Area
                area =
                    if sub then
                        subArea

                    else
                        surfaceArea

                offset : Float
                offset =
                    if side == Friendly then
                        0

                    else
                        4

                angle : Float
                angle =
                    2 * pi * (toFloat i / 3 + h (1 + offset) * 0.28)

                radius : Float
                radius =
                    (0.45 + 0.4 * h (10 + toFloat i + offset)) * area.radius

                ( ax, ay ) =
                    if side == Friendly then
                        ( area.x, area.y )

                    else
                        ( 2 * center.x - area.x, 2 * center.y - area.y )
            in
            theaterShip
                { id = sideName side ++ "-" ++ String.fromInt (i + 1)
                , name = names side i
                , side = side
                , sub = sub
                , x = ax + cos angle * radius
                , y = ay + sin angle * radius
                , depth =
                    if sub then
                        38 + toFloat (floor (36 * h (30 + offset)))

                    else
                        0
                , heading = h (40 + toFloat i + offset) * 360
                , speed =
                    if sub then
                        3

                    else
                        4 + toFloat i * 0.5
                }
    in
    { ships = List.concatMap (\side -> List.map (ship side) (List.range 0 3)) [ Friendly, Hostile ]
    , battle = { areas = [ surfaceArea, subArea ], volleys = [], round = 0, next = 0 }
    }


{-| A sonar echo's affiliation from the sailing plan, never from the live
contact: friendly hulls near their planned area read friendly more often.
-}
classifyEcho : Battle -> { v | kind : Kind, side : Maybe Side } -> { o | x : Float, y : Float } -> Float -> Maybe Side
classifyEcho battle ship observation roll =
    let
        area : Area
        area =
            List.drop
                (if ship.kind == Submarine then
                    1

                 else
                    0
                )
                battle.areas
                |> List.head
                |> Maybe.withDefault { x = 0 / 0, y = 0 / 0, label = "", radius = 0 / 0 }

        nearPlan : Bool
        nearPlan =
            M.hypot2 (observation.x - area.x) (observation.y - area.y) < area.radius * 1.8
    in
    if
        ship.side
            == Just Friendly
            && roll
            < (if nearPlan then
                0.88

               else
                0.62
              )
    then
        Just Friendly

    else if ship.side == Just Hostile && roll < 0.28 then
        Just Hostile

    else
        Nothing


affiliation : { c | side : Maybe Side, probableSide : Maybe Side, military : Maybe Bool, identified : Maybe Bool } -> String
affiliation c =
    case ( c.side, c.probableSide ) of
        ( Just Friendly, _ ) ->
            "FRIENDLY"

        ( Just Hostile, _ ) ->
            "HOSTILE"

        ( Nothing, Just Friendly ) ->
            "PROBABLE FRIENDLY"

        ( Nothing, Just Hostile ) ->
            "PROBABLE HOSTILE"

        ( Nothing, Nothing ) ->
            if c.identified == Just True then
                if c.military == Just True then
                    "MILITARY"

                else
                    "NEUTRAL"

            else
                ""
