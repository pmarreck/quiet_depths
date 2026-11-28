module SimHarness.WorldSave exposing (encodeWorld, function)

{-| The whole world as a save writes it, to check that the Elm world record
holds everything a TypeScript save carries apart from the page's own fields
(the photo archive and the captain's name). The tick's outboxes, replay
marks and invalid numbers, are not saved.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission
import Sim.Contact as Contact
import Sim.Operation as Operation
import Sim.PatrolPhase as PatrolPhase
import Sim.ReconSaves as ReconSaves
import Sim.Ship as Ship
import Sim.Site as Site
import Sim.SonarTransmitters as SonarTransmitters
import Sim.World exposing (World)
import SimHarness.Codec exposing (arg)
import SimHarness.ColdWatch exposing (encodeTraffic)
import SimHarness.Combat exposing (encodeGun)
import SimHarness.ConvoyWatch exposing (encodeConvoy)
import SimHarness.Fleet exposing (encodeBattle)
import SimHarness.Lamp as Lamp
import SimHarness.Leaves exposing (encodeWarnings)
import SimHarness.Objectives exposing (encodeSearch)
import SimHarness.Ordnance exposing (encodeAirSupport, encodeAircraft, encodeBlast, encodeRound, encodeTorpedo)
import SimHarness.Patrol as Patrol exposing (encodeShell, encodeStrike)
import SimHarness.Watch exposing (encodeTrack)
import SimHarness.World exposing (encodeConfig)


nullable : (a -> E.Value) -> Maybe a -> E.Value
nullable encode =
    Maybe.map encode >> Maybe.withDefault E.null


point : { x : Float, y : Float } -> E.Value
point p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ) ]


present : String -> (a -> E.Value) -> Maybe a -> List ( String, E.Value )
present key encode =
    Maybe.map (\v -> [ ( key, encode v ) ]) >> Maybe.withDefault []


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
        (List.filter (\( key, _ ) -> key /= "replay" && key /= "invalid") (Patrol.encodeFields s)
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
            ++ present "alliedLamp" (\w -> E.object [ ( "message", nullable (Lamp.encodeTransmission Lamp.encodeLampFix) w.message ), ( "sequence", E.float w.sequence ), ( "lastIssue", E.float w.lastIssue ) ]) s.alliedLamp
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


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "world.roundTrip" ->
            Just (D.map encodeWorld (arg 0 Patrol.decoder))

        _ ->
            Nothing
