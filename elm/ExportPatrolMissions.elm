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

        FleetLead margin ->
            rule "fleetLead" [ ( "margin", E.int margin ) ]


encodeMission : PatrolMission.Mission -> E.Value
encodeMission mission =
    let
        b = PatrolMission.briefing mission
    in
    E.object
        [ ( "id", E.string b.id )
        , ( "name", E.string b.name )
        , ( "type", E.string b.category )
        , ( "minutes", E.string b.duration )
        , ( "desc", E.string b.description )
        , ( "short", E.string b.short )
        , ( "torps", E.int (PatrolMission.startingTorpedoes mission) )
        , ( "objective", encodeObjective b.objective )
        ]


main : Program () () Never
main =
    Platform.worker
        { init = \() -> ( (), catalog (E.list encodeMission PatrolMission.all) )
        , update = \msg _ -> never msg
        , subscriptions = \_ -> Sub.none
        }
