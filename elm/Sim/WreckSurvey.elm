module Sim.WreckSurvey exposing (SurveyPass, addScan, scanRate, surveyComplete)

{-| Surveying a wreck by side-scan or by ROV photographs. The mission
definition owns the criteria.
-}

import PatrolCriteria exposing (SurveyCriteria)
import Sim.Equipment as Equipment
import Sim.Math as M


type alias SurveyPass =
    { range : Float, vertical : Float, speed : Float, sonar : Float }


{-| Scan seconds earned per patrol second. Both ranges are strict limits and
the knot band is inclusive. Sonar below its working threshold earns nothing.
-}
scanRate : SurveyPass -> SurveyCriteria -> Float
scanRate pass c =
    let
        speed : Float
        speed =
            M.abs pass.speed

        inside : Bool
        inside =
            pass.range < c.horizontalRange && pass.vertical < c.verticalRange && c.slowestKnots <= speed && speed <= c.fastestKnots
    in
    if inside then
        Equipment.operatingFraction pass.sonar

    else
        0


addScan : Float -> Float -> Float -> SurveyCriteria -> Float
addScan scan rate dt c =
    M.min c.scanSeconds (scan + dt * rate)


surveyComplete : { a | scan : Float, photoAngles : List Float } -> SurveyCriteria -> Bool
surveyComplete op c =
    c.scanSeconds <= op.scan || c.photographs <= List.length op.photoAngles
