module SimHarness.Watch exposing (function)

{-| Harness entries for sinking ships and the torpedo watch.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Carrier as Carrier
import Sim.ContactReadings as Readings
import Sim.Foundering as Foundering
import Sim.TorpedoWatch as TorpedoWatch
import Sim.Vessel as Vessel
import SimHarness.Codec exposing (andMap, arg, call1, call2, call3, flag, maybe, point, position3, safeInt, surfaceShip, vesselKind, wholeNumber)


vessel : D.Decoder (Foundering.Vessel {})
vessel =
    D.succeed (\vesselType hull sinkDepth sunkAt settled collapsed observed -> { kind = vesselType, hull = hull, sinkDepth = sinkDepth, sunkAt = sunkAt, settled = settled, collapsed = collapsed, wreckObserved = observed })
        |> andMap (D.field "kind" vesselKind)
        |> andMap (D.field "hull" D.float)
        |> andMap (D.maybe (D.field "sinkDepth" D.float))
        |> andMap (D.maybe (D.field "sunkAt" D.float))
        |> andMap (flag "settled")
        |> andMap (flag "collapsed")
        |> andMap (D.maybe (D.at [ "wreckMark", "observed" ] D.bool) |> D.map (Maybe.withDefault False))


carrier : D.Decoder (Carrier.Carrier {})
carrier =
    D.map5 (\hits hull flood disabled speed -> { directHits = hits, hull = hull, flood = flood, disabled = disabled, speed = speed })
        (D.field "directHits" D.int)
        (D.field "hull" D.float)
        (D.field "flood" D.float)
        (D.field "disabled" D.bool)
        (D.field "speed" D.float)


encodeCarrier : Carrier.Carrier {} -> E.Value
encodeCarrier c =
    E.object [ ( "directHits", E.int c.directHits ), ( "hull", E.float c.hull ), ( "flood", E.float c.flood ), ( "disabled", E.bool c.disabled ), ( "speed", E.float c.speed ) ]


{-| A ship as incidental damage reads it: hull defaults to 100 and direct
hits to none, as the TypeScript's `??` does.
-}
struck : D.Decoder { kind : Vessel.Kind, hull : Float, directHits : Int }
struck =
    D.map3 (\kind hull hits -> { kind = kind, hull = hull, directHits = hits })
        (D.field "kind" vesselKind)
        (D.maybe (D.field "hull" D.float) |> D.map (Maybe.withDefault 100))
        (D.maybe (D.field "directHits" D.int) |> D.map (Maybe.withDefault 0))


{-| A saved carrier passes when its counts are whole and the rules hold.
-}
validCarrier : D.Value -> Bool
validCarrier value =
    D.decodeValue
        (D.map4 (\fighters flood hits hull -> Carrier.validCarrier { fighterCount = fighters, flood = flood, directHits = hits, hull = hull })
            (D.field "fighterCount" wholeNumber)
            (D.field "flood" D.float)
            (D.field "directHits" safeInt)
            (D.field "hull" D.float)
        )
        value
        |> Result.withDefault False


{-| A number an old save may lack reads as NaN, which the readings treat as
JavaScript treats undefined.
-}
lenient : String -> D.Decoder Float
lenient key =
    D.oneOf [ D.field key D.float, D.succeed (0 / 0) ]


fix : D.Decoder Readings.Fix
fix =
    D.succeed Readings.Fix
        |> andMap (lenient "x")
        |> andMap (lenient "y")
        |> andMap (lenient "time")
        |> andMap (lenient "vx")
        |> andMap (lenient "vy")
        |> andMap (lenient "positionSigma")
        |> andMap (lenient "velocitySigma")
        |> andMap (lenient "maneuverSigma")


contact : D.Decoder (Readings.Contact {})
contact =
    D.succeed (\x y range bearing confidence age f -> { x = x, y = y, range = range, bearing = bearing, confidence = confidence, age = age, fix = f })
        |> andMap (lenient "x")
        |> andMap (lenient "y")
        |> andMap (lenient "range")
        |> andMap (D.field "bearing" D.float)
        |> andMap (lenient "confidence")
        |> andMap (lenient "age")
        |> andMap (D.maybe (D.field "fix" fix))


method : D.Decoder Readings.Method
method =
    D.string
        |> D.andThen
            (\m ->
                case m of
                    "visual" ->
                        D.succeed Readings.Visual

                    "passive" ->
                        D.succeed Readings.Passive

                    _ ->
                        D.fail m
            )


encodePose : { roll : Float, pitch : Float, wave : Float } -> E.Value
encodePose p =
    E.object [ ( "roll", E.float p.roll ), ( "pitch", E.float p.pitch ), ( "wave", E.float p.wave ) ]


shot : D.Decoder { id : Int, x : Float, y : Float, depth : Float, enemy : Bool, aim : Maybe { x : Float, y : Float }, orderedDepth : Float, diverted : Bool }
shot =
    D.succeed (\id x y depth owner aim ordered diverted -> { id = id, x = x, y = y, depth = depth, enemy = owner == "enemy", aim = aim, orderedDepth = ordered, diverted = diverted })
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "owner" D.string)
        |> andMap (D.maybe (D.field "aim" (D.nullable point)) |> D.map (Maybe.andThen identity))
        |> andMap (D.field "orderedDepth" D.float)
        |> andMap (D.field "diverted" D.bool)


