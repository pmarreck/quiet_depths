module Sim.Sound exposing (Echo, Sound, decoder, encode)

{-| A sound in the patrol's acoustic history, as saves hold it. It fits the
acoustics' `Heard` record, so `Sim.Acoustics.update` runs on saved sounds
as they are. Like the ship and contact records it mirrors the TypeScript
field for field; see docs/plan\_context/ship-and-contact-records.md.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Acoustics as Acoustics exposing (Kind, Perceived)


{-| What a torpedo seeker's ping returned.
-}
type alias Echo =
    { id : Float, x : Float, y : Float, depth : Float, speed : Float, time : Float, inboundRun : Bool }


type alias Sound =
    { id : Int
    , time : Float
    , kind : Kind
    , x : Float
    , y : Float
    , power : Maybe Float
    , heard : Bool
    , depth : Maybe Float
    , altitude : Maybe Float
    , heardAt : Maybe Float
    , perceived : Maybe Perceived
    , vessel : Maybe String
    , friendly : Maybe Bool
    , own : Maybe Bool
    , touched : Maybe Bool
    , missed : Maybe Bool
    , warning : Maybe Bool
    , ownHit : Maybe Bool
    , droneHit : Maybe Bool
    , echo : Maybe Echo
    }


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key valueDecoder =
    D.oneOf [ D.field key D.value |> D.map (\_ -> True), D.succeed False ]
        |> D.andThen
            (\present ->
                if present then
                    D.map Just (D.field key valueDecoder)

                else
                    D.succeed Nothing
            )


check : String -> (a -> Bool) -> D.Decoder a -> D.Decoder a
check problem ok =
    D.andThen
        (\v ->
            if ok v then
                D.succeed v

            else
                D.fail problem
        )


finite : D.Decoder Float
finite =
    check "a finite number" (\n -> not (isNaN n || isInfinite n)) D.float


kind : D.Decoder Kind
kind =
    D.string
        |> D.andThen
            (\given ->
                case List.filter (\k -> Acoustics.kindName k == given) Acoustics.kinds of
                    k :: _ ->
                        D.succeed k

                    [] ->
                        D.fail ("unknown sound " ++ given)
            )


{-| A seeker's echo, valid at its sound's time.
-}
echo : Float -> D.Decoder Echo
echo time =
    D.map7 Echo
        (D.field "id" (check "a positive whole id" (\n -> n > 0 && toFloat (floor n) == n && n <= 9007199254740991) finite))
        (D.field "x" finite)
        (D.field "y" finite)
        (D.field "depth" (check "a depth at or below the surface" (\n -> n >= 0) finite))
        (D.field "speed" (check "a speed at or above zero" (\n -> n >= 0) finite))
        (D.field "time" (check "the sound's own time" (\t -> t == time && t >= 0) finite))
        (D.field "inboundRun" D.bool)


perceived : D.Decoder Perceived
perceived =
    D.map5 Perceived (D.field "distance" D.float) (D.field "delay" D.float) (D.field "pan" D.float) (D.field "gain" D.float) (D.field "cutoff" D.float)


{-| A saved sound, rejected where restore rejects it. A sweep, collapse or
settling must name one of the patrol's ships, so the decoder takes their ids;
an echo belongs only to a seeker.
-}
decoder : List String -> D.Decoder Sound
decoder shipIds =
    D.map2 Tuple.pair (D.field "time" finite) (D.field "type" kind)
        |> D.andThen
            (\( time, k ) ->
                let
                    name : String
                    name =
                        Acoustics.kindName k

                    namesShip : Bool
                    namesShip =
                        List.member name [ "sweep", "collapse", "settling" ]
                in
                D.succeed Sound
                    |> andMap (D.field "id" D.int)
                    |> andMap (D.succeed time)
                    |> andMap (D.succeed k)
                    |> andMap (D.field "x" finite)
                    |> andMap (D.field "y" finite)
                    |> andMap (D.field "power" (D.map Just finite))
                    |> andMap (D.field "heard" D.bool)
                    |> andMap (optional "depth" D.float)
                    |> andMap (optional "altitude" D.float)
                    |> andMap (optional "heardAt" D.float)
                    |> andMap (optional "perceived" perceived)
                    |> andMap
                        (optional "vessel" D.string
                            |> check "a ship the patrol has" (\v -> not namesShip || List.member (Maybe.withDefault "" v) shipIds && v /= Nothing)
                        )
                    |> andMap (optional "friendly" D.bool)
                    |> andMap (optional "own" D.bool)
                    |> andMap (optional "touched" D.bool)
                    |> andMap (optional "missed" D.bool)
                    |> andMap (optional "warning" D.bool)
                    |> andMap (optional "ownHit" D.bool)
                    |> andMap (optional "droneHit" D.bool)
                    |> andMap
                        (optional "echo" (echo time)
                            |> check "an echo only on a seeker" (\e -> e == Nothing || name == "seeker")
                        )
            )


{-| The sound as a save holds it; absent fields stay absent.
-}
encode : Sound -> E.Value
encode s =
    let
        field : String -> (a -> E.Value) -> Maybe a -> Maybe ( String, E.Value )
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    E.object
        ([ ( "id", E.int s.id ), ( "time", E.float s.time ), ( "type", E.string (Acoustics.kindName s.kind) ), ( "x", E.float s.x ), ( "y", E.float s.y ), ( "heard", E.bool s.heard ) ]
            ++ List.filterMap identity
                [ field "power" E.float s.power
                , field "depth" E.float s.depth
                , field "altitude" E.float s.altitude
                , field "heardAt" E.float s.heardAt
                , field "perceived" (\p -> E.object [ ( "distance", E.float p.distance ), ( "delay", E.float p.delay ), ( "pan", E.float p.pan ), ( "gain", E.float p.gain ), ( "cutoff", E.float p.cutoff ) ]) s.perceived
                , field "vessel" E.string s.vessel
                , field "friendly" E.bool s.friendly
                , field "own" E.bool s.own
                , field "touched" E.bool s.touched
                , field "missed" E.bool s.missed
                , field "warning" E.bool s.warning
                , field "ownHit" E.bool s.ownHit
                , field "droneHit" E.bool s.droneHit
                , field "echo"
                    (\e ->
                        E.object
                            [ ( "id", E.float e.id ), ( "x", E.float e.x ), ( "y", E.float e.y ), ( "depth", E.float e.depth ), ( "speed", E.float e.speed ), ( "time", E.float e.time ), ( "inboundRun", E.bool e.inboundRun ) ]
                    )
                    s.echo
                ]
        )
