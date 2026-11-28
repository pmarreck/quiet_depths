module Sim.HunterReports exposing (SavedReport, Track, playerReport, projectedReport, scatterAim, searchDuration, validReport)

{-| What a hunter knows of the player: a report of where the boat was, its
depth, course and speed, and when; the report dead-reckoned forward to now;
how long a hunter searches after losing contact; and how wide its shots
scatter. Air support and combat read these too.
-}

import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.Ship exposing (Report)
import Sim.Suspicion as Suspicion


{-| A report dead-reckoned to now, with its age.
-}
type alias Track =
    { x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , speed : Float
    , time : Float
    , reason : Maybe String
    , age : Float
    }


playerReport : { s | x : Float, y : Float, depth : Float, heading : Float, speed : Float, time : Float } -> Report
playerReport s =
    { x = s.x, y = s.y, depth = s.depth, heading = s.heading, speed = s.speed, time = s.time, reason = Nothing }


searchDuration : { s | difficulty : Maybe { d | pursuit : Maybe Float } } -> Float
searchDuration s =
    Suspicion.searchSeconds (Maybe.andThen .pursuit s.difficulty |> Maybe.withDefault 1)


{-| The report carried forward along its course for its age plus `lead`
seconds.
-}
projectedReport : Float -> Float -> Report -> Track
projectedReport time lead report =
    let
        age : Float
        age =
            M.max 0 (time - report.time)

        travel : Float
        travel =
            (age + lead) * report.speed * 0.514444

        course : Float
        course =
            Mechanics.rad report.heading
    in
    { x = report.x + sin course * travel
    , y = report.y + cos course * travel
    , depth = report.depth
    , heading = report.heading
    , speed = report.speed
    , time = report.time
    , reason = report.reason
    , age = age
    }


{-| A report as a save holds it: depth, course and speed may be missing from
legacy reports.
-}
type alias SavedReport =
    { x : Float, y : Float, time : Float, depth : Maybe Float, heading : Maybe Float, speed : Maybe Float }


finite : Float -> Bool
finite v =
    not (isNaN v || isInfinite v)


{-| Whether a saved report can be resumed: finite position and time, the time
neither negative nor in the future, and finite depth, course and speed, which
legacy reports may leave out.
-}
validReport : Float -> Bool -> SavedReport -> Bool
validReport time legacy r =
    not (not (finite r.x && finite r.y && finite r.time) || r.time < 0 || time < r.time)
        && List.all (Maybe.map finite >> Maybe.withDefault legacy) [ r.depth, r.heading, r.speed ]


{-| A point within `radius` of the target, uniform over the disc, drawing the
direction then the distance from the patrol's random stream.
-}
scatterAim : Float -> { t | x : Float, y : Float } -> { s | rng : Int } -> ( { x : Float, y : Float }, { s | rng : Int } )
scatterAim radius target s =
    let
        ( r1, rng1 ) =
            Mechanics.rand s.rng

        ( r2, rng2 ) =
            Mechanics.rand rng1

        direction : Float
        direction =
            2 * pi * r1

        offset : Float
        offset =
            radius * sqrt r2
    in
    ( { x = target.x + sin direction * offset, y = target.y + cos direction * offset }, { s | rng = rng2 } )
