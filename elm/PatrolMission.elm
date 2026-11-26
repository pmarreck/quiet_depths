module PatrolMission exposing (Briefing, EncounterOrders(..), CrewWatch(..), Mission(..), Objective(..), all, briefing, estimatedMinutes, fromId, startingTorpedoes)

startingTorpedoes : Mission -> Int
startingTorpedoes mission =
    if mission == Tiebreaker then
        3
    else
        6


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
    = Photographs
    | SinkShips String (List String)
    | Survive
    | ReachGate Float
    | TrackQuietly
    | FinishOperation
    | FleetLead Int
    | ProtectConvoy String Int


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
                Photographs

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
                "Fleet carrier Solstice is sailing with a small escort. They are not expecting you. Two direct torpedo hits will start her sinking. Further hits shorten the wait. Her fighters can launch as soon as the alarm goes up. Surface at extraction to bring your crew home."
                "Sink the carrier and return to extraction"
                (SinkShips "solstice" [])

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
                "Quietly track the convoy inside 4 km. Bring the traffic intelligence home."
                "Quietly track the convoy"
                TrackQuietly

        UnderseaRescue ->
            Briefing "undersea-rescue" "Someone is still knocking" "UNDERSEA RESCUE" RoutineWatch Observe
                { standard = ( 8, 14 ), longer = ( 16, 30 ) }
                "A disabled submarine lies on the reef shelf. Hold 30–75 m from her at rescue depth, below 0.6 knots, while divers assess and recover survivors. Hostile patrols may still be nearby."
                "Hold at the wreck; recover survivors"
                FinishOperation

        SurfaceRescue ->
            Briefing "surface-rescue" "A light in the swell" "SURFACE RESCUE" RoutineWatch Observe
                { standard = ( 7, 12 ), longer = ( 14, 25 ) }
                "A damaged research vessel is sinking. Surface and hold 30–85 m away, below 0.6 knots. Rescue launches bring survivors aboard. Enemy gunfire or ramming may force you to move."
                "Surface beside the casualty; hold position"
                FinishOperation

        Survey ->
            Briefing "survey" "What the sea remembers" "WRECK SURVEY" RoutineWatch Observe
                { standard = ( 8, 12 ), longer = ( 16, 26 ) }
                "Survey an old wreck on the reef shelf. Pass within 100 m horizontally and 32 m vertically at 0.5–3 knots. Your sub scans automatically. Collect 45 seconds across as many passes as you need, or take three ROV photos from different sides. The cable reaches 100 m."
                "Scan the wreck or take 3 ROV photographs"
                FinishOperation

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
