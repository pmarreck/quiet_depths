module Sim.WorldEncoder exposing (encode, encodeFields, encodeShell, encodeWorld)

{-| The world record encoded as a save writes it, and the fields the
harness compares with the outboxes included.
-}

import Json.Encode as E
import PatrolMission
import Sim.Contact as Contact
import Sim.Drone as Drone
import Sim.HostileTracks exposing (Shell)
import Sim.Mechanics as Mechanics
import Sim.Operation as Operation
import Sim.OrdnanceSaves exposing (encodeAirSupport, encodeAircraft, encodeBlast, encodeRound, encodeTorpedo)
import Sim.PatrolPhase as PatrolPhase
import Sim.ReconSaves as ReconSaves
import Sim.ReplayEvents as Replay
import Sim.SaveParts as SaveParts exposing (encodeBattle, encodeConfig, encodeConvoy, encodeGun, encodeSearch, encodeTrack, encodeTraffic, encodeWarnings)
import Sim.Ship as Ship
import Sim.Site as Site
import Sim.SonarTransmitters as SonarTransmitters
import Sim.Sound as Sound
import Sim.Status as Status
import Sim.World exposing (Strike, World)
import Sim.WorldDecoder exposing (dieselModeName, engineName)


encodeParts : List ( String, Float ) -> E.Value
encodeParts =
    E.object << List.map (Tuple.mapSecond E.float)


systemFields : { a | diesel : Float, fuelTank : Float, batteryBank : Float, tubes : Float, engine : Float, propeller : Float, oxygen : Float, ballast : Float, planes : Float, rudder : Float, sonar : Float, periscope : Float, deckgun : Float, crew : Float } -> List ( String, Float )
systemFields p =
    [ ( "diesel", p.diesel )
    , ( "fuelTank", p.fuelTank )
    , ( "batteryBank", p.batteryBank )
    , ( "tubes", p.tubes )
    , ( "engine", p.engine )
    , ( "propeller", p.propeller )
    , ( "oxygen", p.oxygen )
    , ( "ballast", p.ballast )
    , ( "planes", p.planes )
    , ( "rudder", p.rudder )
    , ( "sonar", p.sonar )
    , ( "periscope", p.periscope )
    , ( "deckgun", p.deckgun )
    , ( "crew", p.crew )
    ]


encodeReplay : Replay.Marked -> E.Value
encodeReplay m =
    let
        e : Replay.ReplayEvent
        e =
            m.event

        field : String -> (v -> E.Value) -> Maybe v -> Maybe ( String, E.Value )
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    E.object
        [ ( "time", E.float m.time )
        , ( "event"
          , E.object
                ([ ( "kind", E.string (Replay.kindName e.kind) ), ( "point", E.object [ ( "x", E.float e.point.x ), ( "y", E.float e.point.y ), ( "depth", E.float e.point.depth ) ] ) ]
                    ++ List.filterMap identity [ field "heading" E.float e.heading, field "target" E.string e.target, field "shot" E.float e.shot, field "enemy" E.bool e.enemy ]
                )
          )
        ]


{-| Every field the systems modules can change; absent optional fields stay
absent.
-}
encode : World -> E.Value
encode =
    E.object << encodeFields


