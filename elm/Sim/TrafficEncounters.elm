module Sim.TrafficEncounters exposing (Traffic, Waters, encounterGroups, encounterTime, freshTraffic, halfDay, identity, resumeTraffic, temperament, visitors)

{-| Passing traffic: each twelve-hour watch rolls whether friendly and hostile
submarines and surface groups pass, at a seeded time, entering from a bearing
that keeps them in water deep enough for them. Every draw is a hash of the
patrol seed, the watch and the group, so a patrol's traffic is the same each
time it is played.
-}

import Bitwise
import PatrolMission
import Sim.Coast as Coast exposing (Coastline)
import Sim.FleetVolleys exposing (Volley)
import Sim.Math as M
import Sim.PatrolCalendar as Calendar
import Sim.Ship as Ship exposing (Ship)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Text as Text
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


{-| The patrol fields traffic arrives into.
-}
type alias Waters s p =
    { s | x : Float, y : Float, chart : Maybe Coastline, patrol : { p | seed : Float }, ships : List Ship }


type alias Traffic =
    { window : Int, next : Float, turn : Int, volleys : List Volley }


halfDay : Float
halfDay =
    Calendar.daySeconds / 2


freshTraffic : Float -> Traffic
freshTraffic time =
    { window = floor (time / halfDay) - 1, next = 0, turn = 0, volleys = [] }


{-| When the watch's traffic arrives: 90 seconds in, plus a seeded share of
most of the watch.
-}
encounterTime : Float -> Int -> Float
encounterTime seed window =
    halfDay * toFloat window + 90 + hash01 seed (toFloat (81000 + window * 100)) * (0.91 * halfDay)


{-| Traffic for a patrol resumed at `time`: the current watch counts as
visited once its arrival time has passed.
-}
resumeTraffic : Float -> Float -> Traffic
resumeTraffic time seed =
    let
        traffic : Traffic
        traffic =
            freshTraffic time

        window : Int
        window =
            floor (time / halfDay)
    in
    if M.notLess time (encounterTime seed window) then
        { traffic | window = window }

    else
        traffic


encounterGroups : Float -> Int -> { friendlySub : Bool, hostileSub : Bool, friendlySurface : Bool, hostileSurface : Bool }
encounterGroups seed window =
    let
        roll : Int -> Float
        roll i =
            hash01 seed (toFloat (81000 + 100 * window + i))

        odds : PatrolMission.EncounterOdds
        odds =
            PatrolMission.encounterOdds
    in
    { friendlySub = roll 1 < odds.friendlySub
    , hostileSub = roll 2 < odds.hostileSub
    , friendlySurface = roll 3 < odds.friendlySurface
    , hostileSurface = roll 4 < odds.hostileSurface
    }


{-| The TypeScript's string hash: iterating a string with `for...of` visits
code points, and `charCodeAt(0)` reads each one's first UTF-16 unit. A low
surrogate completing a pair is therefore skipped.
-}
identity : String -> Int
identity id =
    let
        step : Int -> ( Int, Bool ) -> ( Int, Bool )
        step unit ( n, afterHigh ) =
            if afterHigh && 0xDC00 <= unit && unit <= 0xDFFF then
                ( n, False )

            else
                ( Bitwise.shiftRightZfBy 0 (M.imul n 31 + unit), 0xD800 <= unit && unit <= 0xDBFF )
    in
    List.foldl step ( 17, False ) (Text.codeUnits id) |> Tuple.first


{-| How readily a ship of this patrol picks a fight, from 0 to 1.
-}
temperament : Float -> String -> Float
temperament seed id =
    hash01 seed (toFloat (identity id))


passageNames : List String
passageNames =
    [ "Petrel", "Fulmar", "Sanderling", "Gannet", "Curlew", "Tern", "Teal", "Avocet" ]


