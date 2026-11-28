module SimHarness.WorldSave exposing (encodeWorld, function)

{-| The whole world as a save writes it, to check that the Elm world record
holds everything a TypeScript save carries apart from the page's own fields
(the photo archive and the captain's name). The tick's outboxes, replay
marks and invalid numbers, are not saved.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.World exposing (World)
import Sim.WorldDecoder as WorldDecoder
import Sim.WorldEncoder as WorldEncoder
import SimHarness.Codec exposing (arg)


encodeWorld : World -> E.Value
encodeWorld =
    WorldEncoder.encodeWorld


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "world.roundTrip" ->
            Just (D.map encodeWorld (arg 0 WorldDecoder.decoder))

        _ ->
            Nothing
