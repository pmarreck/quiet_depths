port module SimHarness exposing (main)

{-| A test-only worker that runs the Elm simulation's functions on inputs
from Node, so each ported module can be compared with the TypeScript it
replaces. It is never part of the site. A request names a function and
carries a batch of argument lists; the reply carries one result per list,
in order.
-}

import Json.Decode as D
import Json.Encode as E
import SimHarness.Acoustics
import SimHarness.AirSupport
import SimHarness.Boat
import SimHarness.ColdWatch
import SimHarness.Combat
import SimHarness.Crew
import SimHarness.EarlyEnd
import SimHarness.Enemy
import SimHarness.Fleet
import SimHarness.HostileTracks
import SimHarness.Hulls
import SimHarness.Lamp
import SimHarness.Leaves
import SimHarness.Mechanics
import SimHarness.MessWatch
import SimHarness.MissionObjective
import SimHarness.Objectives
import SimHarness.Recon
import SimHarness.Records
import SimHarness.Systems
import SimHarness.TorpedoRun
import SimHarness.Watch
import SimHarness.World


port calls : ({ id : Int, fn : String, batch : List D.Value } -> msg) -> Sub msg


port results : { id : Int, results : List E.Value, error : Maybe String } -> Cmd msg


type Msg
    = Call { id : Int, fn : String, batch : List D.Value }


{-| Each function the tests may call, by the TypeScript name it replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    List.foldl
        (\table found ->
            case found of
                Just _ ->
                    found

                Nothing ->
                    table name
        )
        Nothing
        [ SimHarness.Leaves.function, SimHarness.Acoustics.function, SimHarness.Watch.function, SimHarness.Objectives.function, SimHarness.Boat.function, SimHarness.World.function, SimHarness.Mechanics.function, SimHarness.Enemy.function, SimHarness.Lamp.function, SimHarness.Crew.function, SimHarness.Records.function, SimHarness.Hulls.function, SimHarness.Systems.function, SimHarness.Fleet.function, SimHarness.MessWatch.function, SimHarness.MissionObjective.function, SimHarness.HostileTracks.function, SimHarness.ColdWatch.function, SimHarness.EarlyEnd.function, SimHarness.AirSupport.function, SimHarness.TorpedoRun.function, SimHarness.Combat.function, SimHarness.Recon.function ]


run : { id : Int, fn : String, batch : List D.Value } -> { id : Int, results : List E.Value, error : Maybe String }
run request =
    case function request.fn of
        Nothing ->
            { id = request.id, results = [], error = Just ("unknown function " ++ request.fn) }

        Just decoder ->
            let
                step : D.Value -> ( List E.Value, Maybe String ) -> ( List E.Value, Maybe String )
                step value ( done, failure ) =
                    case failure of
                        Just _ ->
                            ( done, failure )

                        Nothing ->
                            case D.decodeValue decoder value of
                                Ok result ->
                                    ( result :: done, Nothing )

                                Err problem ->
                                    ( done, Just (D.errorToString problem) )

                ( reversed, error ) =
                    List.foldl step ( [], Nothing ) request.batch
            in
            { id = request.id, results = List.reverse reversed, error = error }


main : Program () () Msg
main =
    Platform.worker
        { init = \() -> ( (), Cmd.none )
        , update = \(Call request) () -> ( (), results (run request) )
        , subscriptions = \() -> calls Call
        }
