module Sim.PatrolCreate exposing (Options, Soundings, createGame, getSoundings, updateWatchWarnings)

{-| A new patrol: the boat fresh from port with the starting cast, the
mission's seeded layout, a long patrol's search area, and the watch's first
warnings; and the soundings and watch warnings the tick keeps current.
-}

import Dict
import Json.Decode as D
import PatrolMission exposing (Mission(..))
import Sim.AirSupport exposing (Sortie(..))
import Sim.Coast as Coast exposing (Coastline)
import Sim.Difficulty as Difficulty
import Sim.Drone as Drone exposing (Drone)
import Sim.Environment as Env
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.Missions as Missions
import Sim.PatrolPhase exposing (Phase(..))
import Sim.PatrolSearch as PatrolSearch
import Sim.PowerPlant exposing (DieselMode(..), EngineMode(..))
import Sim.Recon as Recon
import Sim.Ship as Ship exposing (Ship)
import Sim.Status exposing (Status(..))
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems exposing (Difficulty)
import Sim.TrafficEncounters as TrafficEncounters
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))
import Sim.WatchWarnings as WatchWarnings exposing (Battery(..), Warnings)
import Sim.World exposing (World)


{-| What the briefing chose: the time of day and weather (or random), whether
the weather changes, and the difficulty as the page stored it.
-}
type alias Options =
    { timeOfDay : Maybe String, weather : Maybe String, changing : Maybe Bool, difficulty : D.Value }


{-| The water under a hull: its depth, the hull's reference depth, and what
lies below the keel.
-}
type alias Soundings =
    { waterDepth : Float, referenceDepth : Float, belowKeel : Float, keelOffset : Float }


{-| Soundings under the boat (her keel lower as she pitches), or under the drone.
-}
getSoundings : Bool -> { s | x : Float, y : Float, depth : Float, pitch : Float, chart : Maybe Coastline, drone : { d | x : Float, y : Float, depth : Float } } -> Soundings
getSoundings drone s =
    let
        ( at, keelOffset ) =
            if drone then
                ( { x = s.drone.x, y = s.drone.y, depth = s.drone.depth }, 0.7 )

            else
                ( { x = s.x, y = s.y, depth = s.depth }, 5 + 27.5 * M.abs (sin s.pitch) )

        waterDepth : Float
        waterDepth =
            Coast.chartDepth s.chart at.x at.y
    in
    { waterDepth = waterDepth, referenceDepth = at.depth, belowKeel = waterDepth - at.depth - keelOffset, keelOffset = keelOffset }


level : Battery -> Int
level battery =
    case battery of
        Charged ->
            0

        Low ->
            1

        Critical ->
            2


{-| The watch calls out keel clearance under 20 m and a low or critical
battery as each rises, and reports each as it clears.
-}
updateWatchWarnings : { s | x : Float, y : Float, depth : Float, pitch : Float, chart : Maybe Coastline, drone : { d | x : Float, y : Float, depth : Float }, battery : Float, watchWarnings : Maybe Warnings, time : Float, events : List LogEntry } -> { s | x : Float, y : Float, depth : Float, pitch : Float, chart : Maybe Coastline, drone : { d | x : Float, y : Float, depth : Float }, battery : Float, watchWarnings : Maybe Warnings, time : Float, events : List LogEntry }
updateWatchWarnings s =
    let
        previous : Maybe Warnings
        previous =
            s.watchWarnings

        current : Warnings
        current =
            WatchWarnings.warnings (getSoundings False s).belowKeel s.battery previous

        wasBottom : Bool
        wasBottom =
            Maybe.map .bottom previous |> Maybe.withDefault False

        before : Int
        before =
            Maybe.map (.battery >> level) previous |> Maybe.withDefault 0

        cleared : List ( String, LogKind )
        cleared =
            (if wasBottom && not current.bottom then
                [ ( "Keel clearance restored to 20 m or more.", Info ) ]

             else
                []
            )
                ++ (if previous /= Nothing && level current.battery < before then
                        [ ( if current.battery == Low then
                                "Battery above 10%. Critical reserve warning cleared."

                            else
                                "Battery reserve restored to 20% or more."
                          , Info
                          )
                        ]

                    else
                        []
                   )
                ++ (if current.bottom && not wasBottom then
                        [ ( WatchWarnings.bottomCall, Warning ) ]

                    else
                        []
                   )
                ++ (if before < level current.battery then
                        WatchWarnings.batteryCall current.battery |> Maybe.map (\call -> [ ( call, Warning ) ]) |> Maybe.withDefault []

                    else
                        []
                   )
    in
    List.foldl (\( text, kind ) -> Mechanics.log text kind) { s | watchWarnings = Just current } cleared


