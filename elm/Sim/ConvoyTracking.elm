module Sim.ConvoyTracking exposing (Listener, Tracked, trackingConvoy, trackingGoal)

{-| Shadowing a convoy: tracking time accrues while the boat stays quiet and
deep with a convoy merchant inside its listening range. The mission
definition owns the criteria.
-}

import PatrolMission exposing (TrackingCriteria)
import Sim.Equipment as Equipment
import Sim.Math as M
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


trackingGoal : Float -> TrackingCriteria -> Int
trackingGoal roll c =
    c.shortestGoal + c.goalStep * floor (roll * toFloat c.goalSteps)


type alias Tracked b =
    { b | x : Float, y : Float, kind : Kind, hull : Float, incidental : Bool }


{-| `sonar` is the sonar's condition. -}
type alias Listener a b =
    { a | x : Float, y : Float, noise : Float, depth : Float, sonar : Float, ships : List (Tracked b) }


{-| Damaged sonar shortens the listening range. Passing traffic is not the
convoy.
-}
trackingConvoy : Listener a b -> TrackingCriteria -> Bool
trackingConvoy s c =
    if not (s.noise < c.quieterThan && c.deeperThan < s.depth) then
        False

    else
        let
            range =
                c.listeningRange * Equipment.operatingFraction s.sonar
        in
        List.any (\v -> not v.incidental && v.kind == Surface Merchant && v.hull > 0 && M.hypot2 (s.x - v.x) (s.y - v.y) < range) s.ships
