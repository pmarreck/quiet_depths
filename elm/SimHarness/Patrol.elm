module SimHarness.Patrol exposing (Patrol, decoder, difficulty, encode, encodeFields, encodeShell, limits, shell, systems)

{-| The world record as the harness modules name it, with its codecs, which
live in the simulation beside restore and save.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Boat exposing (Limits, Systems)
import Sim.HostileTracks exposing (Shell)
import Sim.Systems exposing (Difficulty)
import Sim.World exposing (World)
import Sim.WorldDecoder as WorldDecoder
import Sim.WorldEncoder as WorldEncoder


{-| The world, as the differential tests decode and encode it.
-}
type alias Patrol =
    World


decoder : D.Decoder Patrol
decoder =
    WorldDecoder.decoder


difficulty : D.Decoder Difficulty
difficulty =
    WorldDecoder.difficulty


limits : D.Decoder Limits
limits =
    WorldDecoder.limits


shell : D.Decoder Shell
shell =
    WorldDecoder.shell


systems : D.Decoder Systems
systems =
    WorldDecoder.systems


encode : Patrol -> E.Value
encode =
    WorldEncoder.encode


encodeFields : Patrol -> List ( String, E.Value )
encodeFields =
    WorldEncoder.encodeFields


encodeShell : Shell -> E.Value
encodeShell =
    WorldEncoder.encodeShell
