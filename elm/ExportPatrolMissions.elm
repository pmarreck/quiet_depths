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
        Photographs c ->
            rule "photographs"
                [ ( "framingDegrees", E.float c.framingDegrees )
                , ( "fewestPhotos", E.int c.fewestPhotos )
                , ( "goalSpread", E.int c.goalSpread )
                ]

        SinkShips first rest ->
            rule "sink" [ ( "targets", E.list E.string (first :: rest) ) ]

        SinkCarrier carrier fatalHits ->
            rule "sink" [ ( "targets", E.list E.string [ carrier ] ), ( "fatalHits", E.int fatalHits ) ]

        Survive ->
            rule "survive" []

        ReachGate radius ->
            rule "gate" [ ( "radius", E.float radius ) ]

        TrackQuietly c ->
            rule "track"
                [ ( "listeningRange", E.float c.listeningRange )
                , ( "quieterThan", E.float c.quieterThan )
                , ( "deeperThan", E.float c.deeperThan )
                , ( "shortestGoal", E.int c.shortestGoal )
                , ( "goalStep", E.int c.goalStep )
                , ( "goalSteps", E.int c.goalSteps )
                ]

        RecoverSurvivors c ->
            rule "rescue"
                [ ( "closestRange", E.float c.closestRange )
                , ( "farthestRange", E.float c.farthestRange )
                , ( "depthTolerance", E.float c.depthTolerance )
                , ( "fastestKnots", E.float c.fastestKnots )
                , ( "assessmentSeconds", E.float c.assessmentSeconds )
                , ( "transferSeconds", E.float c.transferSeconds )
                , ( "returnSeconds", E.float c.returnSeconds )
                , ( "emptySiteChance", E.float c.emptySiteChance )
                , ( "fewestSurvivors", E.int c.fewestSurvivors )
                , ( "survivorSpread", E.int c.survivorSpread )
                , ( "casualtyClockStart", E.float c.casualtyClockStart )
                , ( "firstLossDelay", E.float c.firstLossDelay )
                , ( "firstLossSpread", E.float c.firstLossSpread )
                , ( "laterLossDelay", E.float c.laterLossDelay )
                , ( "laterLossSpread", E.float c.laterLossSpread )
                , ( "sinking", Maybe.withDefault E.null (Maybe.map encodeSinking c.sinking) )
                ]

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


encodeSinking : PatrolMission.SinkingCasualty -> E.Value
encodeSinking c =
    E.object
        [ ( "startDepth", E.float c.startDepth )
        , ( "settleSeconds", E.float c.settleSeconds )
        , ( "foundersAfter", E.float c.foundersAfter )
        , ( "foundersSpread", E.float c.foundersSpread )
        , ( "sinkRate", E.float c.sinkRate )
        , ( "lostBelow", E.float c.lostBelow )
        ]


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


encodeTiming : PatrolMission.PatrolTiming -> E.Value
encodeTiming t =
    E.object
        [ ( "standardWindow", E.int t.standardWindow )
        , ( "longerWindow", E.int t.longerWindow )
        , ( "protectedTransit", E.int t.protectedTransit )
        , ( "searchSeconds", E.int t.searchSeconds )
        ]


main : Program () () Never
main =
    Platform.worker
        { init = \() -> ( (), catalog (E.object [ ( "missions", E.list encodeMission PatrolMission.all ), ( "patrol", encodeTiming PatrolMission.patrolTiming ) ]) )
        , update = \msg _ -> never msg
        , subscriptions = \_ -> Sub.none
        }
