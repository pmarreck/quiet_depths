module SimHarness.Mechanics exposing (function)

{-| Harness entries for mechanics and the small modules built on it. -}

import Json.Decode as D
import Json.Encode as E
import Sim.Coast
import Sim.CombatGeometry as Geometry
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.Pressure as Pressure
import Sim.Seafloor as Seafloor
import Sim.Status as Status
import Sim.VehicleStatus as Vehicle
import SimHarness.Codec exposing (andMap, arg, call1, call2, call3, call5, flag, point, position3, vesselKind)


lenient : String -> D.Decoder Float
lenient key =
    D.oneOf [ D.field key D.float, D.succeed (0 / 0) ]


logKind : D.Decoder Mechanics.LogKind
logKind =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\k -> Mechanics.logKindName k == name) [ Mechanics.Info, Mechanics.Warning, Mechanics.Damage, Mechanics.Success, Mechanics.Contact ] of
                    k :: _ ->
                        D.succeed k

                    [] ->
                        D.fail ("unknown log kind " ++ name)
            )


logEntry : D.Decoder Mechanics.LogEntry
logEntry =
    D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind)


encodeLog : Mechanics.LogEntry -> E.Value
encodeLog e =
    E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]


{-| A saved random state wraps to 32 bits, as every draw's first step does. -}
rng : D.Decoder Int
rng =
    D.map M.toInt32 D.float


aloft : D.Decoder Geometry.Aloft
aloft =
    D.map3 Geometry.Aloft (D.field "x" D.float) (D.field "y" D.float) (D.field "altitude" D.float)


hull : D.Decoder { x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float }
hull =
    D.succeed (\x y heading depth pitch roll -> { x = x, y = y, heading = heading, depth = depth, pitch = pitch, roll = roll })
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "pitch" D.float)
        |> andMap (D.maybe (D.field "roll" D.float) |> D.map (Maybe.withDefault 0))


encodePoint : { a | x : Float, y : Float, depth : Float } -> E.Value
encodePoint p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "depth", E.float p.depth ) ]


status : D.Decoder Status.Status
status =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\s -> Status.statusName s == name) [ Status.Patrol, Status.Won, Status.Lost, Status.Partial, Status.Withdrawn ] of
                    s :: _ ->
                        D.succeed s

                    [] ->
                        D.fail ("unknown status " ++ name)
            )


type alias PressureBoat =
    { outerHull : Float
    , hull : Float
    , depth : Float
    , pressureAlarm : Int
    , criticalExposure : Float
    , flood : Float
    , repairLimits : { hull : Float }
    , status : Status.Status
    , imploded : Bool
    , shock : Float
    , rng : Int
    , events : List Mechanics.LogEntry
    , time : Float
    , debrief : List { time : Float, text : String }
    }


pressureBoat : D.Decoder PressureBoat
pressureBoat =
    D.succeed PressureBoat
        |> andMap (D.field "outerHull" D.float)
        |> andMap (D.field "hull" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "pressureAlarm" D.int)
        |> andMap (D.field "criticalExposure" D.float)
        |> andMap (D.field "flood" D.float)
        |> andMap (D.field "repairLimits" (D.map (\h -> { hull = h }) (D.field "hull" D.float)))
        |> andMap (D.field "status" status)
        |> andMap (D.field "imploded" D.bool)
        |> andMap (D.field "shock" D.float)
        |> andMap (D.field "rng" rng)
        |> andMap (D.field "events" (D.list logEntry))
        |> andMap (D.field "time" D.float)
        |> andMap (D.maybe (D.field "debrief" (D.list (D.map2 (\t text -> { time = t, text = text }) (D.field "time" D.float) (D.field "text" D.string)))) |> D.map (Maybe.withDefault []))


encodePressureBoat : PressureBoat -> E.Value
encodePressureBoat s =
    E.object
        [ ( "outerHull", E.float s.outerHull ), ( "hull", E.float s.hull ), ( "depth", E.float s.depth ), ( "pressureAlarm", E.int s.pressureAlarm )
        , ( "criticalExposure", E.float s.criticalExposure ), ( "flood", E.float s.flood ), ( "repairLimits", E.object [ ( "hull", E.float s.repairLimits.hull ) ] )
        , ( "status", E.string (Status.statusName s.status) ), ( "imploded", E.bool s.imploded ), ( "shock", E.float s.shock ), ( "rng", E.int s.rng )
        , ( "events", E.list encodeLog s.events ), ( "time", E.float s.time )
        , ( "debrief", E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ]) s.debrief )
        ]


