module SimHarness.Boat exposing (function)

{-| Harness entries for the boat's own machinery.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.PowerPlant as Plant
import Sim.RovFlight as Rov
import Sim.SurfaceMotion as Motion
import Sim.SurfaceWake as Wake
import SimHarness.Codec exposing (andMap, arg, call1, call2, call3)


engineMode : D.Decoder Plant.EngineMode
engineMode =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "diesel" ->
                        D.succeed Plant.Diesel

                    "electric" ->
                        D.succeed Plant.Electric

                    _ ->
                        D.fail ("unknown engine " ++ name)
            )


dieselMode : D.Decoder Plant.DieselMode
dieselMode =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "charge" ->
                        D.succeed Plant.Charge

                    "drive" ->
                        D.succeed Plant.Drive

                    "assist" ->
                        D.succeed Plant.Assist

                    _ ->
                        D.fail ("unknown diesel mode " ++ name)
            )


type alias TestPlant =
    { engine : Plant.EngineMode
    , depth : Float
    , fuel : Float
    , battery : Float
    , systems : { diesel : Float, fuelTank : Float, batteryBank : Float, engine : Float, propeller : Float }
    , dieselMode : Plant.DieselMode
    , targetSpeed : Float
    , silent : Bool
    }


plant : D.Decoder TestPlant
plant =
    D.succeed TestPlant
        |> andMap (D.field "engine" engineMode)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "fuel" D.float)
        |> andMap (D.field "battery" D.float)
        |> andMap
            (D.field "systems"
                (D.map5 (\diesel fuelTank bank engine propeller -> { diesel = diesel, fuelTank = fuelTank, batteryBank = bank, engine = engine, propeller = propeller })
                    (D.field "diesel" D.float)
                    (D.field "fuelTank" D.float)
                    (D.field "batteryBank" D.float)
                    (D.field "engine" D.float)
                    (D.field "propeller" D.float)
                )
            )
        |> andMap (D.field "dieselMode" dieselMode)
        |> andMap (D.field "targetSpeed" D.float)
        |> andMap (D.field "silent" D.bool)


propulsion : D.Decoder Plant.Propulsion
propulsion =
    D.succeed Plant.Propulsion
        |> andMap (D.field "generator" D.float)
        |> andMap (D.field "drive" D.float)
        |> andMap (D.field "ahead" D.float)
        |> andMap (D.field "astern" D.float)
        |> andMap (D.field "chargeRate" D.float)
        |> andMap (D.field "assistDrain" D.float)


encodePropulsion : Plant.Propulsion -> E.Value
encodePropulsion p =
    E.object
        [ ( "generator", E.float p.generator )
        , ( "drive", E.float p.drive )
        , ( "ahead", E.float p.ahead )
        , ( "astern", E.float p.astern )
        , ( "chargeRate", E.float p.chargeRate )
        , ( "assistDrain", E.float p.assistDrain )
        ]


sea : D.Decoder (Motion.Sea {})
sea =
    D.map4 (\scale speed phase at -> { waveScale = scale, waveSpeed = speed, wavePhase = phase, sampledAt = at })
        (D.field "waveScale" D.float)
        (D.field "waveSpeed" D.float)
        (D.maybe (D.field "wavePhase" D.float))
        (D.maybe (D.field "sampledAt" D.float))


{-| A hull; a missing roll reads as level, as `undefined || 0` does.
-}
hull : D.Decoder Motion.Pose
hull =
    D.map6 Motion.Pose
        (D.field "x" D.float)
        (D.field "y" D.float)
        (D.field "heading" D.float)
        (D.field "depth" D.float)
        (D.field "pitch" D.float)
        (D.maybe (D.field "roll" D.float) |> D.map (Maybe.withDefault 0))


encodePose : Motion.Pose -> E.Value
encodePose p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "heading", E.float p.heading ), ( "depth", E.float p.depth ), ( "pitch", E.float p.pitch ), ( "roll", E.float p.roll ) ]


{-| Missing offsets are zero, as the TypeScript's destructuring defaults are.
-}
offset : D.Decoder Motion.Offset
offset =
    let
        along key =
            D.maybe (D.field key D.float) |> D.map (Maybe.withDefault 0)
    in
    D.map3 Motion.Offset (along "side") (along "forward") (along "down")


point : D.Decoder Motion.Point
point =
    D.map3 Motion.Point (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float)


type alias WakeBoat =
    { x : Float, y : Float, heading : Float, depth : Float, pitch : Float, speed : Float, scope : Bool, scopeTravel : Maybe Float, systems : { periscope : Float }, time : Float }


wakeBoat : D.Decoder WakeBoat
wakeBoat =
    D.succeed WakeBoat
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "pitch" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (D.field "scope" D.bool)
        |> andMap (D.maybe (D.field "scopeTravel" D.float))
        |> andMap (D.field "systems" (D.map (\p -> { periscope = p }) (D.field "periscope" D.float)))
        |> andMap (D.field "time" D.float)


wakeSample : D.Decoder Wake.WakeSample
wakeSample =
    D.map6 Wake.WakeSample (D.field "x" D.float) (D.field "y" D.float) (D.field "heading" D.float) (D.field "time" D.float) (D.field "width" D.float) (D.field "strength" D.float)


