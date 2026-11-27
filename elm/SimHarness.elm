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
import Sim.Debrief as Debrief
import Sim.Equipment as Equipment
import Sim.HullDesign as HullDesign
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