{-| The fields `encode` writes, for harness entries that add their own.
-}
encodeFields : World -> List ( String, E.Value )
encodeFields s =
    let
        number : ( String, Float ) -> ( String, E.Value )
        number ( key, v ) =
            ( key, E.float v )

        field : String -> (v -> E.Value) -> Maybe v -> Maybe ( String, E.Value )
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    List.map number
        [ ( "time", s.time )
        , ( "x", s.x )
        , ( "y", s.y )
        , ( "depth", s.depth )
        , ( "heading", s.heading )
        , ( "pitch", s.pitch )
        , ( "speed", s.speed )
        , ( "targetSpeed", s.targetSpeed )
        , ( "targetHeading", s.targetHeading )
        , ( "targetDepth", s.targetDepth )
        , ( "verticalSpeed", s.verticalSpeed )
        , ( "hull", s.hull )
        , ( "outerHull", s.outerHull )
        , ( "flood", s.flood )
        , ( "shock", s.shock )
        , ( "fuel", s.fuel )
        , ( "fuelLeak", s.fuelLeak )
        , ( "fuelFire", s.fuelFire )
        , ( "battery", s.battery )
        , ( "oxygen", s.oxygen )
        , ( "water", s.water )
        , ( "ballast", s.ballast )
        , ( "planes", s.planes )
        , ( "rudder", s.rudder )
        , ( "propAngle", s.propAngle )
        , ( "noise", s.noise )
        , ( "repair", s.repair )
        , ( "collisionCooldown", s.collisionCooldown )
        , ( "criticalExposure", s.criticalExposure )
        ]
        ++ [ ( "status", E.string (Status.statusName s.status) )
           , ( "rng", E.int s.rng )
           , ( "silent", E.bool s.silent )
           , ( "floodAlarm", E.bool s.floodAlarm )
           , ( "bottomed", E.bool s.bottomed )
           , ( "torps", E.int s.torps )
           , ( "cookoff", E.bool s.cookoff )
           , ( "engine", E.string (engineName s.engine) )
           , ( "dieselMode", E.string (dieselModeName s.dieselMode) )
           , ( "pressureAlarm", E.int s.pressureAlarm )
           , ( "imploded", E.bool s.imploded )
           , ( "scope", E.bool s.scope )
           , ( "collisionHits", E.dict identity E.float s.collisionHits )
           , ( "systems", encodeParts (systemFields s.systems) )
           , ( "repairLimits", encodeParts (( "hull", s.repairLimits.hull ) :: systemFields s.repairLimits) )
           , ( "drone", Drone.encode s.drone )
           , ( "impacts", E.list (\i -> E.object [ ( "id", E.int i.id ), ( "x", E.float i.x ), ( "y", E.float i.y ), ( "altitude", E.float i.altitude ), ( "time", E.float i.time ), ( "kind", E.string i.kind ) ]) s.impacts )
           , ( "weaponSequence", E.int s.weaponSequence )
           , ( "events", E.list (\e -> E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]) s.events )
           , ( "debrief", E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ]) s.debrief )
           , ( "acoustics", E.list Sound.encode s.acoustics )
           , ( "soundSequence", E.int s.soundSequence )
           , ( "replay", E.list encodeReplay s.replay )
           , ( "invalid", E.list (\n -> E.object [ ( "where", E.string n.place ), ( "value", E.float n.value ) ]) s.invalid )
           ]
        ++ List.filterMap identity
            [ field "roll" E.float s.roll
            , field "cavitation" E.float s.cavitation
            , field "propRpm" E.float s.propRpm
            , field "gunLoudUntil" E.float s.gunLoudUntil
            , field "unpoweredSince" E.float s.unpoweredSince
            , field "scopeTravel" E.float s.scopeTravel
            ]


encodeStrike : Strike -> E.Value
encodeStrike v =
    E.object
        ([ ( "id", E.int v.id ), ( "time", E.float v.time ), ( "x", E.float v.x ), ( "y", E.float v.y ), ( "height", E.float v.height ), ( "seed", E.float v.seed ) ]
            ++ (Maybe.map (\a -> [ ( "altitude", E.float a ) ]) v.altitude |> Maybe.withDefault [])
        )


encodeShell : Shell -> E.Value
encodeShell v =
    E.object
        ([ ( "id", E.int v.id ), ( "x", E.float v.x ), ( "y", E.float v.y ), ( "depth", E.float v.depth ), ( "delay", E.float v.delay ), ( "fromX", E.float v.fromX ), ( "fromY", E.float v.fromY ), ( "total", E.float v.total ) ]
            ++ (Maybe.map (\h -> [ ( "hit", E.bool h ) ]) v.hit |> Maybe.withDefault [])
        )


nullable : (a -> E.Value) -> Maybe a -> E.Value
nullable write =
    Maybe.map write >> Maybe.withDefault E.null


point : { x : Float, y : Float } -> E.Value
point p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ) ]


present : String -> (a -> E.Value) -> Maybe a -> List ( String, E.Value )
present key write =
    Maybe.map (\v -> [ ( key, write v ) ]) >> Maybe.withDefault []


profile : SonarTransmitters.Profile -> E.Value
profile p =
    E.string
        (case p of
            SonarTransmitters.Survey ->
                "survey"

            SonarTransmitters.Detail ->
                "detail"
        )


