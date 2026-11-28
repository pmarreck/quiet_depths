module SimHarness.World exposing (Boat, boat, config, function)

{-| Harness entries for the calendar, the chart and the weather.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.BoatSensors as Sensors
import Sim.Coast as Coast
import Sim.Environment as Env
import Sim.PatrolCalendar as Calendar
import SimHarness.Codec exposing (andMap, arg, call1, call2, call3, point)


encodeHoliday : Maybe Calendar.Holiday -> E.Value
encodeHoliday holiday =
    case holiday of
        Just Calendar.NewYear ->
            E.string "new-year"

        Just Calendar.Christmas ->
            E.string "christmas"

        Nothing ->
            E.null


encodeDay : Calendar.Day -> E.Value
encodeDay d =
    E.object
        [ ( "date", E.string d.date )
        , ( "holiday", encodeHoliday d.holiday )
        , ( "day", E.int d.day )
        , ( "cycle", E.float d.cycle )
        , ( "illumination", E.float d.illumination )
        ]


{-| A missing number reads as NaN, as `undefined` does in arithmetic.
-}
lenient : String -> D.Decoder Float
lenient key =
    D.oneOf [ D.field key D.float, D.succeed (0 / 0) ]


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key decoder =
    D.maybe (D.field key decoder)


weatherId : D.Decoder Env.WeatherId
weatherId =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\id -> Env.weatherIdName id == name) Env.weatherIds of
                    id :: _ ->
                        D.succeed id

                    [] ->
                        D.fail ("unknown weather " ++ name)
            )


{-| Saved conditions; a missing or null start day is an older save's.
-}
config : D.Decoder Env.Config
config =
    D.map6 Env.Config
        (optional "startDay" (D.nullable D.float) |> D.map (Maybe.andThen identity))
        (D.field "chartSeed" D.float)
        (D.field "startHour" D.float)
        (D.field "startWeather" weatherId)
        (D.field "changing" D.bool)
        (D.field "seed" D.float)


type alias Boat =
    { environment : Maybe Env.Config
    , time : Float
    , wavePhase : Maybe Float
    , lightning : List Env.Strike
    , x : Float
    , y : Float
    , heading : Float
    , depth : Float
    , pitch : Float
    , scope : Bool
    , scopeTravel : Maybe Float
    }


{-| The sky's inputs, with the hull and periscope when they are given.
-}
boat : D.Decoder Boat
boat =
    D.succeed Boat
        |> andMap (optional "environment" config)
        |> andMap (optional "time" D.float |> D.map (Maybe.withDefault 0))
        |> andMap (optional "wavePhase" D.float)
        |> andMap (optional "lightning" (D.list (D.map3 Env.Strike (D.field "time" D.float) (D.field "x" D.float) (D.field "y" D.float))) |> D.map (Maybe.withDefault []))
        |> andMap (lenient "x")
        |> andMap (lenient "y")
        |> andMap (lenient "heading")
        |> andMap (lenient "depth")
        |> andMap (lenient "pitch")
        |> andMap (optional "scope" D.bool |> D.map (Maybe.withDefault False))
        |> andMap (optional "scopeTravel" D.float)


direction : Env.Direction -> E.Value
direction d =
    E.object [ ( "x", E.float d.x ), ( "y", E.float d.y ), ( "z", E.float d.z ) ]


encodeEnvironment : Env.Environment -> E.Value
encodeEnvironment e =
    E.object
        ([ ( "cloud", E.float e.cloud )
         , ( "rain", E.float e.rain )
         , ( "storm", E.float e.storm )
         , ( "waveScale", E.float e.waveScale )
         , ( "waveSpeed", E.float e.waveSpeed )
         , ( "wind", E.float e.wind )
         , ( "visibility", E.float e.visibility )
         , ( "weather", E.string e.weather )
         , ( "weatherId", E.string (Env.weatherIdName e.weatherId) )
         , ( "hour", E.float e.hour )
         , ( "sunAltitude", E.float e.sunAltitude )
         , ( "daylight", E.float e.daylight )
         , ( "twilight", E.float e.twilight )
         , ( "phase", E.string (Env.phaseName e.phase) )
         , ( "fog", E.float e.fog )
         , ( "date", E.string e.date )
         , ( "holiday", encodeHoliday e.holiday )
         , ( "day", E.int e.day )
         , ( "cycle", E.float e.cycle )
         , ( "illumination", E.float e.illumination )
         , ( "moonDirection", direction e.moonDirection )
         , ( "clearLight", E.float e.clearLight )
         , ( "moonLight", E.float e.moonLight )
         , ( "sunDirection", direction e.sunDirection )
         , ( "opticalRange", E.float e.opticalRange )
         , ( "subVisualRange", E.float e.subVisualRange )
         , ( "lightRange", E.float e.lightRange )
         , ( "navigationLights", E.bool e.navigationLights )
         , ( "seaState", E.int e.seaState )
         , ( "flash", E.float e.flash )
         ]
            ++ List.filterMap identity [ Maybe.map (\t -> ( "sampledAt", E.float t )) e.sampledAt, Maybe.map (\w -> ( "wavePhase", E.float w )) e.wavePhase ]
        )


encodeConfig : Env.Config -> E.Value
encodeConfig c =
    E.object
        [ ( "startDay", Maybe.map E.float c.startDay |> Maybe.withDefault E.null )
        , ( "chartSeed", E.float c.chartSeed )
        , ( "startHour", E.float c.startHour )
        , ( "startWeather", E.string (Env.weatherIdName c.startWeather) )
        , ( "changing", E.bool c.changing )
        , ( "seed", E.float c.seed )
        ]


