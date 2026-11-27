port module SimHarness exposing (main)

{-| A test-only worker that runs the Elm simulation's functions on inputs
from Node, so each ported module can be compared with the TypeScript it
replaces. It is never part of the site. A request names a function and
carries a batch of argument lists; the reply carries one result per list,
in order.
-}

import Json.Decode as D
import Json.Encode as E
import Platform
import Sim.Acoustics as Acoustics
import Sim.Debrief as Debrief
import Sim.Equipment as Equipment
import Sim.HullDesign as HullDesign
import Sim.Math as SimMath
import Sim.SeabedRest as SeabedRest
import Sim.TorpedoTubes as TorpedoTubes
import Sim.WatchWarnings as WatchWarnings


port calls : ({ id : Int, fn : String, batch : List D.Value } -> msg) -> Sub msg


port results : { id : Int, results : List E.Value, error : Maybe String } -> Cmd msg


type Msg
    = Call { id : Int, fn : String, batch : List D.Value }


arg : Int -> D.Decoder a -> D.Decoder a
arg =
    D.index


call1 : D.Decoder a -> (r -> E.Value) -> (a -> r) -> D.Decoder E.Value
call1 a encode f =
    D.map (f >> encode) (arg 0 a)


call2 : D.Decoder a -> D.Decoder b -> (r -> E.Value) -> (a -> b -> r) -> D.Decoder E.Value
call2 a b encode f =
    D.map2 (\x y -> encode (f x y)) (arg 0 a) (arg 1 b)


call3 : D.Decoder a -> D.Decoder b -> D.Decoder c -> (r -> E.Value) -> (a -> b -> c -> r) -> D.Decoder E.Value
call3 a b c encode f =
    D.map3 (\x y z -> encode (f x y z)) (arg 0 a) (arg 1 b) (arg 2 c)


call5 : D.Decoder a -> D.Decoder b -> D.Decoder c -> D.Decoder d -> D.Decoder e -> (r -> E.Value) -> (a -> b -> c -> d -> e -> r) -> D.Decoder E.Value
call5 a b c d e encode f =
    D.map5 (\v w x y z -> encode (f v w x y z)) (arg 0 a) (arg 1 b) (arg 2 c) (arg 3 d) (arg 4 e)


maybe : (a -> E.Value) -> Maybe a -> E.Value
maybe encode =
    Maybe.map encode >> Maybe.withDefault E.null


battery : D.Decoder WatchWarnings.Battery
battery =
    D.int
        |> D.andThen
            (\level ->
                case level of
                    0 ->
                        D.succeed WatchWarnings.Charged

                    1 ->
                        D.succeed WatchWarnings.Low

                    2 ->
                        D.succeed WatchWarnings.Critical

                    _ ->
                        D.fail ("unknown battery warning " ++ String.fromInt level)
            )


batteryLevel : WatchWarnings.Battery -> Int
batteryLevel level =
    case level of
        WatchWarnings.Charged ->
            0

        WatchWarnings.Low ->
            1

        WatchWarnings.Critical ->
            2


warnings : D.Decoder WatchWarnings.Warnings
warnings =
    D.map2 WatchWarnings.Warnings (D.field "bottom" D.bool) (D.field "battery" battery)


encodeWarnings : WatchWarnings.Warnings -> E.Value
encodeWarnings w =
    E.object [ ( "bottom", E.bool w.bottom ), ( "battery", E.int (batteryLevel w.battery) ) ]


entry : D.Decoder Debrief.Entry
entry =
    D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string)


encodeEntry : Debrief.Entry -> E.Value
encodeEntry e =
    E.object [ ( "time", E.float e.time ), ( "text", E.string e.text ) ]


tubeState : D.Decoder { time : Float, torps : Int, portReadyAt : Float, starboardReadyAt : Float }
tubeState =
    D.map4 (\time torps portAt starboardAt -> { time = time, torps = torps, portReadyAt = portAt, starboardReadyAt = starboardAt })
        (D.field "time" D.float)
        (D.field "torps" D.int)
        (D.at [ "tubeReadyAt", "port" ] D.float)
        (D.at [ "tubeReadyAt", "starboard" ] D.float)


tubeName : TorpedoTubes.Tube -> String
tubeName tube =
    case tube of
        TorpedoTubes.Port ->
            "port"

        TorpedoTubes.Starboard ->
            "starboard"