encodeWorld : World -> E.Value
encodeWorld s =
    let
        d : List ( String, E.Value )
        d =
            case s.difficulty of
                Just v ->
                    [ ( "difficulty"
                      , E.object
                            (present "drone" E.bool v.drone
                                ++ present "damage" E.float v.damage
                                ++ present "pursuit" E.float v.pursuit
                                ++ present "depthStealth" E.float v.depthStealth
                                ++ present "detection" E.float v.detection
                                ++ present "airSupport" E.bool v.airSupport
                                ++ present "satellite" E.bool v.satellite
                                ++ present "pingDetection" E.float v.pingDetection
                                ++ present "longPatrol" E.bool v.longPatrol
                                ++ present "showSuspicion" E.bool v.showSuspicion
                                ++ present "omniscientChart" E.bool v.omniscientChart
                                ++ present "orbitCamera" E.bool v.orbitCamera
                                ++ present "instantReplay" E.bool v.instantReplay
                                ++ present "enemyReplay" E.bool v.enemyReplay
                                ++ present "torpedoCam" E.bool v.torpedoCam
                            )
                      )
                    ]

                Nothing ->
                    []
    in
    E.object
        (List.filter (\( key, _ ) -> key /= "replay" && key /= "invalid") (encodeFields s)
            ++ d
            ++ [ ( "mission", E.string (PatrolMission.briefing s.mission).id )
               , ( "ships", E.list Ship.encode s.ships )
               , ( "site", nullable Site.encode s.site )
               , ( "operation", nullable Operation.encode s.operation )
               , ( "route", nullable (\r -> E.object ([ ( "x", E.float r.x ), ( "y", E.float r.y ) ] ++ present "radius" E.float r.radius)) s.route )
               , ( "home", point s.home )
               , ( "patrol", E.object [ ( "seed", E.float s.patrol.seed ), ( "startingTorpedoes", E.int s.patrol.startingTorpedoes ), ( "photoGoal", E.float s.patrol.photoGoal ), ( "trackGoal", E.float s.patrol.trackGoal ), ( "variant", E.int s.patrol.variant ) ] )
               , ( "phase", E.string (PatrolPhase.phaseName s.phase) )
               , ( "environment", encodeConfig s.environment )
               , ( "runSetting", E.float s.runSetting )
               , ( "projectiles", E.list encodeTorpedo s.projectiles )
               , ( "aircraft", E.list encodeAircraft s.aircraft )
               , ( "airSupport", encodeAirSupport s.airSupport )
               , ( "blasts", E.list encodeBlast s.blasts )
               , ( "gunRounds", E.list encodeRound s.gunRounds )
               , ( "reports", E.list (\r -> E.object [ ( "id", E.string r.id ), ( "text", E.string r.text ), ( "time", E.float r.time ) ]) s.reports )
               , ( "contacts", E.list Contact.encode s.contacts )
               , ( "tubeReadyAt", E.object [ ( "port", E.float s.tubeReadyAt.port_ ), ( "starboard", E.float s.tubeReadyAt.starboard ) ] )
               , ( "gun", encodeGun s.gun )
               , ( "crewQuietUntil", E.float s.crewQuietUntil )
               , ( "nextId", E.float s.nextId )
               , ( "pingAge", E.float s.pingAge )
               , ( "pingCooldown", E.float s.pingCooldown )
               , ( "torpedoTracks", E.list encodeTrack s.torpedoTracks )
               , ( "photos", E.list E.string s.photos )
               , ( "photoCooldown", E.float s.photoCooldown )
               , ( "decoys", E.int s.decoys )
               , ( "alert", E.float s.alert )
               , ( "trackTime", E.float s.trackTime )
               , ( "version", E.int s.version )
               , ( "scopeAngle", E.float s.scopeAngle )
               , ( "scopeSteerBearing", nullable E.float s.scopeSteerBearing )
               , ( "towerAngle", E.float s.towerAngle )
               , ( "towerPitch", E.float s.towerPitch )
               , ( "lightning", E.list encodeStrike s.lightning )
               , ( "nextLightningAt", E.float s.nextLightningAt )
               , ( "imagers", E.object [ ( "scribbler", nullable profile s.imagers.scribbler ), ( "painter", nullable profile s.imagers.painter ) ] )
               , ( "recon", ReconSaves.encode s.recon )
               , ( "reconArchivedSequence", E.float s.reconArchivedSequence )
               , ( "soundBearings", E.list (\b -> E.object [ ( "x", E.float b.x ), ( "y", E.float b.y ), ( "bearing", E.float b.bearing ), ( "time", E.float b.time ), ( "kind", E.string b.kind ) ]) s.soundBearings )
               , ( "wake", E.list (\w -> E.object [ ( "x", E.float w.x ), ( "y", E.float w.y ), ( "heading", E.float w.heading ), ( "time", E.float w.time ), ( "width", E.float w.width ), ( "strength", E.float w.strength ) ]) s.wake )
               , ( "shells", E.list encodeShell s.shells )
               ]
            ++ present "convoy" encodeConvoy s.convoy
            ++ present "alliedLamp" (\w -> E.object [ ( "message", nullable (SaveParts.encodeTransmission SaveParts.encodeLampFix) w.message ), ( "sequence", E.float w.sequence ), ( "lastIssue", E.float w.lastIssue ) ]) s.alliedLamp
            ++ present "battle" encodeBattle s.battle
            ++ present "traffic" encodeTraffic s.traffic
            ++ present "search" encodeSearch s.search
            ++ present "departure" point s.departure
            ++ present "noisemaker" (\n -> E.object [ ( "x", E.float n.x ), ( "y", E.float n.y ), ( "depth", E.float n.depth ), ( "heading", E.float n.heading ), ( "speed", E.float n.speed ), ( "time", E.float n.time ) ]) s.noisemaker
            ++ present "plantVersion" E.int s.plantVersion
            ++ present "wavePhase" E.float s.wavePhase
            ++ present "watchWarnings" encodeWarnings s.watchWarnings
            ++ present "imagingTime" E.float s.imagingTime
            ++ present "newYearWatch" E.float s.newYearWatch
            ++ present "patrolId" E.string s.patrolId
        )
