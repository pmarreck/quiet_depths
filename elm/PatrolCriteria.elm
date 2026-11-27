module PatrolCriteria exposing (PhotoCriteria, RescueCriteria, SinkingCasualty, SurveyCriteria, TrackingCriteria, convoyTracking, countWord, merchantPhotos, separation, surfaceRescue, surveyCriteria, surveyDescription, underseaRescue)

{-| The numbers each patrol objective is judged by, and the wording the
briefings build from them. The simulation reads the same values.
-}


{-| A merchant earns credit when its bearing is strictly within framingDegrees
of the reticle. Each patrol needs fewestPhotos plus a seeded number of extra
ships below goalSpread.
-}
type alias PhotoCriteria =
    { framingDegrees : Float
    , fewestPhotos : Int
    , goalSpread : Int
    }


merchantPhotos : PhotoCriteria
merchantPhotos =
    { framingDegrees = 5
    , fewestPhotos = 2
    , goalSpread = 2
    }


{-| Tracking time accumulates while the sub is quieter than quieterThan,
deeper than deeperThan and a convoy merchant is inside the listening range,
which shrinks with sonar condition. Each patrol's goal is shortestGoal plus a
seeded number of goalStep increments below goalSteps.
-}
type alias TrackingCriteria =
    { listeningRange : Float
    , quieterThan : Float
    , deeperThan : Float
    , shortestGoal : Int
    , goalStep : Int
    , goalSteps : Int
    }


convoyTracking : TrackingCriteria
convoyTracking =
    { listeningRange = 4000
    , quieterThan = 27
    , deeperThan = 15
    , shortestGoal = 150
    , goalStep = 30
    , goalSteps = 4
    }


{-| The sub holds station while its separation from the casualty is within the
inclusive range, its speed is at most fastestKnots and its depth is strictly
within depthTolerance of the rescue depth. The team assesses, transfers each
survivor and returns over the given number of seconds while the sub holds.
A seeded share of sites have nobody left alive; others start with
fewestSurvivors plus a seeded count below survivorSpread. Survivors are lost
one at a time after a seeded delay from the casualty clock.
-}
type alias RescueCriteria =
    { closestRange : Float
    , farthestRange : Float
    , depthTolerance : Float
    , fastestKnots : Float
    , assessmentSeconds : Float
    , transferSeconds : Float
    , returnSeconds : Float
    , emptySiteChance : Float
    , fewestSurvivors : Int
    , survivorSpread : Int
    , casualtyClockStart : Float
    , firstLossDelay : Float
    , firstLossSpread : Float
    , laterLossDelay : Float
    , laterLossSpread : Float
    , sinking : Maybe SinkingCasualty
    }


{-| A sinking casualty starts at startDepth and settles one meter per
settleSeconds. After foundersAfter plus a seeded share of foundersSpread
seconds it goes down at sinkRate meters per second. Below lostBelow, nobody
left aboard can be saved.
-}
type alias SinkingCasualty =
    { startDepth : Float
    , settleSeconds : Float
    , foundersAfter : Float
    , foundersSpread : Float
    , sinkRate : Float
    , lostBelow : Float
    }


underseaRescue : RescueCriteria
underseaRescue =
    { closestRange = 30
    , farthestRange = 75
    , depthTolerance = 5
    , fastestKnots = 0.6
    , assessmentSeconds = 22
    , transferSeconds = 9
    , returnSeconds = 9
    , emptySiteChance = 0.08
    , fewestSurvivors = 8
    , survivorSpread = 8
    , casualtyClockStart = 240
    , firstLossDelay = 145
    , firstLossSpread = 90
    , laterLossDelay = 105
    , laterLossSpread = 110
    , sinking = Nothing
    }


surfaceRescue : RescueCriteria
surfaceRescue =
    { underseaRescue
        | farthestRange = 85
        , depthTolerance = 1
        , sinking =
            Just
                { startDepth = 2
                , settleSeconds = 500
                , foundersAfter = 860
                , foundersSpread = 220
                , sinkRate = 0.35
                , lostBelow = 15
                }
    }


separation : RescueCriteria -> String
separation c =
    String.fromFloat c.closestRange ++ "–" ++ String.fromFloat c.farthestRange ++ " m"


{-| A scanning pass counts while the sub is closer than both ranges, its speed
is within the inclusive knot band and its sonar works. The ROV route needs
the given number of photographs taken at least photoSeparation degrees apart
around the wreck.
-}
type alias SurveyCriteria =
    { scanSeconds : Float
    , horizontalRange : Float
    , verticalRange : Float
    , slowestKnots : Float
    , fastestKnots : Float
    , photographs : Int
    , photoSeparation : Float
    }


surveyCriteria : SurveyCriteria
surveyCriteria =
    { scanSeconds = 45
    , horizontalRange = 100
    , verticalRange = 32
    , slowestKnots = 0.5
    , fastestKnots = 3
    , photographs = 3
    , photoSeparation = 55
    }


countWord : Int -> String
countWord count =
    case count of
        1 ->
            "one"

        2 ->
            "two"

        3 ->
            "three"

        4 ->
            "four"

        5 ->
            "five"

        _ ->
            String.fromInt count


surveyDescription : SurveyCriteria -> String
surveyDescription c =
    "Survey an old wreck on the reef shelf. Pass within "
        ++ String.fromFloat c.horizontalRange
        ++ " m horizontally and "
        ++ String.fromFloat c.verticalRange
        ++ " m vertically at "
        ++ String.fromFloat c.slowestKnots
        ++ "–"
        ++ String.fromFloat c.fastestKnots
        ++ " knots. Your sub scans automatically. Collect "
        ++ String.fromFloat c.scanSeconds
        ++ " seconds across as many passes as you need, or take "
        ++ countWord c.photographs
        ++ " ROV photos from different sides. The cable reaches 100 m."
