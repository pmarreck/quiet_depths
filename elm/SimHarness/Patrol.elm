module SimHarness.Patrol exposing (Patrol, decoder, encode, encodeFields, limits, systems)

{-| The flat patrol record the systems modules work on, decoded from a saved
patrol and encoded back with every field systems can change.
-}

import Dict exposing (Dict)
import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.AirSupport exposing (AirSupport, Aircraft)
import Sim.Boat exposing (Limits, Systems)
import Sim.Coast as Coast exposing (Coastline)
import Sim.Combat exposing (Gun)
import Sim.Contact as Contact exposing (Contact)
import Sim.Debrief as Debrief
import Sim.Drone as Drone exposing (Drone)
import Sim.FleetTheater exposing (Battle)
import Sim.FleetVolleys exposing (Volley)
import Sim.HostileTracks exposing (Noisemaker)
import Sim.HullGeometry exposing (Body)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.Ordnance exposing (Blast, Round)
import Sim.PatrolReports exposing (Report)
import Sim.PatrolSearch exposing (SearchArea)
import Sim.PowerPlant as Plant exposing (DieselMode, EngineMode)
import Sim.ReplayEvents as Replay
import Sim.Ship as Ship exposing (Ship)
import Sim.Sound as Sound exposing (Sound)
import Sim.Status as Status exposing (Status)
import Sim.Systems exposing (Difficulty, Impact)
import Sim.Torpedo exposing (Torpedo)
import Sim.TorpedoWatch as TorpedoWatch
import Sim.TrafficEncounters exposing (Traffic)
import SimHarness.Codec exposing (andMap)
import SimHarness.ColdWatch as ColdWatch
import SimHarness.Fleet as Fleet
import SimHarness.Hulls exposing (body, logKind)
import SimHarness.Objectives as Objectives
import SimHarness.Ordnance exposing (airSupport, aircraft, blast, gunRound, torpedo)
import SimHarness.Watch as Watch


type alias Patrol =
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
    , site : Maybe Body
    , replay : List Replay.Marked
    , invalid : List InvalidNumber
    , mission : Mission
    , patrol : { seed : Float, photoGoal : Float }
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
    , convoy : Maybe { shot : Maybe Volley }
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
    }


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
decoder : D.Decoder Patrol
decoder =
    D.map2 Tuple.pair (D.field "time" D.float) (D.field "ships" (D.list D.value))
        |> D.andThen
            (\( now, _ ) ->
                D.field "ships" (D.list (Ship.decoder now))
                    |> D.andThen
                        (\ships ->
                            D.succeed Patrol
                                |> andMap (D.field "status" (named Status.statusName Status.statuses))
                                |> andMap (D.succeed now)
                                |> andMap (D.field "rng" D.int)
                                |> andMap (optional "difficulty" (D.map8 Difficulty (optional "drone" D.bool) (optional "damage" D.float) (optional "pursuit" D.float) (optional "depthStealth" D.float) (optional "detection" D.float) (optional "airSupport" D.bool) (optional "satellite" D.bool) (optional "pingDetection" D.float)))
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
                                |> andMap (D.at [ "environment", "chartSeed" ] D.float |> D.map (Coast.coastline >> Just))
                                |> andMap (D.field "impacts" (D.list impact))
                                |> andMap (D.field "weaponSequence" D.int)
                                |> andMap (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                                |> andMap (optional "debrief" (D.list (D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string))) |> D.map (Maybe.withDefault []))
                                |> andMap (D.field "acoustics" (D.list (Sound.decoder (List.map .id ships))))
                                |> andMap (D.field "soundSequence" D.int)
                                |> andMap (D.succeed ships)
                                |> andMap (optional "site" (D.nullable body) |> D.map (Maybe.andThen identity))
                                |> andMap (D.succeed [])
                                |> andMap (D.succeed [])
                                |> andMap (D.field "mission" (D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail ("unknown mission: " ++ id)))))
                                |> andMap (D.map2 (\seed goal -> { seed = seed, photoGoal = goal }) (D.at [ "patrol", "seed" ] D.float) (D.at [ "patrol", "photoGoal" ] D.float))
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
                                |> andMap (optional "convoy" (D.nullable (D.map (\shot -> { shot = shot }) (optional "shot" (D.nullable Fleet.volley) |> D.map (Maybe.andThen identity)))) |> D.map (Maybe.andThen identity))
                                |> andMap (optional "battle" (D.nullable Fleet.battle) |> D.map (Maybe.andThen identity))
                                |> andMap (optional "traffic" ColdWatch.traffic)
                                |> andMap (optional "search" Objectives.searchArea)
                                |> andMap (D.field "pingAge" D.float)
                                |> andMap (D.field "pingCooldown" D.float)
                                |> andMap (D.field "torpedoTracks" (D.list Watch.track))
                                |> andMap (D.field "photos" (D.list D.string))
                                |> andMap (D.field "photoCooldown" D.float)
                                |> andMap (D.field "decoys" D.int)
                                |> andMap (D.field "alert" D.float)
                        )
            )


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
encode : Patrol -> E.Value
encode =
    E.object << encodeFields


{-| The fields `encode` writes, for harness entries that add their own.
-}
encodeFields : Patrol -> List ( String, E.Value )
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
