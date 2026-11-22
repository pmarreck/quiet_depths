module PatrolMission exposing (Briefing, Mission(..), Objective(..), all, briefing, fromId, startingTorpedoes)

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


type Objective
    = Photographs
    | SinkShips String (List String)
    | Survive
    | ReachGate Float
    | TrackQuietly
    | FinishOperation
    | FleetLead Int


type alias Briefing =
    { id : String
    , name : String
    , category : String
    , duration : String
    , description : String
    , short : String
    , objective : Objective
    }


all : List Mission
all =
    [ Recon, Intercept, Convoy, BigKahuna, SubHunt, Transit, Shadow, UnderseaRescue, SurfaceRescue, Survey, Tiebreaker ]


fromId : String -> Maybe Mission
fromId id =
    all |> List.filter (\mission -> (briefing mission).id == id) |> List.head


briefing : Mission -> Briefing
briefing mission =
    case mission of
        Recon ->
            Briefing "recon" "A quiet observation" "RECONNAISSANCE" "8–12 MIN"
                "Photograph the briefed number of different merchant ships through your periscope. Leave the escort wondering if you were ever there."
                "Photograph the merchant convoy"
                Photographs

        Intercept ->
            Briefing "intercept" "The long way home" "INTERCEPTION" "10–15 MIN"
                "Intercept the briefed military freighter. Confirm her silhouette before firing. The fishing boats are neutral."
                "Identify and sink the military freighter"
                (SinkShips "cobalt" [])

        Convoy ->
            Briefing "seek-and-destroy" "Seek and Destroy: Convoy" "SEEK AND DESTROY" "12–18 MIN"
                "Find the escorted convoy and sink all three military transports. Fishing boats are neutral. Surface at extraction when the convoy is down."
                "Find and sink three military transports"
                (SinkShips "cobalt" [ "meridian", "alder" ])

        BigKahuna ->
            Briefing "big-kahuna" "Big Kahuna" "CARRIER HUNT" "10–16 MIN"
                "Fleet carrier Solstice is sailing with a small escort. They are not expecting you. Two direct torpedo hits will start her sinking. Further hits shorten the wait. Her fighters can launch as soon as the alarm goes up. Surface at extraction to bring your crew home."
                "Sink the carrier and return to extraction"
                (SinkShips "solstice" [])

        SubHunt ->
            Briefing "seek-and-destroy-sub" "Seek and Destroy: Sub" "SUBMARINE HUNT" "10–18 MIN"
                "Find the hostile submarine. A second sub may be in the area. Sink what you can and surface at extraction to survive the patrol."
                "Hunt enemy submarines or withdraw to extraction"
                Survive

        Transit ->
            Briefing "sneaky-seamen" "Sneaky Seamen" "COVERT TRANSIT" "10–18 MIN"
                "Cross from Gate A to Gate B through a convoy patrol. At least one submarine is listening. Reach the far gate at any depth and bring your crew through alive."
                "Cross the patrol area to Gate B"
                (ReachGate 200)

        Shadow ->
            Briefing "shadow" "Just passing through" "SURVEILLANCE" "8–12 MIN"
                "Quietly track the convoy inside 4 km. Bring the traffic intelligence home."
                "Quietly track the convoy"
                TrackQuietly

        UnderseaRescue ->
            Briefing "undersea-rescue" "Someone is still knocking" "UNDERSEA RESCUE" "8–14 MIN"
                "A disabled submarine lies on the reef shelf. Hold 30–75 m from her at rescue depth, below 0.6 knots, while divers assess and recover survivors. Hostile patrols may still be nearby."
                "Hold at the wreck; recover survivors"
                FinishOperation

        SurfaceRescue ->
            Briefing "surface-rescue" "A light in the swell" "SURFACE RESCUE" "7–12 MIN"
                "A damaged research vessel is sinking. Surface and hold 30–85 m away, below 0.6 knots. Rescue launches bring survivors aboard. Enemy gunfire or ramming may force you to move."
                "Surface beside the casualty; hold position"
                FinishOperation

        Survey ->
            Briefing "survey" "What the sea remembers" "WRECK SURVEY" "8–12 MIN"
                "Survey an old wreck on the reef shelf. Collect 45 seconds of close sonar scanning, or photograph it from three different sides with your camera ROV. Stay within the 100 m cable."
                "Scan the wreck or take 3 ROV photographs"
                FinishOperation

        Tiebreaker ->
            Briefing "tiebreaker" "Tiebreaker" "FLEET ACTION" "8–15 MIN"
                "Two fleets are already exchanging fire. Each has three ships and one submarine. Your chart shows the areas assigned to our units before the battle. Ping or look for fresh evidence before committing a torpedo. Give our fleet a two-vessel lead, excluding your own sub. Once command opens extraction, you may leave or stay to help."
                "Give the friendly fleet a two-vessel lead"
                (FleetLead 2)
