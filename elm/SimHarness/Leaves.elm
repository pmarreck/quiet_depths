module SimHarness.Leaves exposing (function)

{-| Harness entries for the arithmetic and the small leaf modules.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Debrief as Debrief
import Sim.Difficulty as Difficulty
import Sim.Equipment as Equipment
import Sim.HullDesign as HullDesign
import Sim.Math as SimMath
import Sim.SeabedRest as SeabedRest
import Sim.SonarTransmitters as Sonar
import Sim.Text as Text
import Sim.TorpedoTubes as TorpedoTubes
import Sim.WatchWarnings as WatchWarnings
import SimHarness.Codec exposing (arg, call1, call2, call3, call5, maybe, point)


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
        d : { bridgeEye : Float, bridgeRailRadius : Float, bridgeRoof : Float, bridgeZ : Float, hullRadius : Float, propellerBlades : Int, propellerPitch : Float, propellerRadius : Float, propellerZ : Float, sailBarrel : Float, sailRadius : Float, sailStretch : Float, scopeEye : Float, scopeZ : Float, shaftRadius : Float, stations : List HullDesign.Station, tubeDown : Float, tubeForward : Float, tubeSide : Float, year : Int }
        d =
            HullDesign.design
    in
    E.object
        [ ( "year", E.int d.year )
        , ( "hullRadius", E.float d.hullRadius )
        , ( "propellerRadius", E.float d.propellerRadius )
        , ( "propellerPitch", E.float d.propellerPitch )
        , ( "propellerZ", E.float d.propellerZ )
        , ( "propellerBlades", E.int d.propellerBlades )
        , ( "shaftRadius", E.float d.shaftRadius )
        , ( "sailRadius", E.float d.sailRadius )
        , ( "sailBarrel", E.float d.sailBarrel )
        , ( "sailStretch", E.float d.sailStretch )
        , ( "bridgeZ", E.float d.bridgeZ )
        , ( "bridgeRoof", E.float d.bridgeRoof )
        , ( "bridgeEye", E.float d.bridgeEye )
        , ( "bridgeRailRadius", E.float d.bridgeRailRadius )
        , ( "scopeZ", E.float d.scopeZ )
        , ( "scopeEye", E.float d.scopeEye )
        , ( "tubeSide", E.float d.tubeSide )
        , ( "tubeDown", E.float d.tubeDown )
        , ( "tubeForward", E.float d.tubeForward )
        , ( "stations", E.list (\s -> E.object [ ( "z", E.float s.z ), ( "radius", E.float s.radius ) ]) d.stations )
        ]


part : D.Decoder Equipment.Part
part =
    D.map2 Equipment.Part (D.field "condition" D.float) (D.field "limit" D.float)


encodePart : Equipment.Part -> E.Value
encodePart p =
    E.object [ ( "condition", E.float p.condition ), ( "limit", E.float p.limit ) ]


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


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "sonarTransmitters.validTransmitters" ->
            Just (D.map (\v -> E.bool (D.decodeValue Sonar.decoder v |> Result.map (\_ -> True) |> Result.withDefault False)) (arg 0 D.value))

        "sonarTransmitters.transmissionNotice" ->
            Just (call2 Sonar.decoder D.bool E.string Sonar.notice)

        "sonarTransmitters.transmitterProfiles" ->
            Just (D.succeed (E.object (List.map (\( key, p ) -> ( key, E.object [ ( "range", E.float (Sonar.range p) ), ( "exposure", E.float (Sonar.exposure p) ) ] )) [ ( "survey", Sonar.Survey ), ( "detail", Sonar.Detail ) ])))

        "sonarTransmitters.scanSector" ->
            Just
                (D.map4 (\eye object mode reach -> E.bool (Sonar.scanSector eye object mode reach))
                    (arg 0 (D.map4 (\x y depth heading -> { x = x, y = y, depth = depth, heading = heading }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "heading" D.float)))
                    (arg 1 (D.map3 (\x y depth -> { x = x, y = y, depth = depth }) (D.field "x" D.float) (D.field "y" D.float) (D.maybe (D.field "depth" D.float))))
                    (arg 2
                        (D.string
                            |> D.andThen
                                (\m ->
                                    if m == "painter" then
                                        D.succeed Sonar.Painter

                                    else if m == "scribbler" then
                                        D.succeed Sonar.Scribbler

                                    else
                                        D.fail m
                                )
                        )
                    )
                    (arg 3 D.float)
                )

        "difficulty.patrolDifficulty" ->
            Just (D.map (Difficulty.decode >> Difficulty.encode) (arg 0 D.value))

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

        "math.imul" ->
            Just (call2 D.int D.int E.int SimMath.imul)

        "math.toInt32" ->
            Just (call1 D.float E.int SimMath.toInt32)

        "text.toFixed" ->
            Just (call2 D.int D.float E.string Text.toFixed)

        "text.codePointUnits" ->
            Just (call1 D.string (E.list E.int) Text.codePointUnits)

        "text.codeUnits" ->
            Just (call1 D.string (E.list E.int) Text.codeUnits)

        "math.remainder" ->
            Just (call2 D.float D.float E.float SimMath.remainder)

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
