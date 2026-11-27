module PatrolMission exposing (Briefing, EncounterOrders(..), CrewWatch(..), Mission(..), Objective(..), EncounterOdds, PatrolTiming, PhotoCriteria, RescueCriteria, SinkingCasualty, SurveyCriteria, TrackingCriteria, all, briefing, estimatedMinutes, fromId, encounterOdds, patrolTiming, startingTorpedoes, surveyCriteria)

startingTorpedoes : Int
startingTorpedoes =
    6


{-| Patrol seconds before command recalls the sub. A longer mission's window
starts after its protected transit, which ends once the sub has spent
searchSeconds of unpaused play and protectedTransit seconds of patrol time.
-}
type alias PatrolTiming =
    { standardWindow : Int
    , longerWindow : Int
    , protectedTransit : Int
    , searchSeconds : Int
    }


{-| Each twelve-hour watch rolls independent chances for each kind of passing
traffic. On December 25 and January 1, hostile captains keep only
holidayInitiative of their usual readiness to start trouble.
-}
type alias EncounterOdds =
    { friendlySub : Float
    , hostileSub : Float
    , friendlySurface : Float
    , hostileSurface : Float
    , holidayInitiative : Float
    }


encounterOdds : EncounterOdds
encounterOdds =
    { friendlySub = 0.28
    , hostileSub = 0.3
    , friendlySurface = 0.3
    , hostileSurface = 0.3
    , holidayInitiative = 0.25
    }


patrolTiming : PatrolTiming
patrolTiming =
    { standardWindow = 30 * 60
    , longerWindow = 90 * 60
    , protectedTransit = 20 * 60
    , searchSeconds = 3 * 60
    }


type Mission
    = Recon
    | Intercept
    | Convoy
    | BigKahuna
    | SubHunt
    | Transit
    | Shadow
    | UnderseaRescue
    | SurfaceRescue
    | Survey
    | Tiebreaker
    | Henhouse


type Objective
    = Photographs PhotoCriteria
    | SinkShips String (List String)
    | SinkCarrier String Int
    | Survive
    | ReachGate Float
    | TrackQuietly TrackingCriteria
    | RecoverSurvivors RescueCriteria
    | SurveyWreck SurveyCriteria
    | FleetLead Int
    | ProtectConvoy String Int


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


