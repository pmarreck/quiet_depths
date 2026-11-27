module Sim.SurfaceMotion exposing (Offset, Point, Pose, Sea, Wave, boatLocal, boatPoint, hash01, periscopeDepth, surfaceHeight, surfaceMotion, waveComponents, wavePhaseAt)

{-| The sea surface, how a hull near it rides the waves, conversions between
the boat's own axes and the world, and the seeded hash the whole patrol draws
its chances from.
-}

import Bitwise
import Sim.HullDesign exposing (design)
import Sim.Math as M


periscopeDepth : Float
periscopeDepth =
    15


type alias Wave =
    { kx : Float, ky : Float, omega : Float, amplitude : Float }


waveComponents : List Wave
waveComponents =
    [ { kx = 0.023, ky = 0, omega = 0.85, amplitude = 1.1 }
    , { kx = 0, ky = 0.038, omega = 1.1, amplitude = 0.65 }
    , { kx = 0.065, ky = 0.065, omega = -1.3, amplitude = 0.24 }
    , { kx = 0.14, ky = 0.06, omega = 1.8, amplitude = 0.3 }
    , { kx = 0, ky = 0.31, omega = -2.3, amplitude = 0.11 }
    ]


{-| `wavePhase` accumulates during play; `sampledAt` is when it was taken.
-}
type alias Sea a =
    { a | waveScale : Float, waveSpeed : Float, wavePhase : Maybe Float, sampledAt : Maybe Float }


type alias Point =
    { x : Float, y : Float, depth : Float }


type alias Pose =
    { x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float }


{-| Offsets along the boat's own axes: starboard, forward and down.
-}
type alias Offset =
    { side : Float, forward : Float, down : Float }


{-| A saved or photographed frame can be sampled again without retiming every
preceding wave when the weather front changes.
-}
wavePhaseAt : Float -> Sea a -> Float
wavePhaseAt time sea =
    case sea.wavePhase of
        Nothing ->
            time * sea.waveSpeed

        Just phase ->
            phase + (time - Maybe.withDefault time sea.sampledAt) * sea.waveSpeed


surfaceHeight : Float -> Float -> Float -> Sea a -> Float
surfaceHeight x y time sea =
    let
        phase : Float
        phase =
            wavePhaseAt time sea
    in
    sea.waveScale * List.foldl (\w sum -> sum + w.amplitude * sin (x * w.kx + y * w.ky + phase * w.omega)) 0 waveComponents


{-| JavaScript's `value || 0`.
-}
orZero : Float -> Float
orZero value =
    if M.truthy value then
        value

    else
        0


{-| How a hull near the surface heaves, pitches and rolls. Each wave is felt
through a 1.25-second first-order lag, so long swells carry the hull and
short crests mostly pass beneath it. Below periscope depth the sea has no
effect.
-}
surfaceMotion : { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float } -> Sea b -> Float -> Pose
surfaceMotion boat sea time =
    let
        response : Float
        response =
            M.max 0 (1 - M.max 0 boat.depth / periscopeDepth) ^ 2
    in
    if not (M.truthy response) then
        { x = boat.x, y = boat.y, heading = boat.heading, depth = boat.depth, pitch = boat.pitch, roll = 0 }

    else
        let
            hullRadius : Float
            hullRadius =
                design.hullRadius

            angle : Float
            angle =
                boat.heading * pi / 180

            east : Float
            east =
                sin angle

            north : Float
            north =
                cos angle

            arm : Float
            arm =
                23

            phase : Float
            phase =
                wavePhaseAt time sea

            ( heave, pitchSlope, rollSlope ) =
                List.foldl
                    (\w ( h, p, r ) ->
                        let
                            at : Float
                            at =
                                boat.x * w.kx + boat.y * w.ky + phase * w.omega

                            forward : Float
                            forward =
                                w.kx * east + w.ky * north

                            starboard : Float
                            starboard =
                                w.kx * north - w.ky * east

                            lag : Float
                            lag =
                                1.25 * w.omega * sea.waveSpeed

                            scale : Float
                            scale =
                                w.amplitude * sea.waveScale / (1 + lag * lag)

                            s : Float
                            s =
                                sin at

                            c : Float
                            c =
                                cos at

                            height : Float
                            height =
                                scale * (s - lag * c)

                            slope : Float
                            slope =
                                scale * (c + lag * s)
                        in
                        ( h + height * (1 + cos (forward * arm)) / 2
                        , p + slope * sin (forward * arm) / arm
                        , r + slope * sin (starboard * hullRadius) / hullRadius
                        )
                    )
                    ( 0, 0, 0 )
                    waveComponents
        in
        { x = boat.x
        , y = boat.y
        , heading = boat.heading
        , depth = boat.depth + response * (hullRadius / 2 - heave)
        , pitch = boat.pitch + response * atan pitchSlope
        , roll = response * 0.45 * atan rollSlope
        }