{-| The functions this module answers for, by the TypeScript name each replaces. -}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "mechanics.clamp" ->
            Just (call3 D.float D.float D.float E.float (\v low high -> M.clamp low high v))

        "mechanics.rad" ->
            Just (call1 D.float E.float Mechanics.rad)

        "mechanics.bearing" ->
            Just (call2 point point E.float Mechanics.bearing)

        "mechanics.delta" ->
            Just (call2 D.float D.float E.float Mechanics.delta)

        "mechanics.distance" ->
            Just (call2 point point E.float Mechanics.distance)

        "mechanics.separation" ->
            Just (call2 position3 position3 E.float Mechanics.separation)

        "mechanics.rand" ->
            Just (call1 rng (\( v, next ) -> E.object [ ( "value", E.float v ), ( "rng", E.int next ) ]) Mechanics.rand)

        "mechanics.log" ->
            Just
                (D.map3 (\s text kind -> E.list encodeLog (Mechanics.log text kind s).events)
                    (arg 0 (D.map2 (\events time -> { events = events, time = time }) (D.field "events" (D.list logEntry)) (D.field "time" D.float)))
                    (arg 1 D.string)
                    (arg 2 logKind)
                )

        "mechanics.capsuleContact" ->
            Just
                (call5 position3
                    (D.map5 (\x y depth heading pitch -> { x = x, y = y, depth = depth, heading = heading, pitch = pitch }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "heading" D.float) (lenient "pitch"))
                    D.float
                    D.float
                    D.float
                    (Maybe.map (\c -> E.object [ ( "penetration", E.float c.penetration ), ( "nx", E.float c.nx ), ( "ny", E.float c.ny ), ( "nd", E.float c.nd ) ]) >> Maybe.withDefault E.null)
                    Mechanics.capsuleContact
                )

        "mechanics.propellerState" ->
            Just (call3 D.float D.float D.float (\p -> E.object [ ( "rpm", E.float p.rpm ), ( "sigma", E.float p.sigma ), ( "cavitation", E.float p.cavitation ) ]) Mechanics.propellerState)

        "seafloor.constants" ->
            Just (D.succeed (E.object [ ( "FLOOR_WIDTH", E.float Seafloor.floorWidth ), ( "FLOOR_SEGMENTS", E.float Seafloor.floorSegments ) ]))

        "seafloor.floorSurface" ->
            Just
                (D.map3 (\x north seed -> (\f -> E.object [ ( "height", E.float f.height ), ( "slopeX", E.float f.slopeX ), ( "slopeZ", E.float f.slopeZ ) ]) (Seafloor.floorSurface (Maybe.map coastline seed) x north))
                    (arg 0 D.float)
                    (arg 1 D.float)
                    (arg 2 (D.nullable D.float))
                )

        "combatGeometry.wrap" ->
            Just (call1 D.float E.float Geometry.wrap)

        "combatGeometry.shipHit" ->
            Just
                (D.map4 (\from to ship kind -> Geometry.shipHit from to ship kind |> Maybe.map E.float |> Maybe.withDefault E.null)
                    (arg 0 aloft)
                    (arg 1 aloft)
                    (arg 2 (D.map5 (\x y heading sink depth -> { x = x, y = y, heading = heading, sinkDepth = sink, depth = depth }) (D.field "x" D.float) (D.field "y" D.float) (D.field "heading" D.float) (lenient "sinkDepth") (D.maybe (D.field "depth" D.float))))
                    -- An explicit kind, or the ship's own; one the geometry does not know sizes as a merchant.
                    (D.oneOf [ arg 3 (D.map Just vesselKind), arg 3 (D.null Nothing) |> D.andThen (\_ -> arg 2 (D.maybe (D.field "kind" vesselKind))), D.succeed Nothing ])
                )

        "combatGeometry.sphereHit" ->
            Just (D.map4 (\from to body radius -> Geometry.sphereHit from to body radius |> Maybe.map E.float |> Maybe.withDefault E.null) (arg 0 aloft) (arg 1 aloft) (arg 2 aloft) (arg 3 D.float))

        "vehicleStatus.constants" ->
            Just (D.succeed (E.object [ ( "SURFACE_DEPTH", E.float Vehicle.surfaceDepth ) ]))

        "vehicleStatus.isSurfaced" ->
            Just (call1 (D.map (\d -> { depth = d }) (D.field "depth" D.float)) E.bool Vehicle.isSurfaced)

        "vehicleStatus.droneReturnSpeed" ->
            Just (call1 (D.maybe (D.field "mobility" D.float)) E.float Vehicle.droneReturnSpeed)

        "vehicleStatus.tetherAttachment" ->
            Just (call1 hull encodePoint Vehicle.tetherAttachment)

        "vehicleStatus.recoveryDock" ->
            Just (call1 hull encodePoint Vehicle.recoveryDock)

        "vehicleStatus.droneStatus" ->
            Just
                (call1
                    (D.map2 Tuple.pair
                        (D.map4 (\x y depth speed -> { x = x, y = y, depth = depth, speed = speed }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "speed" D.float))
                        (D.field "drone" (D.map5 (\x y depth mode mobility -> { x = x, y = y, depth = depth, mode = mode, mobility = mobility }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "mode" D.string) (D.maybe (D.field "mobility" D.float))))
                    )
                    (\d -> E.object [ ( "deployed", E.bool d.deployed ), ( "distance", E.float d.distance ), ( "returnSpeed", E.float d.returnSpeed ), ( "outrunning", E.bool d.outrunning ), ( "canRecover", E.bool d.canRecover ), ( "warning", E.string d.warning ) ])
                    (\( s, d ) -> Vehicle.droneStatus s d)
                )

        "pressure.depthLimit" ->
            Just (call1 (D.map2 (\o h -> { outerHull = o, hull = h }) (D.field "outerHull" D.float) (D.field "hull" D.float)) E.float Pressure.depthLimit)

        "pressure.pressureLevel" ->
            Just (call1 (D.map3 (\d o h -> { depth = d, outerHull = o, hull = h }) (D.field "depth" D.float) (D.field "outerHull" D.float) (D.field "hull" D.float)) E.int Pressure.pressureLevel)

        "pressure.updatePressure" ->
            Just (call2 pressureBoat D.float encodePressureBoat (\s dt -> Pressure.updatePressure dt s))

        _ ->
            Nothing


coastline : Float -> Sim.Coast.Coastline
coastline =
    Sim.Coast.coastline
