module Sim.RescueOperation exposing (StationKeeping, casualtyDepth, criteriaFor, initialSurvivors, nextLossDelay, stationKeeping)

{-| Rescues: holding station beside the casualty, how many are aboard, when
the next one is lost, and how a sinking casualty goes down. The mission
definitions own the criteria.
-}

import PatrolCriteria exposing (RescueCriteria, SinkingCasualty)
import Sim.Math as M
import Sim.Site as Site


{-| Depth of a sinking casualty, never below its resting place on the seabed.
-}
casualtyDepth : Float -> Float -> SinkingCasualty -> Float -> Float
casualtyDepth age roll sink restingDepth =
    M.min restingDepth (sink.startDepth + age / sink.settleSeconds + M.max 0 (age - (sink.foundersAfter + roll * sink.foundersSpread)) * sink.sinkRate)


{-| A surface casualty uses the surface rules; any other site, or none, the
undersea rules.
-}
criteriaFor : Maybe Site.Kind -> RescueCriteria
criteriaFor site =
    if site == Just Site.SurfaceCasualty then
        PatrolCriteria.surfaceRescue

    else
        PatrolCriteria.underseaRescue


initialSurvivors : Float -> Float -> RescueCriteria -> Int
initialSurvivors emptyRoll countRoll c =
    if emptyRoll < c.emptySiteChance then
        0

    else
        c.fewestSurvivors + floor (countRoll * toFloat c.survivorSpread)


nextLossDelay : Int -> Float -> RescueCriteria -> Float
nextLossDelay dead roll c =
    if M.isZero (toFloat dead) then
        c.firstLossDelay + roll * c.firstLossSpread

    else
        c.laterLossDelay + roll * c.laterLossSpread


type alias StationKeeping =
    { onStation : Bool, holding : Bool }


{-| On station within the inclusive separation band and at most the fastest
speed; holding once the depth error is also strictly inside the tolerance.
-}
stationKeeping : Float -> Float -> Float -> RescueCriteria -> StationKeeping
stationKeeping range speed depthError c =
    let
        onStation : Bool
        onStation =
            c.closestRange <= range && range <= c.farthestRange && M.abs speed <= c.fastestKnots
    in
    { onStation = onStation, holding = onStation && M.abs depthError < c.depthTolerance }