{-| The cast patrol creation starts every patrol with, before its layout.
-}
startingShips : List Ship
startingShips =
    let
        ship : String -> String -> Kind -> Bool -> ( Float, Float ) -> Float -> Float -> Ship
        ship id name kind military ( x, y ) heading speed =
            Ship.fresh { id = id, name = name, kind = kind, x = x, y = y, heading = heading, speed = speed } |> (\v -> { v | military = Just military })
    in
    [ ship "cobalt" "Cobalt" (Surface Merchant) True ( 1450, 2700 ) 255 5
    , ship "meridian" "Meridian" (Surface Merchant) False ( 2350, 2900 ) 255 5
    , ship "kestrel" "Kestrel" (Surface Escort) True ( 2300, 2050 ) 255 7
    , ship "tern" "Tern" (Surface Fishing) False ( -850, 1350 ) 110 3
    , ship "echo" "Unknown submarine" Submarine True ( 3800, 900 ) 280 4 |> (\v -> { v | depth = Just 75 })
    ]


{-| The difficulty as the patrol keeps it: every setting present, each read
from the page's stored choice within its limits or at its default.
-}
patrolDifficulty : D.Value -> Difficulty
patrolDifficulty stored =
    let
        d : Difficulty.Difficulty
        d =
            Difficulty.decode stored
    in
    { drone = Just d.drone
    , damage = Just d.damage
    , pursuit = Just d.pursuit
    , depthStealth = Just d.depthStealth
    , detection = Just d.detection
    , airSupport = Just d.airSupport
    , satellite = Just d.satellite
    , pingDetection = Just d.pingDetection
    , longPatrol = Just d.longPatrol
    , showSuspicion = Just d.showSuspicion
    , omniscientChart = Just d.omniscientChart
    , orbitCamera = Just d.orbitCamera
    , instantReplay = Just d.instantReplay
    , enemyReplay = Just d.enemyReplay
    , torpedoCam = Just d.torpedoCam
    }


freshDrone : Drone
freshDrone =
    { mode = Drone.Stowed
    , x = 0
    , y = 0
    , depth = 25
    , heading = 0
    , battery = 100
    , nosePitch = Nothing
    , verticalSpeed = 0
    , speed = 0
    , targetSpeed = 0
    , targetDepth = 25
    , targetHeading = 0
    , collisionCooldown = 0
    , lowAlarm = False
    , rangeAlarm = False
    , lostReason = ""
    , returnStage = 0
    , returnClearance = 8
    , returnHoldSide = 18
    , returnHoldForward = 0
    , repairLimits = { hull = 100, mobility = 100, buoyancy = 100, camera = 100 }
    , buoyancy = 100
    , camera = 100
    , hull = 100
    , mobility = 100
    }


