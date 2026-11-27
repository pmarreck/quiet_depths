module SimHarness.Boat exposing (function)

{-| Harness entries for the boat's own machinery. -}

import Json.Decode as D
import Json.Encode as E
import Sim.PowerPlant as Plant
import Sim.SurfaceMotion as Motion
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
        [ ( "generator", E.float p.generator ), ( "drive", E.float p.drive ), ( "ahead", E.float p.ahead ), ( "astern", E.float p.astern )
        , ( "chargeRate", E.float p.chargeRate ), ( "assistDrain", E.float p.assistDrain )
        ]


sea : D.Decoder (Motion.Sea {})
sea =
    D.map4 (\scale speed phase at -> { waveScale = scale, waveSpeed = speed, wavePhase = phase, sampledAt = at })
        (D.field "waveScale" D.float)
        (D.field "waveSpeed" D.float)
        (D.maybe (D.field "wavePhase" D.float))
        (D.maybe (D.field "sampledAt" D.float))


{-| A hull; a missing roll reads as level, as `undefined || 0` does. -}
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


{-| Missing offsets are zero, as the TypeScript's destructuring defaults are. -}
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


{-| The functions this module answers for, by the TypeScript name each replaces. -}
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
