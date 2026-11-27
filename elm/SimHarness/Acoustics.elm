module SimHarness.Acoustics exposing (function)

{-| Harness entries for the acoustics.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Acoustics as Acoustics
import SimHarness.Codec exposing (andMap, arg, call2, call3, point)


kind : D.Decoder Acoustics.Kind
kind =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\k -> Acoustics.kindName k == name) Acoustics.kinds of
                    k :: _ ->
                        D.succeed k

                    [] ->
                        D.fail ("unknown sound " ++ name)
            )


listener : D.Decoder Acoustics.Listener
listener =
    D.map4 Acoustics.Listener (D.field "x" D.float) (D.field "y" D.float) (D.maybe (D.field "depth" D.float)) (D.maybe (D.field "heading" D.float))


{-| A sound with the fields the acoustics read and its original JSON, so the
extras each kind carries come back unchanged.
-}
type alias TestSound =
    { kind : Acoustics.Kind
    , x : Float
    , y : Float
    , depth : Maybe Float
    , altitude : Maybe Float
    , power : Maybe Float
    , id : Int
    , time : Float
    , heard : Bool
    , heardAt : Maybe Float
    , perceived : Maybe Acoustics.Perceived
    , raw : D.Value
    }


perceivedDecoder : D.Decoder Acoustics.Perceived
perceivedDecoder =
    D.map5 Acoustics.Perceived (D.field "distance" D.float) (D.field "delay" D.float) (D.field "pan" D.float) (D.field "gain" D.float) (D.field "cutoff" D.float)


encodePerceived : Acoustics.Perceived -> E.Value
encodePerceived p =
    E.object [ ( "distance", E.float p.distance ), ( "delay", E.float p.delay ), ( "pan", E.float p.pan ), ( "gain", E.float p.gain ), ( "cutoff", E.float p.cutoff ) ]


sound : D.Decoder TestSound
sound =
    D.succeed TestSound
        |> andMap (D.field "type" kind)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.maybe (D.field "depth" D.float))
        |> andMap (D.maybe (D.field "altitude" D.float))
        |> andMap (D.maybe (D.field "power" D.float))
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "heard" D.bool)
        |> andMap (D.maybe (D.field "heardAt" D.float))
        |> andMap (D.maybe (D.field "perceived" perceivedDecoder))
        |> andMap D.value


encodeSound : TestSound -> E.Value
encodeSound s =
    let
        extras =
            D.decodeValue (D.keyValuePairs D.value) s.raw
                |> Result.withDefault []
                |> List.filter (\( key, _ ) -> not (List.member key [ "heard", "heardAt", "perceived" ]))
    in
    E.object
        (extras
            ++ ( "heard", E.bool s.heard )
            :: List.filterMap identity
                [ Maybe.map (\at -> ( "heardAt", E.float at )) s.heardAt
                , Maybe.map (\p -> ( "perceived", encodePerceived p )) s.perceived
                ]
        )


encodeEvent : Acoustics.Event { raw : D.Value } -> E.Value
encodeEvent event =
    case event of
        Acoustics.Received s ->
            E.list identity [ E.string "received", E.int s.id ]

        Acoustics.BlastAt s distance ->
            E.list identity [ E.string "blast", E.int s.id, E.float distance ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "acoustics.airWaterPath" ->
            Just (call3 D.float D.float D.float E.float Acoustics.airWaterPath)

        "acoustics.propagationTime" ->
            Just (call2 sound listener E.float Acoustics.propagationTime)

        "acoustics.spatialPan" ->
            Just (call2 point listener E.float Acoustics.spatialPan)

        "acoustics.perceivedSound" ->
            Just (call2 sound listener encodePerceived Acoustics.perceivedSound)

        "acoustics.update" ->
            Just
                (call3 D.float
                    listener
                    (D.list sound)
                    (\( sounds, events ) -> E.object [ ( "sounds", E.list encodeSound sounds ), ( "events", E.list encodeEvent events ) ])
                    Acoustics.update
                )

        _ ->
            Nothing