{-| A new patrol from the briefing's mission, seed and choices. An unknown
mission falls back to reconnaissance, and a zero seed seeds the random
draws with one.
-}
createGame : String -> Float -> Options -> World
createGame missionId seed options =
    let
        mission : Mission
        mission =
            PatrolMission.fromId missionId |> Maybe.withDefault Recon

        environment : Env.Config
        environment =
            Env.makeEnvironment seed { timeOfDay = options.timeOfDay, weather = options.weather, changing = options.changing /= Just False }

        full : Float
        full =
            100

        fresh : World
        fresh =
            { status = Patrol
            , time = 0
            , rng =
                if M.truthy seed then
                    round seed

                else
                    1
            , difficulty = Just (patrolDifficulty options.difficulty)
            , x = 0
            , y = 0
            , depth = 12
            , heading = 32
            , pitch = 0
            , roll = Nothing
            , speed = 4
            , targetSpeed = 4
            , targetHeading = 32
            , targetDepth = 12
            , verticalSpeed = 0
            , systems = { diesel = full, fuelTank = full, batteryBank = full, tubes = full, engine = full, propeller = full, oxygen = full, ballast = full, planes = full, rudder = full, sonar = full, periscope = full, deckgun = full, crew = full }
            , repairLimits = { hull = full, diesel = full, fuelTank = full, batteryBank = full, tubes = full, engine = full, propeller = full, oxygen = full, ballast = full, planes = full, rudder = full, sonar = full, periscope = full, deckgun = full, crew = full }
            , hull = 100
            , outerHull = 100
            , flood = 0
            , shock = 0
            , fuel = 86
            , fuelLeak = 0
            , fuelFire = 0
            , battery = 92
            , oxygen = 100
            , water = 0
            , ballast = 0
            , planes = 0
            , rudder = 0
            , propAngle = 0
            , cavitation = Just 0
            , propRpm = Just 52
            , noise = 12
            , silent = False
            , gunLoudUntil = Just 0
            , unpoweredSince = Nothing
            , repair = 0
            , floodAlarm = False
            , collisionCooldown = 0
            , collisionHits = Dict.empty
            , bottomed = False
            , torps = PatrolMission.startingTorpedoes
            , cookoff = False
            , engine = Electric
            , dieselMode = Charge
            , pressureAlarm = 0
            , criticalExposure = 0
            , imploded = False
            , scope = True
            , scopeTravel = Nothing
            , drone = freshDrone
            , chart = Just (Coast.coastline environment.chartSeed)
            , impacts = []
            , weaponSequence = 1
            , events = [ { t = 0, text = "Helm steady. Faint screws bearing 028. Your patrol begins.", kind = Info } ]
            , debrief = []
            , acoustics = []
            , soundSequence = 1
            , ships = startingShips
            , site = Nothing
            , replay = []
            , invalid = []
            , mission = mission
            , patrol = { seed = seed, startingTorpedoes = 0, photoGoal = 0, trackGoal = 0, variant = 0 }
            , runSetting = 4320
            , projectiles = []
            , aircraft = []
            , airSupport = { status = Idle, requestedAt = Nothing, launchAt = Nothing, base = { x = -3200, y = 3400 }, lastKnown = Nothing }
            , blasts = []
            , gunRounds = []
            , noisemaker = Nothing
            , reports = []
            , contacts = []
            , tubeReadyAt = { port_ = 0, starboard = 0 }
            , gun = { ammo = 240, cooldown = 0, shots = 0, angle = 0, elevation = 0 }
            , crewQuietUntil = 0
            , nextId = 1
            , convoy = Nothing
            , battle = Nothing
            , traffic = Just (TrafficEncounters.freshTraffic 0)
            , search = Nothing
            , pingAge = 999
            , pingCooldown = 0
            , torpedoTracks = []
            , photos = []
            , photoCooldown = 0
            , decoys = 3
            , alert = 0
            , alliedLamp = Nothing
            , operation = Nothing
            , route = Nothing
            , home = { x = -1500, y = -1700 }
            , environment = environment
            , phase = Objective
            , departure = Nothing
            , trackTime = 0
            , version = 1
            , plantVersion = Just 1
            , scopeAngle = 0
            , scopeSteerBearing = Nothing
            , towerAngle = 0
            , towerPitch = 0
            , lightning = []
            , nextLightningAt = 8 + hash01 seed 0 * 8
            , wavePhase = Nothing
            , imagers = { scribbler = Nothing, painter = Nothing }
            , recon = Recon.freshRecon
            , reconArchivedSequence = 0
            , soundBearings = []
            , wake = []
            , watchWarnings = Nothing
            , shells = []
            , imagingTime = Nothing
            , newYearWatch = Nothing
            , patrolId = Nothing
            }

        laidOut : World
        laidOut =
            Missions.randomizePatrol seed fresh

        searched : World
        searched =
            if laidOut.difficulty |> Maybe.andThen .longPatrol |> Maybe.withDefault False then
                longPatrol laidOut

            else
                laidOut
    in
    updateWatchWarnings searched


{-| A long patrol starts outside a seeded search area; the fleet action's
fleets start further apart, each to its own side, and the transit's departure
gate is wherever the boat now starts.
-}
longPatrol : World -> World
longPatrol s =
    let
        approach : PatrolSearch.Approach
        approach =
            PatrolSearch.longPatrol s.mission
                s.patrol.seed
                (Maybe.map (\site -> { x = site.x, y = site.y }) s.site)
                (List.map (\v -> { x = v.x, y = v.y, id = v.id, kind = v.kind, military = v.military == Just True, incidental = v.incidental == Just True, side = v.side }) s.ships)

        placed : World
        placed =
            { s
                | x = approach.x
                , y = approach.y
                , heading = approach.heading
                , targetHeading = approach.targetHeading
                , search = Just approach.search
                , home = Maybe.withDefault s.home approach.home
            }

        apart : World
        apart =
            case placed.battle |> Maybe.map .areas of
                Just (first :: second :: _) ->
                    let
                        east : Float
                        east =
                            M.sign (second.x - first.x)
                    in
                    { placed
                        | ships =
                            List.map
                                (\v ->
                                    let
                                        direction : Float
                                        direction =
                                            if v.side == Just Friendly then
                                                east

                                            else
                                                negate east
                                    in
                                    { v
                                        | x = v.x - direction * 800
                                        , heading =
                                            if 0 < direction then
                                                90

                                            else
                                                270
                                    }
                                )
                                placed.ships
                    }

                _ ->
                    placed
    in
    Mechanics.log "Long patrol. Search the dashed area on the chart. Its center is an estimate."
        Info
        { apart | departure = Maybe.map (\_ -> { x = apart.x, y = apart.y }) apart.departure }
