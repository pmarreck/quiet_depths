module SimHarness.ConvoyWatch exposing (function)

{-| Harness entries for the wolf in the henhouse and the allied lamp watch:
the convoy's setup, its lamp, the hunter's raid, the escort's charges, and
friendly ships signaling fixes. The conditions come from the same patrol
through the world harness's environment decoder; the game's own depth-charge
drop and lamp-fix plotting stand in for the TypeScript callbacks.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.AlliedWatch as AlliedWatch
import Sim.Contact as Contact
import Sim.ContactReports as ContactReports
import Sim.ConvoySaves as ConvoySaves exposing (StationMessage(..))
import Sim.ConvoyWatch as ConvoyWatch exposing (Observation)
import Sim.Environment as Env
import Sim.OrdnanceSaves exposing (encodeBlast)
import Sim.SaveParts as SaveParts exposing (encodeConvoy)
import Sim.Ship as Ship
import SimHarness.Codec exposing (arg)
import SimHarness.Fleet exposing (optional)
import SimHarness.Patrol as Patrol exposing (Patrol)
import SimHarness.World as World


patrol : D.Decoder Patrol
patrol =
    arg 0 Patrol.decoder


environment : D.Decoder Env.Environment
environment =
    arg 0 (D.map Env.environmentAt World.boat)


observation : Int -> D.Decoder Observation
observation n =
    arg n (D.map3 Observation (optional "observation" D.string) (optional "lampInView" (D.nullable D.string) |> D.map (Maybe.andThen identity)) (optional "timeRate" D.float))


nullable : (a -> E.Value) -> Maybe a -> E.Value
nullable encode =
    Maybe.map encode >> Maybe.withDefault E.null


{-| The fields the convoy and the allied watch change beyond the boat's own.
-}
encodeWorld : Patrol -> E.Value
encodeWorld s =
    E.object
        (Patrol.encodeFields s
            ++ [ ( "ships", E.list Ship.encode s.ships )
               , ( "reports", E.list (\r -> E.object [ ( "id", E.string r.id ), ( "text", E.string r.text ), ( "time", E.float r.time ) ]) s.reports )
               , ( "blasts", E.list encodeBlast s.blasts )
               , ( "contacts", E.list Contact.encode s.contacts )
               , ( "nextId", E.float s.nextId )
               ]
            ++ (case s.convoy of
                    Just c ->
                        [ ( "convoy", encodeConvoy c ) ]

                    Nothing ->
                        []
               )
            ++ (case s.alliedLamp of
                    Just w ->
                        [ ( "alliedLamp", E.object [ ( "message", nullable (SaveParts.encodeTransmission SaveParts.encodeLampFix) w.message ), ( "sequence", E.float w.sequence ), ( "lastIssue", E.float w.lastIssue ) ] ) ]

                    Nothing ->
                        []
               )
        )


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "convoyWatch.setupHenhouse" ->
            Just (D.map (ConvoyWatch.setupHenhouse >> encodeWorld) patrol)

        "convoyWatch.signalHail" ->
            Just (D.map2 (\n range -> E.string (ConvoyWatch.signalHail { name = n } range)) (arg 0 (D.field "name" D.string)) (arg 1 D.float))

        "convoyWatch.convoyLosses" ->
            Just (D.map (ConvoyWatch.convoyLosses >> E.int) patrol)

        "convoyWatch.updateLamp" ->
            Just (D.map4 (\s e input dt -> encodeWorld (ConvoyWatch.updateLamp e input dt s)) patrol environment (observation 1) (arg 2 D.float))

        "convoyWatch.updateConvoyRaid" ->
            Just (D.map3 (\s dt approaching -> encodeWorld (ConvoyWatch.updateConvoyRaid dt approaching s)) patrol (arg 1 D.float) (arg 2 D.bool))

        "convoyWatch.resolveConvoyCharge" ->
            Just (D.map2 (\s charge -> encodeWorld (ConvoyWatch.resolveConvoyCharge charge s)) patrol (arg 1 (D.map3 (\x y id -> { x = x, y = y, id = id }) (D.field "x" D.float) (D.field "y" D.float) (D.field "id" D.int))))

        "convoyWatch.updateAlliedWatch" ->
            Just (D.map4 (\s e input dt -> encodeWorld (AlliedWatch.updateAlliedWatch e input dt ContactReports.recordLampContact s)) patrol environment (observation 1) (arg 2 D.float))

        "convoyWatch.validConvoy" ->
            Just (refusedUnlessDecoded (D.map (ConvoySaves.validConvoy >> E.bool) patrol))

        "convoyWatch.validAlliedWatch" ->
            Just (refusedUnlessDecoded (D.map (ConvoySaves.validAlliedWatch >> E.bool) patrol))

        "convoyWatch.stationLamp" ->
            Just
                (D.map
                    (\s ->
                        case ConvoySaves.stationLamp s of
                            Just (AlliedSignal m) ->
                                SaveParts.encodeTransmission SaveParts.encodeLampFix m

                            Just (ConvoySignal m) ->
                                SaveParts.encodeTransmission SaveParts.encodeEstimate m

                            Nothing ->
                                E.null
                    )
                    patrol
                )

        _ ->
            Nothing


{-| A save check: a patrol whose convoy or allied watch does not decode is
refused, as the TypeScript refuses a field of the wrong type.
-}
refusedUnlessDecoded : D.Decoder E.Value -> D.Decoder E.Value
refusedUnlessDecoded check =
    D.oneOf [ check, D.succeed (E.bool False) ]
