module SimHarness.Crew exposing (function)

{-| Harness entries for the crew's reports and the record of who was struck.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Debrief as Debrief
import Sim.Mechanics as Mechanics
import Sim.PatrolReports as Reports
import SimHarness.Codec exposing (andMap, arg, call1, point)


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key decoder =
    D.maybe (D.field key decoder)


logKind : D.Decoder Mechanics.LogKind
logKind =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\k -> Mechanics.logKindName k == name) [ Mechanics.Info, Mechanics.Warning, Mechanics.Damage, Mechanics.Success, Mechanics.Contact ] of
                    k :: _ ->
                        D.succeed k

                    [] ->
                        D.fail ("unknown log kind " ++ name)
            )


encodeLog : Mechanics.LogEntry -> E.Value
encodeLog e =
    E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]


debriefEntry : D.Decoder Debrief.Entry
debriefEntry =
    D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string)


encodeDebrief : List Debrief.Entry -> E.Value
encodeDebrief =
    E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ])


report : D.Decoder Reports.Report
report =
    D.map3 Reports.Report (D.field "id" D.string) (D.field "text" D.string) (D.field "time" D.float)


type alias Vessel =
    { id : String, name : String, military : Bool, side : Maybe String, playerDamaged : Bool, neutralHitAt : Maybe Float, wreckMark : Maybe Reports.WreckMark }


{-| A vessel's record; a missing flag reads as false, as `undefined` does.
-}
vessel : D.Decoder Vessel
vessel =
    D.succeed Vessel
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "name" D.string)
        |> andMap (optional "military" D.bool |> D.map (Maybe.withDefault False))
        |> andMap (optional "side" D.string)
        |> andMap (optional "playerDamaged" D.bool |> D.map (Maybe.withDefault False))
        |> andMap (optional "neutralHitAt" D.float)
        |> andMap (optional "wreckMark" (D.map3 Reports.WreckMark (D.field "x" D.float) (D.field "y" D.float) (D.field "observed" D.bool)))


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolReports.report" ->
            Just
                (D.map3
                    (\s id text ->
                        (\r -> E.object [ ( "reports", E.list (\x -> E.object [ ( "id", E.string x.id ), ( "text", E.string x.text ), ( "time", E.float x.time ) ]) r.reports ), ( "events", E.list encodeLog r.events ) ])
                            (Reports.report id text s)
                    )
                    (arg 0
                        (D.map3 (\time reports events -> { time = time, reports = reports, events = events })
                            (D.field "time" D.float)
                            (D.field "reports" (D.list report))
                            (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                        )
                    )
                    (arg 1 D.string)
                    (arg 2 D.string)
                )

        "patrolReports.recordCivilianHit" ->
            Just
                (D.map3
                    (\s ship cause ->
                        (\( after, struck ) -> E.object [ ( "debrief", encodeDebrief after.debrief ), ( "neutralHitAt", Maybe.map E.float struck.neutralHitAt |> Maybe.withDefault E.null ) ])
                            (Reports.recordCivilianHit cause s ship)
                    )
                    (arg 0 (D.map2 (\time debrief -> { time = time, debrief = debrief }) (D.field "time" D.float) (optional "debrief" (D.list debriefEntry) |> D.map (Maybe.withDefault []))))
                    (arg 1 vessel)
                    (arg 2 D.string)
                )

        "patrolReports.disciplinaryFinding" ->
            Just
                (call1 (D.map2 Tuple.pair (D.field "patrol" (D.field "seed" D.float)) (D.field "ships" (D.list vessel)))
                    (Maybe.map (\f -> E.object [ ( "title", E.string f.title ), ( "angle", E.float f.angle ), ( "reason", E.string f.reason ) ]) >> Maybe.withDefault E.null)
                    (\( seed, ships ) -> Reports.disciplinaryFinding seed ships)
                )

        "patrolReports.hearWreck" ->
            Just
                (D.map2
                    (\( at, ships ) source -> E.list (\v -> Maybe.map (\m -> E.object [ ( "x", E.float m.x ), ( "y", E.float m.y ), ( "observed", E.bool m.observed ) ]) v.wreckMark |> Maybe.withDefault E.null) (Reports.hearWreck at source ships))
                    (arg 0 (D.map2 Tuple.pair point (D.field "ships" (D.list vessel))))
                    (arg 1 (D.map4 (\id vesselId x y -> { id = id, vessel = vesselId, x = x, y = y }) (D.field "id" D.float) (optional "vessel" D.string) (D.field "x" D.float) (D.field "y" D.float)))
                )

        _ ->
            Nothing