{-| A point on the boat in world coordinates. Roll, pitch and heading apply
in the same order as the renderer's YXZ hull transform.
-}
boatPoint : { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float } -> Offset -> Point
boatPoint boat offset =
    let
        angle : Float
        angle =
            boat.heading * pi / 180

        sn : Float
        sn =
            sin angle

        cs : Float
        cs =
            cos angle

        cp : Float
        cp =
            cos (orZero boat.pitch)

        sp : Float
        sp =
            sin (orZero boat.pitch)

        cr : Float
        cr =
            cos (orZero boat.roll)

        sr : Float
        sr =
            sin (orZero boat.roll)

        right : Float
        right =
            offset.side * cr + offset.down * sr

        below : Float
        below =
            offset.down * cr - offset.side * sr

        ahead : Float
        ahead =
            offset.forward * cp + below * sp
    in
    { x = boat.x + right * cs + ahead * sn
    , y = boat.y - right * sn + ahead * cs
    , depth = boat.depth - offset.forward * sp + below * cp
    }


{-| A world point along the boat's own axes; the inverse of `boatPoint`.
-}
boatLocal : { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float, roll : Float } -> Point -> Offset
boatLocal boat at =
    let
        angle : Float
        angle =
            boat.heading * pi / 180

        sn : Float
        sn =
            sin angle

        cs : Float
        cs =
            cos angle

        cp : Float
        cp =
            cos (orZero boat.pitch)

        sp : Float
        sp =
            sin (orZero boat.pitch)

        cr : Float
        cr =
            cos (orZero boat.roll)

        sr : Float
        sr =
            sin (orZero boat.roll)

        dx : Float
        dx =
            at.x - boat.x

        dy : Float
        dy =
            at.y - boat.y

        dz : Float
        dz =
            at.depth - boat.depth

        ahead : Float
        ahead =
            dx * sn + dy * cs

        right : Float
        right =
            dx * cs - dy * sn

        below : Float
        below =
            ahead * sp + dz * cp
    in
    { side = right * cr - below * sr, forward = ahead * cp - dz * sp, down = below * cr + right * sr }


{-| A seeded value in [0, 1) for draw `n`, from 32-bit integer mixing. Seeds
and draws are wrapped to 32 bits as JavaScript's `| 0` and `Math.imul` do.
-}
hash01 : Float -> Float -> Float
hash01 seed n =
    let
        mix : Int -> Int -> Int -> Int
        mix x multiplier shift =
            M.imul (Bitwise.xor x (Bitwise.shiftRightZfBy shift x)) multiplier

        start : Int
        start =
            M.toInt32 (seed + toFloat (M.imul (M.toInt32 (n + 1)) 0x9E3779B9))

        mixed : Int
        mixed =
            mix (mix start 0x21F0AAAD 16) 0x735A2D97 15
    in
    toFloat (Bitwise.shiftRightZfBy 0 (Bitwise.xor mixed (Bitwise.shiftRightZfBy 15 mixed))) / 4294967296
