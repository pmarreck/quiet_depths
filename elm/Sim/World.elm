module Sim.World exposing (SoundBearing, Strike, World)

{-| The whole patrol, as the simulation keeps it: the boat and her systems,
the drone, the ships, contacts and ordnance, the mission's own state, the
chart and weather, and the outboxes a tick fills (replay marks and invalid
numbers). The page keeps the photo archive and the captain's name apart.
-}

import Dict exposing (Dict)
import PatrolMission exposing (Mission)
import Sim.AirSupport exposing (AirSupport, Aircraft)
import Sim.Boat exposing (Limits, Systems)
import Sim.Coast exposing (Coastline)
import Sim.Combat exposing (Gun)
import Sim.Contact exposing (Contact)
import Sim.ConvoyWatch exposing (AlliedLamp, Convoy)
import Sim.Debrief as Debrief
import Sim.Drone exposing (Drone)
import Sim.Environment as Env
import Sim.FleetTheater exposing (Battle)
import Sim.HostileTracks exposing (Noisemaker, Shell)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Mechanics exposing (LogEntry)
import Sim.Operation exposing (Operation)
import Sim.Ordnance exposing (Blast, Round)
import Sim.PatrolPhase exposing (Phase)
import Sim.PatrolReports exposing (Report)
import Sim.PatrolSearch exposing (SearchArea)
import Sim.PowerPlant exposing (DieselMode, EngineMode)
import Sim.Recon exposing (Recon)
import Sim.ReplayEvents as Replay
import Sim.Ship exposing (Ship)
import Sim.Site exposing (Site)
import Sim.SonarTransmitters exposing (Transmitters)
import Sim.Sound exposing (Sound)
import Sim.Status exposing (Status)
import Sim.SurfaceWake exposing (WakeSample)
import Sim.Systems exposing (Difficulty, Impact)
import Sim.Torpedo exposing (Torpedo)
import Sim.TorpedoWatch as TorpedoWatch
import Sim.TrafficEncounters exposing (Traffic)
import Sim.WatchWarnings exposing (Warnings)


{-| A lightning strike: where and when it fell, its height, and the seed its
bolt is drawn from; a strike seen from aloft carries its altitude.
-}
type alias Strike =
    { id : Int, time : Float, x : Float, y : Float, height : Float, seed : Float, altitude : Maybe Float }


{-| A bearing to a sound the crew heard, from where the boat was.
-}
type alias SoundBearing =
    { x : Float, y : Float, bearing : Float, time : Float, kind : String }


type alias World =
    { status : Status
    , time : Float
    , rng : Int
    , difficulty : Maybe Difficulty
    , x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , pitch : Float
    , roll : Maybe Float
    , speed : Float
    , targetSpeed : Float
    , targetHeading : Float
    , targetDepth : Float
    , verticalSpeed : Float
    , systems : Systems
    , repairLimits : Limits
    , hull : Float
    , outerHull : Float
    , flood : Float
    , shock : Float
    , fuel : Float
    , fuelLeak : Float
    , fuelFire : Float
    , battery : Float
    , oxygen : Float
    , water : Float
    , ballast : Float
    , planes : Float
    , rudder : Float
    , propAngle : Float
    , cavitation : Maybe Float
    , propRpm : Maybe Float
    , noise : Float
    , silent : Bool
    , gunLoudUntil : Maybe Float
    , unpoweredSince : Maybe Float
    , repair : Float
    , floodAlarm : Bool
    , collisionCooldown : Float
    , collisionHits : Dict String Float
    , bottomed : Bool
    , torps : Int
    , cookoff : Bool
    , engine : EngineMode
    , dieselMode : DieselMode
    , pressureAlarm : Int
    , criticalExposure : Float
    , imploded : Bool
    , scope : Bool
    , scopeTravel : Maybe Float
    , drone : Drone
    , chart : Maybe Coastline
    , impacts : List Impact
    , weaponSequence : Int
    , events : List LogEntry
    , debrief : List Debrief.Entry
    , acoustics : List Sound
    , soundSequence : Int
    , ships : List Ship
    , site : Maybe Site
    , replay : List Replay.Marked
    , invalid : List InvalidNumber
    , mission : Mission
    , patrol : { seed : Float, startingTorpedoes : Int, photoGoal : Float, trackGoal : Float, variant : Int }
    , runSetting : Float
    , projectiles : List Torpedo
    , aircraft : List Aircraft
    , airSupport : AirSupport
    , blasts : List Blast
    , gunRounds : List Round
    , noisemaker : Maybe Noisemaker
    , reports : List Report
    , contacts : List Contact
    , tubeReadyAt : { port_ : Float, starboard : Float }
    , gun : Gun
    , crewQuietUntil : Float
    , nextId : Float
    , convoy : Maybe Convoy
    , battle : Maybe Battle
    , traffic : Maybe Traffic
    , search : Maybe SearchArea
    , pingAge : Float
    , pingCooldown : Float
    , torpedoTracks : List TorpedoWatch.Track
    , photos : List String
    , photoCooldown : Float
    , decoys : Int
    , alert : Float
    , alliedLamp : Maybe AlliedLamp
    , operation : Maybe Operation
    , route : Maybe { x : Float, y : Float, radius : Maybe Float }
    , home : { x : Float, y : Float }
    , environment : Env.Config
    , phase : Phase
    , departure : Maybe { x : Float, y : Float }
    , trackTime : Float
    , version : Int
    , plantVersion : Maybe Int
    , scopeAngle : Float
    , scopeSteerBearing : Maybe Float
    , towerAngle : Float
    , towerPitch : Float
    , lightning : List Strike
    , nextLightningAt : Float
    , wavePhase : Maybe Float
    , imagers : Transmitters
    , recon : Recon
    , reconArchivedSequence : Float
    , soundBearings : List SoundBearing
    , wake : List WakeSample
    , watchWarnings : Maybe Warnings
    , shells : List Shell
    , imagingTime : Maybe Float
    , newYearWatch : Maybe Float
    , patrolId : Maybe String
    }
