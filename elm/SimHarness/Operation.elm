module SimHarness.Operation exposing (function)

{-| Harness entries for rescues and surveys: the site and operation a mission
sets up, the approach and station keeping, starting the transfers, the
casualty clock, each tick's work and the ROV's survey photographs.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Operation as Operation
import Sim.OperationWork as OperationWork
import Sim.Ship as Ship
import Sim.Site as Site
import SimHarness.Codec exposing (arg)
import SimHarness.Patrol as Patrol exposing (Patrol)


patrol : D.Decoder Patrol
patrol =
    arg 0 Patrol.decoder


nullable : (a -> E.Value) -> Maybe a -> E.Value
nullable encode =
    Maybe.map encode >> Maybe.withDefault E.null


{-| The fields a rescue or survey changes beyond the boat's own.
-}
encodeWorld : Patrol -> E.Value
encodeWorld s =
    E.object
        (Patrol.encodeFields s
            ++ [ ( "ships", E.list Ship.encode s.ships )
               , ( "site", nullable Site.encode s.site )
               , ( "operation", nullable Operation.encode s.operation )
               , ( "route", nullable (\r -> E.object ([ ( "x", E.float r.x ), ( "y", E.float r.y ) ] ++ (r.radius |> Maybe.map (\v -> [ ( "radius", E.float v ) ]) |> Maybe.withDefault []))) s.route )
               , ( "home", E.object [ ( "x", E.float s.home.x ), ( "y", E.float s.home.y ) ] )
               , ( "photoCooldown", E.float s.photoCooldown )
               ]
        )


{-| A result with the world it leaves.
-}
withWorld : (a -> E.Value) -> ( a, Patrol ) -> E.Value
withWorld encode ( result, s ) =
    E.list identity [ encode result, encodeWorld s ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "operation.setupOperation" ->
            Just (D.map2 (\s seed -> encodeWorld (Operation.setupOperation seed s)) patrol (arg 1 D.float))

        "operation.operationApproach" ->
            Just (D.map (Operation.operationApproach >> nullable (\p -> E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "depth", E.float p.depth ), ( "radius", E.float p.radius ) ])) patrol)

        "operation.operationConditions" ->
            Just (D.map (Operation.operationConditions >> nullable (\c -> E.object [ ( "range", E.float c.range ), ( "depth", E.float c.depth ), ( "onStation", E.bool c.onStation ), ( "holding", E.bool c.holding ) ])) patrol)

        "operation.startRescue" ->
            Just (D.map (Operation.startRescue >> withWorld E.bool) patrol)

        "operation.casualtyDeadline" ->
            Just (D.map (\s -> s.operation |> nullable (Operation.casualtyDeadline s >> E.float)) patrol)

        "operation.dronePhotograph" ->
            Just (D.map (OperationWork.dronePhotograph >> withWorld (\r -> E.object [ ( "ok", E.bool r.ok ), ( "text", E.string r.text ) ])) patrol)

        "operation.updateOperation" ->
            Just (D.map2 (\s dt -> withWorld E.bool (OperationWork.updateOperation dt s)) patrol (arg 1 D.float))

        _ ->
            Nothing