encodeTubes : TorpedoTubes.Tubes -> E.Value
encodeTubes t =
    E.object [ ( "port", maybe E.float t.port_ ), ( "starboard", maybe E.float t.starboard ), ( "next", maybe (tubeName >> E.string) t.next ) ]


encodeDesign : E.Value
encodeDesign =
    let
        d =
            HullDesign.design
    in
    E.object
        [ ( "year", E.int d.year ), ( "hullRadius", E.float d.hullRadius ), ( "propellerRadius", E.float d.propellerRadius )
        , ( "propellerPitch", E.float d.propellerPitch ), ( "propellerZ", E.float d.propellerZ ), ( "propellerBlades", E.int d.propellerBlades )
        , ( "shaftRadius", E.float d.shaftRadius ), ( "sailRadius", E.float d.sailRadius ), ( "sailBarrel", E.float d.sailBarrel )
        , ( "sailStretch", E.float d.sailStretch ), ( "bridgeZ", E.float d.bridgeZ ), ( "bridgeRoof", E.float d.bridgeRoof )
        , ( "bridgeEye", E.float d.bridgeEye ), ( "bridgeRailRadius", E.float d.bridgeRailRadius ), ( "scopeZ", E.float d.scopeZ )
        , ( "scopeEye", E.float d.scopeEye ), ( "tubeSide", E.float d.tubeSide ), ( "tubeDown", E.float d.tubeDown )
        , ( "tubeForward", E.float d.tubeForward )
        , ( "stations", E.list (\s -> E.object [ ( "z", E.float s.z ), ( "radius", E.float s.radius ) ]) d.stations )
        ]


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
    { kind : Acoustics.Kind, x : Float, y : Float, depth : Maybe Float, altitude : Maybe Float, power : Maybe Float
    , id : Int, time : Float, heard : Bool, heardAt : Maybe Float, perceived : Maybe Acoustics.Perceived, raw : D.Value
    }


perceivedDecoder : D.Decoder Acoustics.Perceived
perceivedDecoder =
    D.map5 Acoustics.Perceived (D.field "distance" D.float) (D.field "delay" D.float) (D.field "pan" D.float) (D.field "gain" D.float) (D.field "cutoff" D.float)


encodePerceived : Acoustics.Perceived -> E.Value
encodePerceived p =
    E.object [ ( "distance", E.float p.distance ), ( "delay", E.float p.delay ), ( "pan", E.float p.pan ), ( "gain", E.float p.gain ), ( "cutoff", E.float p.cutoff ) ]


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


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


part : D.Decoder Equipment.Part
part =
    D.map2 Equipment.Part (D.field "condition" D.float) (D.field "limit" D.float)


encodePart : Equipment.Part -> E.Value
encodePart p =
    E.object [ ( "condition", E.float p.condition ), ( "limit", E.float p.limit ) ]


point : D.Decoder { x : Float, y : Float }
point =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)


boat : D.Decoder { x : Float, y : Float, heading : Float }
boat =
    D.map3 (\x y heading -> { x = x, y = y, heading = heading }) (D.field "x" D.float) (D.field "y" D.float) (D.field "heading" D.float)


section : D.Decoder Equipment.Section
section =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "bow" ->
                        D.succeed Equipment.Bow

                    "midships" ->
                        D.succeed Equipment.Midships

                    "stern" ->
                        D.succeed Equipment.Stern

                    _ ->
                        D.fail ("unknown section " ++ name)
            )


sectionName : Equipment.Section -> String
sectionName s =
    case s of
        Equipment.Bow ->
            "bow"

        Equipment.Midships ->
            "midships"

        Equipment.Stern ->
            "stern"


