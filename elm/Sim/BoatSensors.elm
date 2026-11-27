module Sim.BoatSensors exposing (Soundings, boatSurfacePose, scopePosition, scopeWashed, soundings)

{-| What the boat's instruments register at sea: how the hull rides the
waves, where the periscope's eye is and whether a wave washes over it, and
the echo sounder's readings.
-}

import Sim.Environment exposing (Environment)
import Sim.HullDesign exposing (design)
import Sim.Periscope exposing (Scope, scopeEyeHeight)
import Sim.SurfaceMotion exposing (Point, Pose, Sea, boatPoint, surfaceHeight, surfaceMotion)


{-| How the boat rides the sea in these conditions.
-}
boatSurfacePose : { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float } -> Sea b -> Float -> Pose
boatSurfacePose =
    surfaceMotion


{-| Where the periscope's eye is, raised as far as it has traveled.
-}
scopePosition : Pose -> Scope a -> Point
scopePosition pose s =
    boatPoint pose { side = 0, forward = negate design.scopeZ, down = negate (scopeEyeHeight s) }


{-| Whether the lens is under the passing wave, with a hand's breadth of spray.
-}
scopeWashed : { a | scope : Bool, scopeTravel : Maybe Float, x : Float, y : Float, heading : Float, depth : Float, pitch : Float, time : Float } -> Environment -> Bool
scopeWashed s e =
    let
        eye : Point
        eye =
            scopePosition (boatSurfacePose s e s.time) s
    in
    negate eye.depth <= surfaceHeight eye.x eye.y s.time e + 0.15


type alias Soundings =
    { waterDepth : Float, referenceDepth : Float, belowKeel : Float, keelOffset : Float }


soundings : Float -> Float -> Float -> Soundings
soundings waterDepth referenceDepth keelOffset =
    { waterDepth = waterDepth, referenceDepth = referenceDepth, belowKeel = waterDepth - referenceDepth - keelOffset, keelOffset = keelOffset }
