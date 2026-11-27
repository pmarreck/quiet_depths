module Sim.RovFlight exposing (cableGland, changeNosePitch, droneCameraPitch, droneTetherAttachment, maxNosePitch)

{-| The ROV's nose: degrees above the horizon, either ordered by the pilot or
left to the automatic depth controller (no order).
-}

import Sim.Math as M
import Sim.SurfaceMotion as Motion exposing (Offset, Point)


maxNosePitch : Float
maxNosePitch =
    60


depthHoldPitch : Float -> Float
depthHoldPitch verticalSpeed =
    -18 * M.max -1 (M.min 1 verticalSpeed)


{-| The camera's pitch in radians. -}
droneCameraPitch : Float -> Maybe Float -> Float
droneCameraPitch verticalSpeed nosePitch =
    Maybe.withDefault (depthHoldPitch verticalSpeed) nosePitch * pi / 180


{-| The cable gland is mounted aft on the starboard frame. The model and the
simulation share it, so pitching the nose keeps the cable seated.
-}
cableGland : Offset
cableGland =
    { side = 0.35, down = 0.2, forward = -1.1 }


droneTetherAttachment : { a | x : Float, y : Float, depth : Float, heading : Float, verticalSpeed : Float, nosePitch : Maybe Float } -> Point
droneTetherAttachment d =
    Motion.boatPoint { x = d.x, y = d.y, heading = d.heading, depth = d.depth, pitch = droneCameraPitch d.verticalSpeed d.nosePitch, roll = 0 } cableGland


{-| The pilot's order takes over from the depth controller, which is told to
hold the present depth.
-}
changeNosePitch : Float -> Bool -> { a | nosePitch : Maybe Float, verticalSpeed : Float, targetDepth : Float, depth : Float } -> { a | nosePitch : Maybe Float, verticalSpeed : Float, targetDepth : Float, depth : Float }
changeNosePitch degrees inverted drone =
    let
        current =
            Maybe.withDefault (depthHoldPitch drone.verticalSpeed) drone.nosePitch

        change =
            if inverted then
                negate degrees

            else
                degrees
    in
    { drone | nosePitch = Just (M.max (negate maxNosePitch) (M.min maxNosePitch (current + change))), targetDepth = drone.depth }