{-| Each function the tests may call, by the TypeScript name it replaces. -}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "equipment.systems" ->
            Just (D.succeed (E.list (Equipment.systemKey >> E.string) Equipment.systems))

        "equipment.systemName" ->
            Just (D.succeed (E.object (List.map (\s -> ( Equipment.systemKey s, E.string (Equipment.systemName s) )) Equipment.systems)))

        "equipment.compartment" ->
            Just (D.succeed (E.object (List.map (\s -> ( Equipment.systemKey s, E.string (sectionName (Equipment.compartment s)) )) Equipment.systems)))

        "equipment.operatingFraction" ->
            Just (call1 D.float E.float Equipment.operatingFraction)

        "equipment.damage" ->
            Just (call2 D.float part encodePart Equipment.damage)

        "equipment.repair" ->
            Just (call2 D.float part encodePart Equipment.repair)

        "equipment.conditionLabel" ->
            Just (call2 D.bool part E.string Equipment.conditionLabel)

        "equipment.hitSection" ->
            Just (call2 boat point (sectionName >> E.string) Equipment.hitSection)

        "equipment.hitSystem" ->
            Just (call2 (D.nullable section) D.float (Equipment.systemKey >> E.string) Equipment.hitSystem)

        "math.hypot2" ->
            Just (call2 D.float D.float E.float SimMath.hypot2)

        "math.hypot3" ->
            Just (call3 D.float D.float D.float E.float SimMath.hypot3)

        "math.exp" ->
            Just (call1 D.float E.float SimMath.exp)

        "math.expm1" ->
            Just (call1 D.float E.float SimMath.expm1)

        "math.tanh" ->
            Just (call1 D.float E.float SimMath.tanh)

        "math.cbrt" ->
            Just (call1 D.float E.float SimMath.cbrt)

        "math.max" ->
            Just (call2 D.float D.float E.float SimMath.max)

        "math.min" ->
            Just (call2 D.float D.float E.float SimMath.min)

        "math.abs" ->
            Just (call1 D.float E.float SimMath.abs)

        "math.sign" ->
            Just (call1 D.float E.float SimMath.sign)

        "math.clamp" ->
            Just (call3 D.float D.float D.float E.float SimMath.clamp)

        "math.remainder" ->
            Just (call2 D.float D.float E.float SimMath.remainder)

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

        "watchWarnings.warnings" ->
            Just (call3 D.float D.float (D.nullable warnings) encodeWarnings WatchWarnings.warnings)

        "watchWarnings.batteryCall" ->
            Just (call1 battery (maybe E.string) WatchWarnings.batteryCall)

        "watchWarnings.bottomCall" ->
            Just (D.succeed (E.string WatchWarnings.bottomCall))

        "debrief.add" ->
            Just (call3 D.float D.string (D.list entry) (E.list encodeEntry) Debrief.add)

        "seabedRest.touchdownImpact" ->
            Just (call2 D.float D.float E.float SeabedRest.touchdownImpact)

        "seabedRest.touchdownChance" ->
            Just (call1 D.float E.float SeabedRest.touchdownChance)

        "seabedRest.touchdownDamage" ->
            Just (call1 D.float E.float SeabedRest.touchdownDamage)

        "seabedRest.seabedWear" ->
            Just (call2 D.float D.float E.float SeabedRest.seabedWear)

        "seabedRest.restingStealth" ->
            Just (call2 D.bool D.float E.float SeabedRest.restingStealth)

        "seabedRest.sweepClutter" ->
            Just (call2 D.bool D.float E.float SeabedRest.sweepClutter)

        "torpedoTubes.tubes" ->
            Just (call1 tubeState encodeTubes TorpedoTubes.tubes)

        "torpedoTubes.exitPitch" ->
            Just (call5 D.float D.float D.float D.float D.float E.float TorpedoTubes.exitPitch)

        "hullDesign.design" ->
            Just (D.succeed encodeDesign)

        _ ->
            Nothing


run : { id : Int, fn : String, batch : List D.Value } -> { id : Int, results : List E.Value, error : Maybe String }
run request =
    case function request.fn of
        Nothing ->
            { id = request.id, results = [], error = Just ("unknown function " ++ request.fn) }

        Just decoder ->
            let
                step value ( done, failure ) =
                    case failure of
                        Just _ ->
                            ( done, failure )

                        Nothing ->
                            case D.decodeValue decoder value of
                                Ok result ->
                                    ( result :: done, Nothing )

                                Err problem ->
                                    ( done, Just (D.errorToString problem) )

                ( reversed, error ) =
                    List.foldl step ( [], Nothing ) request.batch
            in
            { id = request.id, results = List.reverse reversed, error = error }


main : Program () () Msg
main =
    Platform.worker
        { init = \() -> ( (), Cmd.none )
        , update = \(Call request) () -> ( (), results (run request) )
        , subscriptions = \() -> calls Call
        }
