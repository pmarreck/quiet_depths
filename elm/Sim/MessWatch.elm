module Sim.MessWatch exposing (Aircraft, CrewPeriod(..), CrewWatch, crewOnAlert, crewPeriod, launchWatchSeconds, messClips, messLine, periodName, recordLocalLaunch)

{-| Whether the crew is on alert, which silences the mess-deck chatter, and
what they say at meals. The crew stays alert through action stations, damage
the boat has not repaired, and any threat within 2 km: a shell, an
underwater volley, a hostile ship or a live aircraft. A launch nearby keeps
them quiet for the next 90 seconds even after the shot has ended.
-}

import PatrolMission exposing (CrewWatch(..), Mission)
import Sim.AircraftPhase exposing (Phase(..))
import Sim.Boat as Boat exposing (Limits, Systems)
import Sim.Equipment as Equipment
import Sim.FleetTheater as Theater
import Sim.FleetVolleys as Volleys exposing (Volley)
import Sim.Math as M
import Sim.Ship exposing (Pursuit(..), Ship)


launchWatchSeconds : Float
launchWatchSeconds =
    90


nearby : { a | x : Float, y : Float } -> { b | x : Float, y : Float } -> Bool
nearby a b =
    M.hypot2 (a.x - b.x) (a.y - b.y) <= 2000


{-| Remembers a launch within range, even when the crew audio is off or the
shot has already ended.
-}
recordLocalLaunch : { l | x : Float, y : Float } -> { s | x : Float, y : Float, time : Float, crewQuietUntil : Float } -> { s | x : Float, y : Float, time : Float, crewQuietUntil : Float }
recordLocalLaunch launcher s =
    if nearby s launcher then
        { s | crewQuietUntil = s.time + launchWatchSeconds }

    else
        s


type alias Aircraft a =
    { a | x : Float, y : Float, hull : Float, phase : Phase }


{-| The patrol fields the crew's watch reads.
-}
type alias CrewWatch w b c t p a =
    { w
        | x : Float
        , y : Float
        , time : Float
        , crewQuietUntil : Float
        , hull : Float
        , systems : Systems
        , repairLimits : Limits
        , fuelLeak : Float
        , fuelFire : Float
        , water : Float
        , projectiles : List { p | x : Float, y : Float }
        , battle : Maybe { b | volleys : List Volley }
        , convoy : Maybe { c | shot : Maybe Volley }
        , traffic : Maybe { t | volleys : List Volley }
        , mission : Mission
        , ships : List Ship
        , aircraft : List (Aircraft a)
        , silent : Bool
        , alert : Float
        , shock : Float
        , flood : Float
        , pressureAlarm : Int
        , gunLoudUntil : Maybe Float
    }


{-| Whether anything keeps the crew on alert; `actionStations` says whether
a combat patrol's standing alert counts.
-}
crewOnAlert : Bool -> CrewWatch w b c t p a -> Bool
crewOnAlert actionStations s =
    let
        gunLoud : Bool
        gunLoud =
            case s.gunLoudUntil of
                Just until ->
                    s.time < until

                Nothing ->
                    False
    in
    (actionStations && (PatrolMission.briefing s.mission).crewWatch == ActionStations)
        || s.silent
        || (30 < s.alert)
        || (0 < s.shock)
        || (0 < s.flood)
        || M.truthy (toFloat s.pressureAlarm)
        || gunLoud
        || (s.time < s.crewQuietUntil)
        || (0 < s.fuelLeak)
        || (0 < s.fuelFire)
        || (4 < s.water)
        || (s.hull < s.repairLimits.hull)
        || List.any (\key -> Boat.condition key s.systems < Boat.condition key s.repairLimits) Equipment.systems
        || List.any (nearby s) s.projectiles
        || List.any (\shot -> shot.underwater && nearby s (Volleys.fleetShotPose shot s.time)) (Volleys.activeVolleys s)
        || List.any (\v -> 0 < v.hull && Theater.isOpponent v && (nearby s v || v.tracking == Just Tracking || v.tracking == Just Searching)) s.ships
        || List.any (\plane -> 0 < plane.hull && plane.phase /= Gone && plane.phase /= Down && nearby s plane) s.aircraft


type CrewPeriod
    = Sleep
    | Breakfast
    | Coffee
    | Meal
    | Music
    | LightsOut


periodName : CrewPeriod -> String
periodName period =
    case period of
        Sleep ->
            "sleep"

        Breakfast ->
            "breakfast"

        Coffee ->
            "coffee"

        Meal ->
            "meal"

        Music ->
            "music"

        LightsOut ->
            "lights-out"


{-| The ship's routine at an hour of the day, if one is under way.
-}
crewPeriod : Float -> Maybe CrewPeriod
crewPeriod hour =
    if 0 <= hour && hour < 6 then
        Just Sleep

    else if 7 <= hour && hour < 8 then
        Just Breakfast

    else if 14 <= hour && hour < 15 then
        Just Coffee

    else if (12 <= hour && hour < 12.55) || (18 <= hour && hour < 18.55) then
        Just Meal

    else if 19 <= hour && hour < 23 then
        Just Music

    else if 23 <= hour && hour < 23.25 then
        Just LightsOut

    else
        Nothing


breakfast : List String
breakfast =
    [ "eggs", "morning", "coffee", "mess-a", "mess-b" ]


dinner : List String
dinner =
    [ "steak", "chicken", "ice-cream", "mmm", "horse", "elephant" ]


coffee : List String
coffee =
    [ "coffee", "mess-a" ]


{-| A line for the period, never the one just played. `choice` in [0, 1)
picks it; outside that range there is none, as in the TypeScript, where the
index falls off the list.
-}
messLine : Maybe CrewPeriod -> Float -> Maybe String -> Maybe String
messLine period choice last =
    let
        pool : List String
        pool =
            List.filter (\line -> Just line /= last)
                (case period of
                    Just Breakfast ->
                        breakfast

                    Just Coffee ->
                        coffee

                    Just Meal ->
                        dinner

                    _ ->
                        []
                )

        position : Float
        position =
            choice * toFloat (List.length pool)
    in
    if 0 <= position then
        List.drop (floor position) pool |> List.head

    else
        Nothing


{-| Every clip the mess deck can play, each once, in first-mention order.
-}
messClips : List String
messClips =
    List.foldl
        (\clip kept ->
            if List.member clip kept then
                kept

            else
                kept ++ [ clip ]
        )
        []
        (breakfast ++ dinner ++ coffee ++ [ "goodnight", "what-noise", "hear-that" ])