echo : D.Decoder TorpedoWatch.Echo
echo =
    D.succeed TorpedoWatch.Echo
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (D.field "inboundRun" D.bool)


encodeEcho : TorpedoWatch.Echo -> E.Value
encodeEcho e =
    E.object [ ( "id", E.int e.id ), ( "time", E.float e.time ), ( "x", E.float e.x ), ( "y", E.float e.y ), ( "depth", E.float e.depth ), ( "speed", E.float e.speed ), ( "inboundRun", E.bool e.inboundRun ) ]


track : D.Decoder TorpedoWatch.Track
track =
    D.succeed TorpedoWatch.Track
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (D.field "inboundRun" D.bool)
        |> andMap (D.field "arrival" (D.nullable D.float))
        |> andMap (D.field "fixes" D.int)
        |> andMap (D.field "activeAt" D.float)
        |> andMap (D.field "activeX" D.float)
        |> andMap (D.field "activeY" D.float)
        |> andMap (D.field "course" (D.nullable D.int))


encodeTrack : TorpedoWatch.Track -> E.Value
encodeTrack t =
    E.object
        [ ( "id", E.int t.id )
        , ( "time", E.float t.time )
        , ( "x", E.float t.x )
        , ( "y", E.float t.y )
        , ( "depth", E.float t.depth )
        , ( "speed", E.float t.speed )
        , ( "inboundRun", E.bool t.inboundRun )
        , ( "fixes", E.int t.fixes )
        , ( "activeAt", E.float t.activeAt )
        , ( "activeX", E.float t.activeX )
        , ( "activeY", E.float t.activeY )
        , ( "course", maybe E.int t.course )
        , ( "arrival", maybe E.float t.arrival )
        ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "foundering.founderingPose" ->
            Just (call2 surfaceShip D.float encodePose Foundering.founderingPose)

        "foundering.submergedDepth" ->
            Just (call1 surfaceShip E.float Foundering.submergedDepth)

        "foundering.descentSpeed" ->
            Just (call1 D.float E.float Foundering.descentSpeed)

        "foundering.wreckVisible" ->
            Just (call2 vessel D.float E.bool Foundering.wreckVisible)

        "carrier.constants" ->
            Just
                (D.succeed
                    (E.object
                        [ ( "carrierId", E.string Carrier.carrierId )
                        , ( "carrierSize", E.object [ ( "halfLength", E.float Carrier.carrierSize.halfLength ), ( "halfBeam", E.float Carrier.carrierSize.halfBeam ), ( "deckHeight", E.float Carrier.carrierSize.deckHeight ) ] )
                        ]
                    )
                )

        "carrier.registerCarrierHit" ->
            Just (call1 carrier encodeCarrier Carrier.registerCarrierHit)

        "carrier.advanceCarrierFlood" ->
            Just (call2 carrier D.float encodeCarrier (\c dt -> Carrier.advanceCarrierFlood dt c))

        "carrier.incidentalHull" ->
            Just (call2 struck D.float E.float Carrier.incidentalHull)

        "carrier.carrierDoomed" ->
            Just (call1 (D.field "directHits" D.int) E.bool (\hits -> Carrier.carrierDoomed { directHits = hits }))

        "carrier.carrierDescentFactor" ->
            Just (call1 (D.field "directHits" D.int) E.float (\hits -> Carrier.carrierDescentFactor { directHits = hits }))

        "carrier.validCarrier" ->
            Just (D.map (validCarrier >> E.bool) (arg 0 D.value))

        "contactReadings.observationBias" ->
            Just (call3 D.float D.string method E.float Readings.observationBias)

        "contactReadings.estimateAt" ->
            Just
                (call2 (D.nullable contact)
                    D.float
                    (Maybe.map (\e -> E.object [ ( "x", E.float e.x ), ( "y", E.float e.y ), ( "major", E.float e.major ), ( "minor", E.float e.minor ), ( "angle", E.float e.angle ), ( "age", E.float e.age ), ( "hasFix", E.bool e.hasFix ) ]) >> Maybe.withDefault E.null)
                    Readings.estimateAt
                )

        "contactReadings.sonarReading" ->
            Just
                (call2 (D.map3 (\x y time -> { x = x, y = y, time = time }) (D.field "x" D.float) (D.field "y" D.float) (D.field "time" D.float))
                    contact
                    (\r -> E.object [ ( "bearing", E.float r.bearing ), ( "range", Maybe.map E.float r.range |> Maybe.withDefault E.null ) ])
                    Readings.sonarReading
                )

        "torpedoWatch.gameEcho" ->
            Just (D.map4 (\b s t v -> encodeEcho (TorpedoWatch.gameEcho b s t v)) (arg 0 position3) (arg 1 shot) (arg 2 D.float) (arg 3 D.float))

        "torpedoWatch.observe" ->
            Just (D.map4 (\watch tracks e active -> E.list encodeTrack (TorpedoWatch.observe watch e active tracks)) (arg 0 point) (arg 0 (D.field "torpedoTracks" (D.list track))) (arg 1 echo) (arg 2 D.bool))

        "torpedoWatch.threats" ->
            Just (call2 D.float (D.list track) (E.list encodeTrack) TorpedoWatch.threats)

        _ ->
            Nothing
