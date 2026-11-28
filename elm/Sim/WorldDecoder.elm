module Sim.WorldDecoder exposing (decoder, dieselModeName, difficulty, engineName, limits, route, shell, systems)

{-| A saved patrol decoded into the world record, as restore leaves it: the
replay and invalid-number outboxes start empty.
-}

import Json.Decode as D
import PatrolMission
import Sim.Boat exposing (Limits, Systems)
import Sim.Coast as Coast
import Sim.Combat exposing (Gun)
import Sim.Contact as Contact
import Sim.ConvoyWatch exposing (AlliedLamp)
import Sim.Debrief as Debrief
import Sim.Drone as Drone
import Sim.HostileTracks exposing (Noisemaker, Shell)
import Sim.Mechanics as Mechanics
import Sim.Operation as Operation
import Sim.OrdnanceSaves exposing (airSupport, aircraft, blast, gunRound, torpedo)
import Sim.PatrolPhase as PatrolPhase exposing (Phase)
import Sim.PatrolReports exposing (Report)
import Sim.PowerPlant as Plant exposing (DieselMode, EngineMode)
import Sim.ReconSaves as ReconSaves
import Sim.SaveCodec exposing (andMap)
import Sim.SaveParts as SaveParts exposing (convoy, logKind)
import Sim.Ship as Ship
import Sim.Site as Site
import Sim.SonarTransmitters as SonarTransmitters
import Sim.Sound as Sound
import Sim.Status as Status
import Sim.SurfaceWake as Wake
import Sim.Systems exposing (Difficulty, Impact)
import Sim.World exposing (Strike, World)


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key valueDecoder =
    D.oneOf [ D.field key D.value |> D.map (\_ -> True), D.succeed False ]
        |> D.andThen
            (\present ->
                if present then
                    D.map Just (D.field key valueDecoder)

                else
                    D.succeed Nothing
            )


named : (a -> String) -> List a -> D.Decoder a
named name values =
    D.string
        |> D.andThen
            (\given ->
                case List.filter (\v -> name v == given) values of
                    v :: _ ->
                        D.succeed v

                    [] ->
                        D.fail given
            )


engineName : EngineMode -> String
engineName mode =
    case mode of
        Plant.Diesel ->
            "diesel"

        Plant.Electric ->
            "electric"


dieselModeName : DieselMode -> String
dieselModeName mode =
    case mode of
        Plant.Charge ->
            "charge"

        Plant.Drive ->
            "drive"

        Plant.Assist ->
            "assist"


systems : D.Decoder Systems
systems =
    D.succeed Systems
        |> andMap (D.field "diesel" D.float)
        |> andMap (D.field "fuelTank" D.float)
        |> andMap (D.field "batteryBank" D.float)
        |> andMap (D.field "tubes" D.float)
        |> andMap (D.field "engine" D.float)
        |> andMap (D.field "propeller" D.float)
        |> andMap (D.field "oxygen" D.float)
        |> andMap (D.field "ballast" D.float)
        |> andMap (D.field "planes" D.float)
        |> andMap (D.field "rudder" D.float)
        |> andMap (D.field "sonar" D.float)
        |> andMap (D.field "periscope" D.float)
        |> andMap (D.field "deckgun" D.float)
        |> andMap (D.field "crew" D.float)


limits : D.Decoder Limits
limits =
    D.succeed Limits
        |> andMap (D.field "hull" D.float)
        |> andMap (D.field "diesel" D.float)
        |> andMap (D.field "fuelTank" D.float)
        |> andMap (D.field "batteryBank" D.float)
        |> andMap (D.field "tubes" D.float)
        |> andMap (D.field "engine" D.float)
        |> andMap (D.field "propeller" D.float)
        |> andMap (D.field "oxygen" D.float)
        |> andMap (D.field "ballast" D.float)
        |> andMap (D.field "planes" D.float)
        |> andMap (D.field "rudder" D.float)
        |> andMap (D.field "sonar" D.float)
        |> andMap (D.field "periscope" D.float)
        |> andMap (D.field "deckgun" D.float)
        |> andMap (D.field "crew" D.float)


