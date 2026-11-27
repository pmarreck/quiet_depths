port module Bench.Boundary exposing (main)

{-| Cutover spike: what moving the patrol's ships and contacts across the
Elm boundary costs. Each request decodes a batch of states sent in through a
port, repeats the round trip, and sends the last encoding back out.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Contact as Contact
import Sim.Ship as Ship


port request : (D.Value -> msg) -> Sub msg


port reply : E.Value -> Cmd msg


roundTrip : D.Value -> E.Value
roundTrip raw =
    case D.decodeValue (D.field "time" D.float) raw of
        Ok now ->
            case D.decodeValue (D.map2 Tuple.pair (D.field "ships" (D.list (Ship.decoder now))) (D.field "contacts" (D.list (Contact.decoder now)))) raw of
                Ok ( ships, contacts ) ->
                    E.object [ ( "time", E.float now ), ( "ships", E.list Ship.encode ships ), ( "contacts", E.list Contact.encode contacts ) ]

                Err e ->
                    E.string (D.errorToString e)

        Err e ->
            E.string (D.errorToString e)


main : Program () () D.Value
main =
    Platform.worker
        { init = \_ -> ( (), Cmd.none )
        , update = \raw _ -> ( (), reply (E.list roundTrip (Result.withDefault [] (D.decodeValue (D.list D.value) raw))) )
        , subscriptions = \_ -> request identity
        }
