module SimHarness.MessWatch exposing (function)

{-| Harness entries for the crew's watch and the mess deck.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.AircraftPhase as AircraftPhase exposing (Phase)
import Sim.Boat exposing (Limits, Systems)
import Sim.FleetVolleys exposing (Volley)
import Sim.MessWatch as MessWatch exposing (CrewPeriod(..))
import Sim.Ship as Ship exposing (Ship)
import SimHarness.Codec exposing (andMap, arg)
import SimHarness.Fleet exposing (optional, shots)
import SimHarness.Patrol exposing (limits, systems)


type alias Point =
    { x : Float, y : Float }


type alias Plane =
    { x : Float, y : Float, hull : Float, phase : Phase }


type alias Watch =
    { x : Float
    , y : Float
    , time : Float
    , crewQuietUntil : Float
    , hull : Float
    , systems : Systems
    , repairLimits : Limits
    , fuelLeak : Float
    , fuelFire : Float
    , water : Float
    , projectiles : List Point
    , battle : Maybe { volleys : List Volley }
    , convoy : Maybe { shot : Maybe Volley }
    , traffic : Maybe { volleys : List Volley }
    , mission : Mission
    , ships : List Ship
    , aircraft : List Plane
    , silent : Bool
    , alert : Float
    , shock : Float
    , flood : Float
    , pressureAlarm : Int
    , gunLoudUntil : Maybe Float
    }


point : D.Decoder Point
point =
    D.map2 Point (D.field "x" D.float) (D.field "y" D.float)


named : (a -> String) -> List a -> D.Decoder a
named name values =
    D.string
        |> D.andThen
            (\text ->
                case List.filter (\v -> name v == text) values of
                    v :: _ ->
                        D.succeed v

                    [] ->
                        D.fail text
            )


watch : D.Decoder Watch
watch =
    D.map2 Tuple.pair (D.field "time" D.float) shots
        |> D.andThen
            (\( now, inFlight ) ->
                D.succeed Watch
                    |> andMap (D.field "x" D.float)
                    |> andMap (D.field "y" D.float)
                    |> andMap (D.succeed now)
                    |> andMap (D.field "crewQuietUntil" D.float)
                    |> andMap (D.field "hull" D.float)
                    |> andMap (D.field "systems" systems)
                    |> andMap (D.field "repairLimits" limits)
                    |> andMap (D.field "fuelLeak" D.float)
                    |> andMap (D.field "fuelFire" D.float)
                    |> andMap (D.field "water" D.float)
                    |> andMap (D.field "projectiles" (D.list point))
                    |> andMap (D.succeed inFlight.battle)
                    |> andMap (D.succeed inFlight.convoy)
                    |> andMap (D.succeed inFlight.traffic)
                    |> andMap (D.field "mission" (D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail id))))
                    |> andMap (D.field "ships" (D.list (Ship.decoder now)))
                    |> andMap (D.field "aircraft" (D.list (D.map4 Plane (D.field "x" D.float) (D.field "y" D.float) (D.field "hull" D.float) (D.field "phase" (named AircraftPhase.phaseName AircraftPhase.phases)))))
                    |> andMap (D.field "silent" D.bool)
                    |> andMap (D.field "alert" D.float)
                    |> andMap (D.field "shock" D.float)
                    |> andMap (D.field "flood" D.float)
                    |> andMap (D.field "pressureAlarm" D.int)
                    |> andMap (optional "gunLoudUntil" D.float)
            )


period : D.Decoder (Maybe CrewPeriod)
period =
    D.nullable (named MessWatch.periodName [ Sleep, Breakfast, Coffee, Meal, Music, LightsOut ])


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "messWatch.launchWatchSeconds" ->
            Just (D.succeed (E.float MessWatch.launchWatchSeconds))

        "messWatch.recordLocalLaunch" ->
            Just
                (D.map2 (\s launcher -> E.float (MessWatch.recordLocalLaunch launcher s).crewQuietUntil)
                    (arg 0 (D.map4 (\x y time quiet -> { x = x, y = y, time = time, crewQuietUntil = quiet }) (D.field "x" D.float) (D.field "y" D.float) (D.field "time" D.float) (D.field "crewQuietUntil" D.float)))
                    (arg 1 point)
                )

        "messWatch.crewOnAlert" ->
            Just (D.map2 (\s stations -> E.bool (MessWatch.crewOnAlert stations s)) (arg 0 watch) (arg 1 D.bool))

        "messWatch.crewPeriod" ->
            Just (D.map (MessWatch.crewPeriod >> Maybe.map (MessWatch.periodName >> E.string) >> Maybe.withDefault E.null) (arg 0 D.float))

        "messWatch.messLine" ->
            Just
                (D.map3 (\p choice last -> MessWatch.messLine p choice last |> Maybe.map E.string |> Maybe.withDefault E.null)
                    (arg 0 period)
                    (arg 1 D.float)
                    (arg 2 (D.nullable D.string))
                )

        "messWatch.messClips" ->
            Just (D.succeed (E.list E.string MessWatch.messClips))

        _ ->
            Nothing
