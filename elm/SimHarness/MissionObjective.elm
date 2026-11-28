module SimHarness.MissionObjective exposing (function)

{-| Harness entries for judging a patrol's objective. The rescue and survey
work stand-ins log their calls and answer by the tick's length, as the test's
TypeScript stand-ins do, so the comparison covers which work runs and that
its state comes back.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.MissionObjective as Objective exposing (ObjectiveWork)
import Sim.Ship as Ship exposing (Ship)
import SimHarness.Codec exposing (arg)


type alias Judged =
    { x : Float
    , y : Float
    , mission : Mission
    , home : { x : Float, y : Float }
    , patrol : { photoGoal : Float, trackGoal : Float }
    , photos : List D.Value
    , ships : List Ship
    , trackTime : Float
    , workCalls : List String
    }


mission : D.Decoder Mission
mission =
    D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail id))


judged : D.Decoder Judged
judged =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.map8 (\x y m home goals photos ships trackTime -> { x = x, y = y, mission = m, home = home, patrol = goals, photos = photos, ships = ships, trackTime = trackTime, workCalls = [] })
                    (D.field "x" D.float)
                    (D.field "y" D.float)
                    (D.field "mission" mission)
                    (D.field "home" (D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)))
                    (D.field "patrol" (D.map2 (\p t -> { photoGoal = p, trackGoal = t }) (D.field "photoGoal" D.float) (D.field "trackGoal" D.float)))
                    (D.field "photos" (D.list D.value))
                    (D.field "ships" (D.list (Ship.decoder now)))
                    (D.field "trackTime" D.float)
            )


work : ObjectiveWork Judged
work =
    { rescue = \dt _ s -> ( 0.5 < dt, { s | workCalls = s.workCalls ++ [ "rescue" ] } )
    , survey = \dt _ s -> ( 0.5 < dt, { s | workCalls = s.workCalls ++ [ "survey" ] } )
    }


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "missionObjective.evaluateObjective" ->
            Just
                (D.map2 (\s dt -> Objective.evaluateObjective dt work s |> (\( met, after ) -> E.list identity [ E.bool met, E.list E.string after.workCalls ]))
                    (arg 0 judged)
                    (arg 1 D.float)
                )

        "missionObjective.allSunk" ->
            Just
                (D.map2 (\ships targets -> E.bool (Objective.allSunk ships targets))
                    (arg 0 (D.list (D.map2 (\id hull -> { id = id, hull = hull }) (D.field "id" D.string) (D.field "hull" D.float))))
                    (arg 1 (D.list D.string))
                )

        "missionObjective.convoyTransportIds" ->
            Just (D.succeed (E.list E.string Objective.convoyTransportIds))

        _ ->
            Nothing