{-| Direct torpedo hits that start a carrier's irreversible flooding. -}
carrierFatalHits : Int
carrierFatalHits =
    2


capitalized : String -> String
capitalized words =
    String.toUpper (String.left 1 words) ++ String.dropLeft 1 words


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


type CrewWatch
    = RoutineWatch
    | ActionStations


type EncounterOrders
    = Observe
    | Engage


type alias Briefing =
    { id : String
    , name : String
    , category : String
    , crewWatch : CrewWatch
    , encounterOrders : EncounterOrders
    , playtime : { standard : ( Int, Int ), longer : ( Int, Int ) }
    , description : String
    , short : String
    , objective : Objective
    }


estimatedMinutes : Bool -> Briefing -> String
estimatedMinutes longer mission =
    let
        ( low, high ) =
            if longer then
                mission.playtime.longer
            else
                mission.playtime.standard
    in
    String.fromInt low ++ "–" ++ String.fromInt high ++ " MIN"


all : List Mission
all =
    [ Recon, Intercept, Convoy, BigKahuna, SubHunt, Transit, Shadow, UnderseaRescue, SurfaceRescue, Survey, Tiebreaker, Henhouse ]


fromId : String -> Maybe Mission
fromId id =
    all |> List.filter (\mission -> (briefing mission).id == id) |> List.head


briefing : Mission -> Briefing
briefing mission =
    case mission of
        Recon ->
            Briefing "recon" "A quiet observation" "RECONNAISSANCE" RoutineWatch Observe
                { standard = ( 8, 12 ), longer = ( 13, 22 ) }
                "Photograph the briefed number of different merchant ships through your periscope. Leave the escort wondering if you were ever there."
                "Photograph the merchant convoy"
                (Photographs merchantPhotos)

        Intercept ->
            Briefing "intercept" "The long way home" "INTERCEPTION" ActionStations Observe
                { standard = ( 10, 15 ), longer = ( 15, 25 ) }
                "Intercept the briefed military freighter. Confirm her silhouette before firing. The fishing boats are neutral."
                "Identify and sink the military freighter"
                (SinkShips "cobalt" [])

        Convoy ->
            Briefing "seek-and-destroy" "Seek and Destroy: Convoy" "SEEK AND DESTROY" ActionStations Observe
                { standard = ( 12, 18 ), longer = ( 18, 30 ) }
                "Find the escorted convoy and sink all three military transports. Fishing boats are neutral. Surface at extraction when the convoy is down."
                "Find and sink three military transports"
                (SinkShips "cobalt" [ "meridian", "alder" ])

        BigKahuna ->
            Briefing "big-kahuna" "Big Kahuna" "CARRIER HUNT" ActionStations Observe
                { standard = ( 10, 16 ), longer = ( 15, 26 ) }
                ("Fleet carrier Solstice is sailing with a small escort. They are not expecting you. " ++ capitalized (countWord carrierFatalHits) ++ " direct torpedo hits will start her sinking. Further hits shorten the wait. Her fighters can launch as soon as the alarm goes up. Surface at extraction to bring your crew home.")
                "Sink the carrier and return to extraction"
                (SinkCarrier "solstice" carrierFatalHits)

        SubHunt ->
            Briefing "seek-and-destroy-sub" "Seek and Destroy: Sub" "SUBMARINE HUNT" ActionStations Observe
                { standard = ( 10, 18 ), longer = ( 16, 30 ) }
                "Find the hostile submarine. A second sub may be in the area. Sink what you can and surface at extraction to survive the patrol."
                "Hunt enemy submarines or withdraw to extraction"
                Survive

        Transit ->
            Briefing "sneaky-seamen" "Sneaky Seamen" "COVERT TRANSIT" RoutineWatch Engage
                { standard = ( 10, 18 ), longer = ( 14, 27 ) }
                "Cross from Gate A to Gate B through a convoy patrol. At least one submarine is listening. Reach the far gate at any depth and bring your crew through alive."
                "Cross the patrol area to Gate B"
                (ReachGate 200)

        Shadow ->
            Briefing "shadow" "Just passing through" "SURVEILLANCE" RoutineWatch Observe
                { standard = ( 8, 12 ), longer = ( 13, 23 ) }
                ("Quietly track the convoy inside " ++ String.fromFloat (convoyTracking.listeningRange / 1000) ++ " km. Bring the traffic intelligence home.")
                "Quietly track the convoy"
                (TrackQuietly convoyTracking)

        UnderseaRescue ->
            Briefing "undersea-rescue" "Someone is still knocking" "UNDERSEA RESCUE" RoutineWatch Observe
                { standard = ( 8, 14 ), longer = ( 16, 30 ) }
                ("A disabled submarine lies on the reef shelf. Hold " ++ separation underseaRescue ++ " from her at rescue depth, below " ++ String.fromFloat underseaRescue.fastestKnots ++ " knots, while divers assess and recover survivors. Hostile patrols may still be nearby.")
                "Hold at the wreck; recover survivors"
                (RecoverSurvivors underseaRescue)

        SurfaceRescue ->
            Briefing "surface-rescue" "A light in the swell" "SURFACE RESCUE" RoutineWatch Observe
                { standard = ( 7, 12 ), longer = ( 14, 25 ) }
                ("A damaged research vessel is sinking. Surface and hold " ++ separation surfaceRescue ++ " away, below " ++ String.fromFloat surfaceRescue.fastestKnots ++ " knots. Rescue launches bring survivors aboard. Enemy gunfire or ramming may force you to move.")
                "Surface beside the casualty; hold position"
                (RecoverSurvivors surfaceRescue)

        Survey ->
            Briefing "survey" "What the sea remembers" "WRECK SURVEY" RoutineWatch Observe
                { standard = ( 8, 12 ), longer = ( 16, 26 ) }
                (surveyDescription surveyCriteria)
                ("Scan the wreck or take " ++ String.fromInt surveyCriteria.photographs ++ " ROV photographs")
                (SurveyWreck surveyCriteria)

        Tiebreaker ->
            Briefing "tiebreaker" "Tiebreaker" "FLEET ACTION" ActionStations Engage
                { standard = ( 8, 15 ), longer = ( 15, 28 ) }
                "Two fleets are already exchanging fire. Each has three ships and one submarine. Your chart shows the areas assigned to our units before the battle. Ping or look for fresh evidence before committing a torpedo. Give our fleet a two-vessel lead, excluding your own sub. Once command opens extraction, you may leave or stay to help."
                "Give the friendly fleet a two-vessel lead"
                (FleetLead 2)

        Henhouse ->
            Briefing "wolf-in-the-henhouse" "Wolf in the Henhouse" "CONVOY DEFENSE" RoutineWatch Engage
                { standard = ( 6, 12 ), longer = ( 11, 22 ) }
                "Plover is already on the bottom. A submarine is hunting the rest of our convoy. Surface near the ships to be hailed, then keep the signaling ship in your periscope or tower binoculars. Her lamp repeats an estimate. Your listeners may be able to match it to a bearing. You can also hunt on your own. Sink the hunter before two more friendly vessels go down."
                "Sink the hunter before two more convoy losses"
                (ProtectConvoy "wolf" 2)
