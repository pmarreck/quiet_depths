module SimHarness.Enemy exposing (function, instrument, profile)

{-| Harness entries for what the enemy suspects.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.SonarTransmitters as Sonar
import Sim.Suspicion as Suspicion
import Sim.Vessel as Vessel
import SimHarness.Codec exposing (andMap, arg, call1, call2, vesselKind)


clue : D.Decoder Suspicion.Clue
clue =
    D.map3 Suspicion.Clue (D.field "x" D.float) (D.field "y" D.float) (D.field "time" D.float)


type alias TestWatcher =
    { x : Float, y : Float, alert : Float, heading : Float, id : String, kind : Vessel.Kind, depth : Maybe Float, clue : Maybe Suspicion.Clue, nextInquiry : Maybe Float }


watcher : D.Decoder TestWatcher
watcher =
    D.succeed TestWatcher
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "alert" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "kind" vesselKind)
        |> andMap (D.maybe (D.field "depth" D.float))
        |> andMap (D.maybe (D.field "clue" clue))
        |> andMap (D.maybe (D.field "nextInquiry" D.float))


encodeClue : Suspicion.Clue -> E.Value
encodeClue c =
    E.object [ ( "x", E.float c.x ), ( "y", E.float c.y ), ( "time", E.float c.time ) ]


{-| The watcher's fields the suspicion rules touch; absent ones stay absent.
-}
encodeWatcher : TestWatcher -> E.Value
encodeWatcher v =
    E.object
        ([ ( "alert", E.float v.alert ), ( "heading", E.float v.heading ) ]
            ++ List.filterMap identity
                [ Maybe.map (\c -> ( "clue", encodeClue c )) v.clue
                , Maybe.map (\n -> ( "nextInquiry", E.float n )) v.nextInquiry
                ]
        )


type alias TestPatrol =
    { x : Float, y : Float, time : Float, heading : Float, depth : Float, patrol : { seed : Float }, difficulty : { pingDetection : Float, detection : Float, pursuit : Float } }


patrol : D.Decoder TestPatrol
patrol =
    D.succeed TestPatrol
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "patrol" (D.map (\seed -> { seed = seed }) (D.field "seed" D.float)))
        |> andMap
            (D.field "difficulty"
                (D.map3 (\ping detection pursuit -> { pingDetection = ping, detection = detection, pursuit = pursuit })
                    (D.field "pingDetection" D.float)
                    (D.field "detection" D.float)
                    (D.field "pursuit" D.float)
                )
            )


instrument : D.Decoder Sonar.Instrument
instrument =
    D.string
        |> D.andThen
            (\m ->
                if m == "painter" then
                    D.succeed Sonar.Painter

                else if m == "scribbler" then
                    D.succeed Sonar.Scribbler

                else
                    D.fail m
            )


profile : D.Decoder Sonar.Profile
profile =
    D.string
        |> D.andThen
            (\p ->
                if p == "survey" then
                    D.succeed Sonar.Survey

                else if p == "detail" then
                    D.succeed Sonar.Detail

                else
                    D.fail p
            )


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "suspicion.searchSeconds" ->
            Just (call1 D.float E.float Suspicion.searchSeconds)

        "suspicion.suspicionLabel" ->
            Just (call2 D.float (D.list (D.map (\t -> { tracking = t }) (D.maybe (D.field "tracking" (D.nullable D.string)) |> D.map (Maybe.andThen identity)))) E.string Suspicion.suspicionLabel)

        "suspicion.leaveClue" ->
            Just (D.map3 (\v amount observed -> encodeWatcher (Suspicion.leaveClue amount observed v)) (arg 1 watcher) (arg 2 D.float) (arg 3 clue))

        "suspicion.imagerClue" ->
            Just
                (D.map5 (\s v mode prof beat -> encodeWatcher (Suspicion.imagerClue s mode prof beat v))
                    (arg 0 patrol)
                    (arg 1 watcher)
                    (arg 2 instrument)
                    (arg 3 profile)
                    (arg 4 D.float)
                )

        "suspicion.activeClue" ->
            Just (call2 patrol watcher (\( c, v ) -> E.object [ ( "clue", Maybe.map encodeClue c |> Maybe.withDefault E.null ), ( "watcher", encodeWatcher v ) ]) Suspicion.activeClue)

        "suspicion.searchClue" ->
            Just
                (D.map4 (\s v dt c -> (\( due, w ) -> E.object [ ( "due", E.bool due ), ( "watcher", encodeWatcher w ) ]) (Suspicion.searchClue s dt c v))
                    (arg 0 patrol)
                    (arg 1 watcher)
                    (arg 2 D.float)
                    (arg 3 (D.nullable clue))
                )

        _ ->
            Nothing