pose : D.Decoder { x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float }
pose =
    D.succeed (\x y heading depth pitch roll -> { x = x, y = y, heading = heading, depth = depth, pitch = pitch, roll = roll })
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "pitch" D.float)
        |> andMap (optional "roll" D.float |> D.map (Maybe.withDefault 0))


encodePose : { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float } -> E.Value
encodePose p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "heading", E.float p.heading ), ( "depth", E.float p.depth ), ( "pitch", E.float p.pitch ), ( "roll", E.float p.roll ) ]


{-| Setup choices: a name of the wrong type is no choice, and only an
explicit `false` holds the weather.
-}
options : D.Decoder { timeOfDay : Maybe String, weather : Maybe String, changing : Bool }
options =
    D.map3 (\time sky changing -> { timeOfDay = time, weather = sky, changing = changing })
        (optional "timeOfDay" D.string)
        (optional "weather" D.string)
        (optional "changing" D.value
            |> D.map
                (\v ->
                    case Maybe.map (D.decodeValue D.bool) v of
                        Just (Ok False) ->
                            False

                        _ ->
                            True
                )
        )


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolCalendar.constants" ->
            Just (D.succeed (E.object [ ( "DAY_SECONDS", E.float Calendar.daySeconds ) ]))

        "patrolCalendar.sailingDay" ->
            Just (call1 D.float E.int Calendar.sailingDay)

        "patrolCalendar.moonCycle" ->
            Just (call1 D.float E.float Calendar.moonCycle)

        "patrolCalendar.patrolCalendar" ->
            Just (call3 D.float D.float D.float encodeDay Calendar.patrolCalendar)

        "coast.chartDepth" ->
            Just (D.map3 (\x y seed -> E.float (Coast.chartDepth (Maybe.map Coast.coastline seed) x y)) (arg 0 D.float) (arg 1 D.float) (arg 2 (D.nullable D.float)))

        "coast.shelfOutcrops" ->
            Just
                (call2 point
                    D.float
                    (E.list (\o -> E.object [ ( "x", E.float o.x ), ( "y", E.float o.y ), ( "length", E.float o.length ), ( "width", E.float o.width ), ( "height", E.float o.height ), ( "heading", E.float o.heading ) ]))
                    Coast.shelfOutcrops
                )

        "environment.constants" ->
            Just
                (D.succeed
                    (E.object
                        [ ( "WEATHER"
                          , E.object
                                (List.map
                                    (\id ->
                                        let
                                            w : Env.Weather
                                            w =
                                                Env.weather id
                                        in
                                        ( Env.weatherIdName id
                                        , E.object
                                            [ ( "name", E.string w.name )
                                            , ( "cloud", E.float w.cloud )
                                            , ( "rain", E.float w.rain )
                                            , ( "storm", E.float w.storm )
                                            , ( "waveScale", E.float w.waveScale )
                                            , ( "waveSpeed", E.float w.waveSpeed )
                                            , ( "wind", E.float w.wind )
                                            , ( "visibility", E.float w.visibility )
                                            ]
                                        )
                                    )
                                    Env.weatherIds
                                )
                          )
                        , ( "TIMES", E.object (List.filterMap (\id -> Env.timeHours id |> Maybe.map (\t -> ( id, E.object [ ( "name", E.string t.name ), ( "hour", E.float t.hour ) ] ))) Env.timeIds) )
                        ]
                    )
                )

        "environment.makeEnvironment" ->
            Just
                (D.map2 (\seed choices -> encodeConfig (Env.makeEnvironment seed choices))
                    (D.maybe (arg 0 D.float) |> D.map (Maybe.withDefault Env.defaultSeed))
                    (D.maybe (arg 1 options) |> D.map (Maybe.withDefault { timeOfDay = Nothing, weather = Nothing, changing = True }))
                )

        "environment.environmentAt" ->
            Just (call1 boat encodeEnvironment Env.environmentAt)

        "environment.boatSurfacePose" ->
            Just (call1 boat encodePose (\s -> Sensors.boatSurfacePose s (Env.environmentAt s) s.time))

        "environment.scopePosition" ->
            Just
                (D.map2 (\p s -> (\eye -> E.object [ ( "x", E.float eye.x ), ( "y", E.float eye.y ), ( "depth", E.float eye.depth ) ]) (Sensors.scopePosition p s))
                    (arg 0 pose)
                    (D.maybe (arg 1 (D.map2 (\scope travel -> { scope = scope, scopeTravel = travel }) (D.field "scope" D.bool) (optional "scopeTravel" D.float))) |> D.map (Maybe.withDefault { scope = True, scopeTravel = Nothing }))
                )

        "environment.scopeWashed" ->
            Just (call1 boat E.bool (\s -> Sensors.scopeWashed s (Env.environmentAt s)))

        "environment.soundings" ->
            Just
                (D.map3 (\w r k -> (\d -> E.object [ ( "waterDepth", E.float d.waterDepth ), ( "referenceDepth", E.float d.referenceDepth ), ( "belowKeel", E.float d.belowKeel ), ( "keelOffset", E.float d.keelOffset ) ]) (Sensors.soundings w r k))
                    (arg 0 D.float)
                    (arg 1 D.float)
                    (D.maybe (arg 2 D.float) |> D.map (Maybe.withDefault 5))
                )

        _ ->
            Nothing