{-| The watch's traffic enters the area, each group trying sixteen bearings
for a passage deep enough (30 m for submarines, 10 m otherwise); `arrive`
announces each ship.
-}
visitors : Int -> (Ship -> Waters s p -> Waters s p) -> Waters s p -> Waters s p
visitors window arrive start =
    let
        seed : Float
        seed =
            start.patrol.seed

        g : { friendlySub : Bool, hostileSub : Bool, friendlySurface : Bool, hostileSurface : Bool }
        g =
            encounterGroups seed window

        group : ( Int, Bool ) -> Waters s p -> Waters s p
        group ( index, present ) s =
            if present then
                arrivals window index arrive s

            else
                s
    in
    List.foldl group start [ ( 0, g.friendlySub ), ( 1, g.hostileSub ), ( 2, g.friendlySurface ), ( 3, g.hostileSurface ) ]


arrivals : Int -> Int -> (Ship -> Waters s p -> Waters s p) -> Waters s p -> Waters s p
arrivals window index arrive s =
    let
        roll : Int -> Float
        roll n =
            hash01 s.patrol.seed (toFloat (81010 + window * 100 + index * 18 + n))

        sub : Bool
        sub =
            index < 2

        offset : Float
        offset =
            1150 + roll 1 * 1750

        count : Int
        count =
            if sub || roll 2 < 0.52 then
                1

            else
                2 + floor (roll 3 * 3)

        startAngle : Float
        startAngle =
            roll 0 * pi * 2

        points : Float -> List { x : Float, y : Float }
        points angle =
            List.map (\i -> { x = s.x + offset * sin angle + toFloat i * 140, y = s.y + offset * cos angle - toFloat i * 170 }) (List.range 0 (count - 1))

        deepEnough : { x : Float, y : Float } -> Bool
        deepEnough p =
            (if sub then
                30

             else
                10
            )
                < Coast.chartDepth s.chart p.x p.y

        passage : Maybe ( Float, List { x : Float, y : Float } )
        passage =
            List.range 0 15
                |> List.map (\trial -> startAngle + toFloat trial * pi / 8)
                |> List.filter (\angle -> List.all deepEnough (points angle))
                |> List.head
                |> Maybe.map (\angle -> ( angle, points angle ))
    in
    case passage of
        Nothing ->
            s

        Just ( angle, positions ) ->
            let
                side : Side
                side =
                    if modBy 2 index == 1 then
                        Hostile

                    else
                        Friendly
            in
            List.foldl
                (\( i, position ) state ->
                    let
                        ship : Ship
                        ship =
                            passer window index count i angle sub side position roll state.chart
                    in
                    arrive ship { state | ships = state.ships ++ [ ship ] }
                )
                s
                (List.indexedMap Tuple.pair positions)


passer : Int -> Int -> Int -> Int -> Float -> Bool -> Side -> { x : Float, y : Float } -> (Int -> Float) -> Maybe Coastline -> Ship
passer window index count i angle sub side position roll chart =
    let
        name : String
        name =
            (List.drop (floor (roll (6 + i) * 8)) passageNames |> List.head |> Maybe.withDefault "")
                ++ " "
                ++ String.fromInt (window + 1)
                ++ "-"
                ++ String.fromInt (index + 1)
                ++ (if M.isZero (toFloat i) then
                        ""

                    else
                        String.fromChar (Char.fromCode (65 + i))
                   )

        base : Ship
        base =
            Ship.fresh
                { id = "passage-" ++ String.fromInt window ++ "-" ++ String.fromInt index ++ "-" ++ String.fromInt i
                , name = name
                , kind =
                    if sub then
                        Submarine

                    else
                        let
                            escort : Bool
                            escort =
                                M.isZero (toFloat i) && (count > 1 || roll 4 < 0.65)
                        in
                        if escort then
                            Surface Escort

                        else
                            Surface Merchant
                , x = position.x
                , y = position.y
                , heading = M.remainder (angle * 180 / pi + 145 + roll 12 * 70) 360
                , speed =
                    if sub then
                        4

                    else
                        6
                }
    in
    { base
        | military = Just True
        , side = Just side
        , depth =
            Just
                (if sub then
                    M.min (35 + roll 5 * 35) (Coast.chartDepth chart position.x position.y - 8)

                 else
                    0
                )
        , sinkDepth = Just 0
        , incidental = Just True
        , flood = Just 0
        , disabled = Just False
    }