impact : D.Decoder Impact
impact =
    D.map6 Impact (D.field "id" D.int) (D.field "x" D.float) (D.field "y" D.float) (D.field "altitude" D.float) (D.field "time" D.float) (D.field "kind" D.string)


{-| A saved patrol, as restore leaves it; the replay and invalid-number
outboxes start empty.
-}
decoder : D.Decoder World
decoder =
    D.map2 Tuple.pair (D.field "time" D.float) (D.field "ships" (D.list D.value))
        |> D.andThen
            (\( now, _ ) ->
                D.field "ships" (D.list (Ship.decoder now))
                    |> D.andThen
                        (\ships ->
                            D.succeed World
                                |> andMap (D.field "status" (named Status.statusName Status.statuses))
                                |> andMap (D.succeed now)
                                |> andMap (D.field "rng" D.int)
                                |> andMap (optional "difficulty" difficulty)
                                |> andMap (D.field "x" D.float)
                                |> andMap (D.field "y" D.float)
                                |> andMap (D.field "depth" D.float)
                                |> andMap (D.field "heading" D.float)
                                |> andMap (D.field "pitch" D.float)
                                |> andMap (optional "roll" D.float)
                                |> andMap (D.field "speed" D.float)
                                |> andMap (D.field "targetSpeed" D.float)
                                |> andMap (D.field "targetHeading" D.float)
                                |> andMap (D.field "targetDepth" D.float)
                                |> andMap (D.field "verticalSpeed" D.float)
                                |> andMap (D.field "systems" systems)
                                |> andMap (D.field "repairLimits" limits)
                                |> andMap (D.field "hull" D.float)
                                |> andMap (D.field "outerHull" D.float)
                                |> andMap (D.field "flood" D.float)
                                |> andMap (D.field "shock" D.float)
                                |> andMap (D.field "fuel" D.float)
                                |> andMap (D.field "fuelLeak" D.float)
                                |> andMap (D.field "fuelFire" D.float)
                                |> andMap (D.field "battery" D.float)
                                |> andMap (D.field "oxygen" D.float)
                                |> andMap (D.field "water" D.float)
                                |> andMap (D.field "ballast" D.float)
                                |> andMap (D.field "planes" D.float)
                                |> andMap (D.field "rudder" D.float)
                                |> andMap (D.field "propAngle" D.float)
                                |> andMap (optional "cavitation" D.float)
                                |> andMap (optional "propRpm" D.float)
                                |> andMap (D.field "noise" D.float)
                                |> andMap (D.field "silent" D.bool)
                                |> andMap (optional "gunLoudUntil" D.float)
                                |> andMap (optional "unpoweredSince" D.float)
                                |> andMap (D.field "repair" D.float)
                                |> andMap (D.field "floodAlarm" D.bool)
                                |> andMap (D.field "collisionCooldown" D.float)
                                |> andMap (D.field "collisionHits" (D.dict D.float))
                                |> andMap (D.field "bottomed" D.bool)
                                |> andMap (D.field "torps" D.int)
                                |> andMap (D.field "cookoff" D.bool)
                                |> andMap (D.field "engine" (named engineName [ Plant.Diesel, Plant.Electric ]))
                                |> andMap (D.field "dieselMode" (named dieselModeName [ Plant.Charge, Plant.Drive, Plant.Assist ]))
                                |> andMap (D.field "pressureAlarm" D.int)
                                |> andMap (D.field "criticalExposure" D.float)
                                |> andMap (D.field "imploded" D.bool)
                                |> andMap (D.field "scope" D.bool)
                                |> andMap (optional "scopeTravel" D.float)
                                |> andMap (D.field "drone" Drone.decoder)
                                |> andMap (D.field "environment" (optional "chartSeed" D.float) |> D.map (Maybe.map Coast.coastline))
                                |> andMap (D.field "impacts" (D.list impact))
                                |> andMap (D.field "weaponSequence" D.int)
                                |> andMap (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                                |> andMap (optional "debrief" (D.list (D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string))) |> D.map (Maybe.withDefault []))
                                |> andMap (D.field "acoustics" (D.list (Sound.decoder (List.map .id ships))))
                                |> andMap (D.field "soundSequence" D.int)
                                |> andMap (D.succeed ships)
                                |> andMap (optional "site" (D.nullable Site.decoder) |> D.map (Maybe.andThen identity))
                                |> andMap (D.succeed [])
                                |> andMap (D.succeed [])
                                |> andMap (D.field "mission" (D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail ("unknown mission: " ++ id)))))
                                |> andMap (D.field "patrol" (D.map5 (\seed torpedoes photoGoal trackGoal variant -> { seed = seed, startingTorpedoes = torpedoes, photoGoal = photoGoal, trackGoal = trackGoal, variant = variant }) (D.field "seed" D.float) (D.field "startingTorpedoes" D.int) (D.field "photoGoal" D.float) (D.field "trackGoal" D.float) (D.field "variant" D.int)))
                                |> andMap (D.field "runSetting" D.float)
                                |> andMap (D.field "projectiles" (D.list torpedo))
                                |> andMap (D.field "aircraft" (D.list aircraft))
                                |> andMap (D.field "airSupport" airSupport)
                                |> andMap (D.field "blasts" (D.list blast))
                                |> andMap (D.field "gunRounds" (D.list gunRound))
                                |> andMap (optional "noisemaker" (D.map6 Noisemaker (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "heading" D.float) (D.field "speed" D.float) (D.field "time" D.float)))
                                |> andMap (D.field "reports" (D.list (D.map3 Report (D.field "id" D.string) (D.field "text" D.string) (D.field "time" D.float))))
                                |> andMap (D.field "contacts" (D.list (Contact.decoder now)))
                                |> andMap (D.field "tubeReadyAt" (D.map2 (\p st -> { port_ = p, starboard = st }) (D.field "port" D.float) (D.field "starboard" D.float)))
                                |> andMap (D.field "gun" (D.map5 Gun (D.field "ammo" D.float) (D.field "cooldown" D.float) (D.field "shots" D.float) (D.field "angle" D.float) (D.field "elevation" D.float)))
                                |> andMap (D.field "crewQuietUntil" D.float)
                                |> andMap (D.field "nextId" D.float)
                                |> andMap (optional "convoy" (D.nullable convoy) |> D.map (Maybe.andThen identity))
                                |> andMap (optional "battle" (D.nullable SaveParts.battle) |> D.map (Maybe.andThen identity))
                                |> andMap (optional "traffic" SaveParts.traffic)
                                |> andMap (optional "search" SaveParts.searchArea)
                                |> andMap (D.field "pingAge" D.float)
                                |> andMap (D.field "pingCooldown" D.float)
                                |> andMap (D.field "torpedoTracks" (D.list SaveParts.track))
                                |> andMap (D.field "photos" (D.list D.string))
                                |> andMap (D.field "photoCooldown" D.float)
                                |> andMap (D.field "decoys" D.int)
                                |> andMap (D.field "alert" D.float)
                                |> andMap (optional "alliedLamp" (D.map3 AlliedLamp (D.field "message" (D.nullable (SaveParts.transmission SaveParts.lampFix))) (D.field "sequence" D.float) (D.field "lastIssue" D.float)))
                                |> andMap (optional "operation" (D.nullable Operation.decoder) |> D.map (Maybe.andThen identity))
                                |> andMap (optional "route" (D.nullable route) |> D.map (Maybe.andThen identity))
                                |> andMap (D.field "home" point)
                                |> andMap (D.field "environment" SaveParts.config)
                                |> andMap (D.field "phase" phase)
                                |> andMap (optional "departure" point)
                                |> andMap (D.field "trackTime" D.float)
                                |> andMap (D.field "version" D.int)
                                |> andMap (optional "plantVersion" D.int)
                                |> andMap (D.field "scopeAngle" D.float)
                                |> andMap (D.field "scopeSteerBearing" (D.nullable D.float))
                                |> andMap (D.field "towerAngle" D.float)
                                |> andMap (D.field "towerPitch" D.float)
                                |> andMap (D.field "lightning" (D.list strike))
                                |> andMap (D.field "nextLightningAt" D.float)
                                |> andMap (optional "wavePhase" D.float)
                                |> andMap (D.field "imagers" SonarTransmitters.decoder)
                                |> andMap (D.field "recon" ReconSaves.decoder)
                                |> andMap (D.field "reconArchivedSequence" D.float)
                                |> andMap (D.field "soundBearings" (D.list (D.map5 (\x y bearing time kind -> { x = x, y = y, bearing = bearing, time = time, kind = kind }) (D.field "x" D.float) (D.field "y" D.float) (D.field "bearing" D.float) (D.field "time" D.float) (D.field "kind" D.string))))
                                |> andMap (D.field "wake" (D.list (D.map6 Wake.WakeSample (D.field "x" D.float) (D.field "y" D.float) (D.field "heading" D.float) (D.field "time" D.float) (D.field "width" D.float) (D.field "strength" D.float))))
                                |> andMap (optional "watchWarnings" SaveParts.warnings)
                                |> andMap (D.field "shells" (D.list shell))
                                |> andMap (optional "imagingTime" D.float)
                                |> andMap (optional "newYearWatch" D.float)
                                |> andMap (optional "patrolId" D.string)
                        )
            )


