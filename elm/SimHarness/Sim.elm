module SimHarness.Sim exposing (function)

{-| Harness entries for the simulation as the page drives it: a frame of
play tick by tick, and each action, from a saved patrol.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Patrol as Patrol
import Sim.PatrolCommand as PatrolCommand
import Sim.WorldDecoder as WorldDecoder
import SimHarness.Codec exposing (arg)


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "sim.step" ->
            Just (D.map3 (\s dt frame -> E.list PatrolCommand.encodeTick (Patrol.step dt frame s)) (arg 0 WorldDecoder.decoder) (arg 1 D.float) (arg 2 PatrolCommand.input))

        "sim.act" ->
            Just (D.map2 (\s action -> PatrolCommand.encodeDone (Patrol.act action s)) (arg 0 WorldDecoder.decoder) (arg 1 PatrolCommand.action))

        _ ->
            Nothing
