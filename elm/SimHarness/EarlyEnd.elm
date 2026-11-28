module SimHarness.EarlyEnd exposing (function)

{-| Harness entries for ending a patrol early at extraction.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.Debrief as Debrief
import Sim.EarlyEnd as EarlyEnd
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.PatrolPhase as PatrolPhase exposing (Phase)
import Sim.SaveParts exposing (logKind)
import Sim.Ship as Ship exposing (Ship)
import Sim.Status as Status exposing (Status)
import SimHarness.Codec exposing (andMap, arg, point)


type alias Patrol =
    { x : Float
    , y : Float
    , mission : Mission
    , status : Status
    , phase : Phase
    , depth : Float
    , time : Float
    , home : { x : Float, y : Float }
    , patrol : { photoGoal : Float, trackGoal : Float }
    , photos : List E.Value
    , trackTime : Float
    , ships : List Ship
    , operation : Maybe { rescued : Float, scan : Float, photoAngles : List Float }
    , events : List LogEntry
    , debrief : List Debrief.Entry
    }


named : String -> (a -> String) -> List a -> D.Decoder a
named what name values =
    D.string
        |> D.andThen
            (\given ->
                List.filter (\v -> name v == given) values
                    |> List.head
                    |> Maybe.map D.succeed
                    |> Maybe.withDefault (D.fail ("unknown " ++ what ++ ": " ++ given))
            )


mission : D.Decoder Mission
mission =
    D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail id))


patrol : D.Decoder Patrol
patrol =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.succeed (\x y m status phase depth home goals photos trackTime ships operation events debrief -> Patrol x y m status phase depth now home goals photos trackTime ships operation events debrief)
                    |> andMap (D.field "x" D.float)
                    |> andMap (D.field "y" D.float)
                    |> andMap (D.field "mission" mission)
                    |> andMap (D.field "status" (named "status" Status.statusName Status.statuses))
                    |> andMap (D.field "phase" (named "phase" PatrolPhase.phaseName PatrolPhase.phases))
                    |> andMap (D.field "depth" D.float)
                    |> andMap (D.field "home" point)
                    |> andMap (D.field "patrol" (D.map2 (\photoGoal trackGoal -> { photoGoal = photoGoal, trackGoal = trackGoal }) (D.field "photoGoal" D.float) (D.field "trackGoal" D.float)))
                    |> andMap (D.field "photos" (D.list D.value))
                    |> andMap (D.field "trackTime" D.float)
                    |> andMap (D.field "ships" (D.list (Ship.decoder now)))
                    |> andMap
                        (D.field "operation"
                            (D.nullable
                                (D.map3 (\rescued scan angles -> { rescued = rescued, scan = scan, photoAngles = angles })
                                    (D.field "rescued" D.float)
                                    (D.field "scan" D.float)
                                    (D.field "photoAngles" (D.list D.float))
                                )
                            )
                        )
                    |> andMap (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                    |> andMap (D.field "debrief" (D.list (D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string))))
            )


{-| The fields an early end changes.
-}
encodeChanges : Patrol -> E.Value
encodeChanges s =
    E.object
        [ ( "status", E.string (Status.statusName s.status) )
        , ( "events", E.list (\e -> E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]) s.events )
        , ( "debrief", E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ]) s.debrief )
        ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "earlyEnd.insidePickup" ->
            Just (D.map (EarlyEnd.insidePickup >> E.bool) (arg 0 patrol))

        "earlyEnd.earlyEndOffered" ->
            Just (D.map (EarlyEnd.earlyEndOffered >> E.bool) (arg 0 patrol))

        "earlyEnd.partialCredit" ->
            Just (D.map (EarlyEnd.partialCredit >> E.bool) (arg 0 patrol))

        "earlyEnd.extractionPrompt" ->
            Just
                (D.map2 (\armed s -> EarlyEnd.extractionPrompt armed s |> (\r -> E.object [ ( "ask", E.bool r.ask ), ( "armed", E.bool r.armed ) ]))
                    (arg 0 D.bool)
                    (arg 1 patrol)
                )

        "earlyEnd.endPatrolEarly" ->
            Just
                (D.map
                    (\s ->
                        let
                            ( outcome, after ) =
                                EarlyEnd.endPatrolEarly s
                        in
                        E.object [ ( "outcome", Maybe.map (EarlyEnd.outcomeName >> E.string) outcome |> Maybe.withDefault E.null ), ( "state", encodeChanges after ) ]
                    )
                    (arg 0 patrol)
                )

        "earlyEnd.partialSummary" ->
            Just (D.map (EarlyEnd.partialSummary >> Maybe.map E.string >> Maybe.withDefault E.null) (arg 0 patrol))

        _ ->
            Nothing