{-| The difficulty switches and sliders the simulation reads; any absent is
the default.
-}
difficulty : D.Decoder Difficulty
difficulty =
    D.succeed Difficulty
        |> andMap (optional "drone" D.bool)
        |> andMap (optional "damage" D.float)
        |> andMap (optional "pursuit" D.float)
        |> andMap (optional "depthStealth" D.float)
        |> andMap (optional "detection" D.float)
        |> andMap (optional "airSupport" D.bool)
        |> andMap (optional "satellite" D.bool)
        |> andMap (optional "pingDetection" D.float)
        |> andMap (optional "longPatrol" D.bool)
        |> andMap (optional "showSuspicion" D.bool)
        |> andMap (optional "omniscientChart" D.bool)
        |> andMap (optional "orbitCamera" D.bool)
        |> andMap (optional "instantReplay" D.bool)
        |> andMap (optional "enemyReplay" D.bool)
        |> andMap (optional "torpedoCam" D.bool)


{-| A chart route: a point, and the radius within which it counts as reached.
-}
route : D.Decoder { x : Float, y : Float, radius : Maybe Float }
route =
    D.map3 (\x y radius -> { x = x, y = y, radius = radius }) (D.field "x" D.float) (D.field "y" D.float) (optional "radius" D.float)


point : D.Decoder { x : Float, y : Float }
point =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)


phase : D.Decoder Phase
phase =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\p -> PatrolPhase.phaseName p == name) PatrolPhase.phases of
                    p :: _ ->
                        D.succeed p

                    [] ->
                        D.fail ("no patrol phase is " ++ name)
            )


strike : D.Decoder Strike
strike =
    D.map7 Strike (D.field "id" D.int) (D.field "time" D.float) (D.field "x" D.float) (D.field "y" D.float) (D.field "height" D.float) (D.field "seed" D.float) (optional "altitude" D.float)


shell : D.Decoder Shell
shell =
    D.map8 Shell (D.field "id" D.int) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "delay" D.float) (D.field "fromX" D.float) (D.field "fromY" D.float) (D.field "total" D.float)
        |> D.andThen (\make -> D.map make (optional "hit" D.bool))
