module SimHarness.PatrolRestore exposing (function)

{-| Harness entries for restore: a save, without the page's own fields,
resumed and written back as a save, or null when refused.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.PatrolRestore as PatrolRestore
import Sim.WorldEncoder as WorldEncoder
import SimHarness.Codec exposing (arg)


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolRestore.restore" ->
            Just (D.map (PatrolRestore.restore >> Maybe.map WorldEncoder.encodeWorld >> Maybe.withDefault E.null) (arg 0 D.value))

        _ ->
            Nothing
