module SimHarness.Records exposing (function)

{-| Harness entries for the shared records saves hold. -}

import Json.Decode as D
import Json.Encode as E
import Sim.Ship as Ship
import SimHarness.Codec exposing (arg)


{-| The functions this module answers for. `ship` has no TypeScript module of
its own: it mirrors patrol-world.ts's Ship and restore's ship checks.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "ship.roundTrip" ->
            Just
                (D.map2 (\raw now -> D.decodeValue (Ship.decoder now) raw |> Result.map Ship.encode |> Result.withDefault E.null)
                    (arg 0 D.value)
                    (arg 1 D.float)
                )

        _ ->
            Nothing
