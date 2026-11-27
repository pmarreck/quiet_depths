port module ExportPatrolMissions exposing (main)

import Json.Encode as E
import PatrolMission exposing (Objective(..))
import Platform


-- The synchronous simulation reads this table before its first tick.
port catalog : E.Value -> Cmd msg


encodeObjective : Objective -> E.Value
encodeObjective objective =
    let
        rule kind fields =
            E.object (( "kind", E.string kind ) :: fields)
    in
    case objective of
        Photographs ->
            rule "photographs" []

        SinkShips first rest ->
            rule "sink" [ ( "targets", E.list E.string (first :: rest) ) ]

        Survive ->
            rule "survive" []

        ReachGate radius ->
            rule "gate" [ ( "radius", E.float radius ) ]

        TrackQuietly ->
            rule "track" []

        FinishOperation ->
            rule "operation" []

        SurveyWreck c ->
            rule "survey"
                [ ( "scanSeconds", E.float c.scanSeconds )
                , ( "horizontalRange", E.float c.horizontalRange )
                , ( "verticalRange", E.float c.verticalRange )
                , ( "slowestKnots", E.float c.slowestKnots )
                , ( "fastestKnots", E.float c.fastestKnots )
                , ( "photographs", E.int c.photographs )
                , ( "photoSeparation", E.float c.photoSeparation )
                ]

        FleetLead margin ->
            rule "fleetLead" [ ( "margin", E.int margin ) ]

        ProtectConvoy hunter limit ->
            rule "protectConvoy" [ ( "hunter", E.string hunter ), ( "lossLimit", E.int limit ) ]


encodeMission : PatrolMission.Mission -> E.Value
encodeMission mission =
    let
        b = PatrolMission.briefing mission
    in
    E.object
        [ ( "id", E.string b.id )
        , ( "name", E.string b.name )
        , ( "type", E.string b.category )
        , ( "actionStations", E.bool (b.crewWatch == PatrolMission.ActionStations) )
        , ( "engaged", E.bool (b.encounterOrders == PatrolMission.Engage) )
        , ( "minutes", E.string (PatrolMission.estimatedMinutes False b) )
        , ( "longMinutes", E.string (PatrolMission.estimatedMinutes True b) )
        , ( "desc", E.string b.description )
        , ( "short", E.string b.short )
        , ( "torps", E.int PatrolMission.startingTorpedoes )
        , ( "objective", encodeObjective b.objective )
        ]


main : Program () () Never
main =
    Platform.worker
        { init = \() -> ( (), catalog (E.list encodeMission PatrolMission.all) )
        , update = \msg _ -> never msg
        , subscriptions = \_ -> Sub.none
        }
