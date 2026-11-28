module Sim.MissionObjective exposing (ObjectiveWork, Patrol, allSunk, convoyTransportIds, evaluateObjective)

{-| Whether a patrol's objective is met, by the kind of objective its mission
sets: photographs taken, targets sunk, reaching the extraction gate, enough
quiet tracking, a fleet lead, the convoy's hunter sunk, or simply surviving.
Rescues and surveys advance their own work each tick as they are judged, so
those are functions the caller supplies, and the state they leave comes back
with the answer.
-}

import PatrolCriteria exposing (RescueCriteria, SurveyCriteria)
import PatrolMission exposing (Mission, Objective(..))
import Sim.FleetTheater as Theater
import Sim.Math as M
import Sim.Ship exposing (Ship)


{-| The patrol fields an objective reads.
-}
type alias Patrol p q ph =
    { p
        | x : Float
        , y : Float
        , mission : Mission
        , home : { x : Float, y : Float }
        , patrol : { q | photoGoal : Float, trackGoal : Float }
        , photos : List ph
        , ships : List Ship
        , trackTime : Float
    }


{-| The tick's work for the objectives that change state as they are judged:
each takes the tick's seconds and the mission's criteria, and says whether
the objective is met.
-}
type alias ObjectiveWork state =
    { rescue : Float -> RescueCriteria -> state -> ( Bool, state )
    , survey : Float -> SurveyCriteria -> state -> ( Bool, state )
    }


{-| Every target present and its hull exactly zero; a target missing from the
ship list is not sunk.
-}
allSunk : List { s | id : String, hull : Float } -> List String -> Bool
allSunk ships targets =
    List.all
        (\id ->
            List.filter (\ship -> ship.id == id) ships
                |> List.head
                |> Maybe.map (.hull >> M.isZero)
                |> Maybe.withDefault False
        )
        targets


{-| The transports a seek-and-destroy patrol must sink.
-}
convoyTransportIds : List String
convoyTransportIds =
    case PatrolMission.fromId "seek-and-destroy" |> Maybe.map (PatrolMission.briefing >> .objective) of
        Just (SinkShips first rest) ->
            first :: rest

        _ ->
            []


evaluateObjective : Float -> ObjectiveWork (Patrol p q ph) -> Patrol p q ph -> ( Bool, Patrol p q ph )
evaluateObjective dt work state =
    case (PatrolMission.briefing state.mission).objective of
        Photographs _ ->
            ( M.notLess (toFloat (List.length state.photos)) state.patrol.photoGoal, state )

        SinkShips first rest ->
            ( allSunk state.ships (first :: rest), state )

        SinkCarrier carrier _ ->
            ( allSunk state.ships [ carrier ], state )

        Survive ->
            ( True, state )

        FleetLead margin ->
            ( margin <= Theater.friendlyLead state.ships, state )

        ProtectConvoy hunter _ ->
            ( allSunk state.ships [ hunter ], state )

        ReachGate radius ->
            ( M.hypot2 (state.x - state.home.x) (state.y - state.home.y) <= radius, state )

        TrackQuietly _ ->
            ( M.notLess state.trackTime state.patrol.trackGoal, state )

        RecoverSurvivors criteria ->
            work.rescue dt criteria state

        SurveyWreck criteria ->
            work.survey dt criteria state