encodeWakeSample : Wake.WakeSample -> E.Value
encodeWakeSample w =
    E.object [ ( "x", E.float w.x ), ( "y", E.float w.y ), ( "time", E.float w.time ), ( "heading", E.float w.heading ), ( "width", E.float w.width ), ( "strength", E.float w.strength ) ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "surfaceMotion.wavePhaseAt" ->
            Just (call2 D.float sea E.float Motion.wavePhaseAt)

        "surfaceMotion.surfaceHeight" ->
            Just (D.map4 (\x y time s -> E.float (Motion.surfaceHeight x y time s)) (arg 0 D.float) (arg 1 D.float) (arg 2 D.float) (arg 3 sea))

        "surfaceMotion.surfaceMotion" ->
            Just (call3 hull sea D.float encodePose Motion.surfaceMotion)

        "surfaceMotion.boatPoint" ->
            Just (call2 hull offset (\p -> E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "depth", E.float p.depth ) ]) Motion.boatPoint)

        "surfaceMotion.boatLocal" ->
            Just (call2 hull point (\o -> E.object [ ( "side", E.float o.side ), ( "forward", E.float o.forward ), ( "down", E.float o.down ) ]) Motion.boatLocal)

        "surfaceMotion.hash01" ->
            Just (call2 D.float D.float E.float Motion.hash01)

        "surfaceMotion.constants" ->
            Just
                (D.succeed
                    (E.object
                        [ ( "periscopeDepth", E.float Motion.periscopeDepth )
                        , ( "WAVE_COMPONENTS", E.list (\w -> E.object [ ( "kx", E.float w.kx ), ( "ky", E.float w.ky ), ( "omega", E.float w.omega ), ( "amplitude", E.float w.amplitude ) ]) Motion.waveComponents )
                        ]
                    )
                )

        "rovFlight.droneCameraPitch" ->
            Just (call2 D.float (D.nullable D.float) E.float Rov.droneCameraPitch)

        "rovFlight.droneTetherAttachment" ->
            Just
                (call1
                    (D.map6 (\x y depth heading vs nose -> { x = x, y = y, depth = depth, heading = heading, verticalSpeed = vs, nosePitch = nose })
                        (D.field "x" D.float)
                        (D.field "y" D.float)
                        (D.field "depth" D.float)
                        (D.field "heading" D.float)
                        (D.field "verticalSpeed" D.float)
                        (D.field "nosePitch" (D.nullable D.float))
                    )
                    (\p -> E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "depth", E.float p.depth ) ])
                    Rov.droneTetherAttachment
                )

        "rovFlight.changeNosePitch" ->
            Just
                (D.map3
                    (\d degrees inverted ->
                        (\c -> E.object [ ( "nosePitch", Maybe.map E.float c.nosePitch |> Maybe.withDefault E.null ), ( "verticalSpeed", E.float c.verticalSpeed ), ( "targetDepth", E.float c.targetDepth ), ( "depth", E.float c.depth ) ])
                            (Rov.changeNosePitch degrees inverted d)
                    )
                    (arg 0 (D.map4 (\nose vs target depth -> { nosePitch = nose, verticalSpeed = vs, targetDepth = target, depth = depth }) (D.field "nosePitch" (D.nullable D.float)) (D.field "verticalSpeed" D.float) (D.field "targetDepth" D.float) (D.field "depth" D.float)))
                    (arg 1 D.float)
                    (arg 2 D.bool)
                )

        "rovFlight.constants" ->
            Just (D.succeed (E.object [ ( "maxNosePitch", E.float Rov.maxNosePitch ), ( "cableGland", E.object [ ( "side", E.float Rov.cableGland.side ), ( "down", E.float Rov.cableGland.down ), ( "forward", E.float Rov.cableGland.forward ) ] ) ]))

        "surfaceWake.wakeLifetime" ->
            Just (D.succeed (E.float Wake.wakeLifetime))

        "surfaceWake.surfaceCrossing" ->
            Just (call2 wakeBoat sea (\w -> Maybe.map encodeWakeSample w |> Maybe.withDefault E.null) Wake.surfaceCrossing)

        "surfaceWake.recordWake" ->
            Just (D.map3 (\b s wake -> E.list encodeWakeSample (Wake.recordWake b s wake)) (arg 0 wakeBoat) (arg 1 sea) (arg 0 (D.field "wake" (D.list wakeSample))))

        "powerPlant.constants" ->
            Just (D.succeed (E.object [ ( "SURFACE_KNOTS", E.float Plant.surfaceKnots ), ( "ELECTRIC_KNOTS", E.float Plant.electricKnots ) ]))

        "powerPlant.isDieselMode" ->
            Just (D.map (\v -> E.bool (D.decodeValue dieselMode v |> Result.map (\_ -> True) |> Result.withDefault False)) (arg 0 D.value))

        "powerPlant.generatorOutput" ->
            Just (call1 plant E.float Plant.generatorOutput)

        "powerPlant.batteryOutput" ->
            Just (call1 plant E.float Plant.batteryOutput)

        "powerPlant.throttlePercent" ->
            Just (call1 D.float E.float Plant.throttlePercent)

        "powerPlant.throttleOrder" ->
            Just (call1 D.float E.float Plant.throttleOrder)

        "powerPlant.propulsion" ->
            Just (call1 plant encodePropulsion Plant.propulsion)

        "powerPlant.dieselRoutingStatus" ->
            Just (call2 plant propulsion E.string Plant.dieselRoutingStatus)

        "powerPlant.energyDraw" ->
            Just (call3 D.float D.float D.float (\d -> E.object [ ( "electric", E.float d.electric ), ( "diesel", E.float d.diesel ) ]) Plant.energyDraw)

        _ ->
            Nothing
