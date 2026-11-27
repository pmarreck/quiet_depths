module Sim.ReconPhotos exposing (framed, photoGoal)

{-| Merchant photographs for the reconnaissance patrol. The mission
definition owns the criteria.
-}

import PatrolMission exposing (PhotoCriteria)
import Sim.Math as M


{-| Each patrol's seeded goal: the fewest photographs plus a share of the
spread.
-}
photoGoal : Float -> PhotoCriteria -> Int
photoGoal roll c =
    c.fewestPhotos + floor (roll * toFloat c.goalSpread)


{-| Whether a ship this many degrees off the scope's line of sight is in frame. -}
framed : Float -> PhotoCriteria -> Bool
framed offsetDegrees c =
    M.abs offsetDegrees < c.framingDegrees
