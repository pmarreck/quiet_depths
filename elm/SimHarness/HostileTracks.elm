module SimHarness.HostileTracks exposing (difficulty, function, track)

{-| Harness entries for the hunters: their reports, senses, debrief lines and
attacks. The depth-charge and torpedo stand-ins log what they are handed, and
the torpedo one flips the firing ship's tube side, as the test's TypeScript
stand-ins do.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Boat exposing (Systems)
import Sim.Debrief as Debrief
import Sim.HostileTracks as Hunt exposing (Charge, Noisemaker, Shell)
import Sim.HunterReports as Reports exposing (SavedReport, Track)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.PowerPlant as Plant exposing (EngineMode)
import Sim.Ship as Ship exposing (Report)
import Sim.Sound as Sound exposing (Sound)
import Sim.Systems exposing (Difficulty)
import SimHarness.Codec exposing (andMap, arg)
import SimHarness.Fleet exposing (optional)
import SimHarness.Hulls exposing (logKind)
import SimHarness.Patrol as Patrol exposing (encodeShell, shell, systems)


type alias Hunt =
    { x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , speed : Float
    , targetSpeed : Float
    , time : Float
    , rng : Int
    , difficulty : Maybe Difficulty
    , systems : Systems
    , scope : Bool
    , scopeTravel : Maybe Float
    , noise : Float
    , bottomed : Bool
    , noisemaker : Maybe Noisemaker
    , engine : EngineMode
    , events : List LogEntry
    , debrief : List Debrief.Entry
    , shells : List Shell
    , soundSequence : Int
    , acoustics : List Sound
    , invalid : List InvalidNumber
    , charges : List Charge
    , launches : List E.Value
    }


report : D.Decoder Report
report =
    D.map7 Report (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "heading" D.float) (D.field "speed" D.float) (D.field "time" D.float) (optional "reason" D.string)


encodeReport : Report -> List ( String, E.Value )
encodeReport r =
    [ ( "x", E.float r.x ), ( "y", E.float r.y ), ( "depth", E.float r.depth ), ( "heading", E.float r.heading ), ( "speed", E.float r.speed ), ( "time", E.float r.time ) ]
        ++ (Maybe.map (\why -> [ ( "reason", E.string why ) ]) r.reason |> Maybe.withDefault [])


track : D.Decoder Track
track =
    D.map2 (\r age -> { x = r.x, y = r.y, depth = r.depth, heading = r.heading, speed = r.speed, time = r.time, reason = r.reason, age = age }) report (D.field "age" D.float)


encodeTrack : Track -> E.Value
encodeTrack t =
    E.object (encodeReport { x = t.x, y = t.y, depth = t.depth, heading = t.heading, speed = t.speed, time = t.time, reason = t.reason } ++ [ ( "age", E.float t.age ) ])


difficulty : D.Decoder Difficulty
difficulty =
    Patrol.difficulty


hunt : D.Decoder Hunt
hunt =
    D.map3 (\now ids sequence -> ( now, ids, sequence )) (D.field "time" D.float) (D.field "shipIds" (D.list D.string)) (D.field "soundSequence" D.int)
        |> D.andThen
            (\( now, ids, sequence ) ->
                D.succeed Hunt
                    |> andMap (D.field "x" D.float)
                    |> andMap (D.field "y" D.float)
                    |> andMap (D.field "depth" D.float)
                    |> andMap (D.field "heading" D.float)
                    |> andMap (D.field "speed" D.float)
                    |> andMap (D.field "targetSpeed" D.float)
                    |> andMap (D.succeed now)
                    |> andMap (D.field "rng" D.int)
                    |> andMap (optional "difficulty" difficulty)
                    |> andMap (D.field "systems" systems)
                    |> andMap (D.field "scope" D.bool)
                    |> andMap (optional "scopeTravel" D.float)
                    |> andMap (D.field "noise" D.float)
                    |> andMap (D.field "bottomed" D.bool)
                    |> andMap (optional "noisemaker" (D.map6 Noisemaker (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "heading" D.float) (D.field "speed" D.float) (D.field "time" D.float)))
                    |> andMap (D.field "engine" (D.string |> D.andThen engine))
                    |> andMap (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                    |> andMap (optional "debrief" (D.list (D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string))) |> D.map (Maybe.withDefault []))
                    |> andMap (D.field "shells" (D.list shell))
                    |> andMap (D.succeed sequence)
                    |> andMap (D.field "acoustics" (D.list (Sound.decoder ids)))
                    |> andMap (D.succeed [])
                    |> andMap (D.succeed [])
                    |> andMap (D.succeed [])
            )


engine : String -> D.Decoder EngineMode
engine name =
    case name of
        "diesel" ->
            D.succeed Plant.Diesel

        "electric" ->
            D.succeed Plant.Electric

        _ ->
            D.fail name


encodeHunt : Hunt -> E.Value
encodeHunt s =
    E.object
        [ ( "rng", E.int s.rng )
        , ( "events", E.list (\e -> E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]) s.events )
        , ( "debrief", E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ]) s.debrief )
        , ( "shells", E.list encodeShell s.shells )
        , ( "soundSequence", E.int s.soundSequence )
        , ( "acoustics", E.list Sound.encode s.acoustics )
        , ( "charges", E.list (\c -> E.object [ ( "x", E.float c.x ), ( "y", E.float c.y ), ( "depth", E.float c.depth ), ( "delay", E.float c.delay ) ]) s.charges )
        , ( "launches", E.list identity s.launches )
        , ( "invalid", E.list (\n -> E.object [ ( "where", E.string n.place ), ( "value", E.float n.value ) ]) s.invalid )
        ]


attacks : Hunt.Attacks { charges : List Charge, launches : List E.Value } { drone : Maybe Bool, damage : Maybe Float, airSupport : Maybe Bool, satellite : Maybe Bool, pingDetection : Maybe Float, longPatrol : Maybe Bool, showSuspicion : Maybe Bool, omniscientChart : Maybe Bool, orbitCamera : Maybe Bool, instantReplay : Maybe Bool, enemyReplay : Maybe Bool, torpedoCam : Maybe Bool }
attacks =
    { dropCharge = \c s -> { s | charges = s.charges ++ [ c ] }
    , launchTorpedo =
        \ship t s ->
            ( { ship
                | lastTubeSide =
                    Just
                        (if ship.lastTubeSide == Just 1 then
                            -1

                         else
                            1
                        )
              }
            , { s | launches = s.launches ++ [ E.object [ ( "launcher", E.string ship.id ), ( "attack", E.float ship.attack ), ( "heading", E.float ship.heading ), ( "trackAge", E.float t.age ) ] ] }
            )
    }


savedReport : D.Decoder SavedReport
savedReport =
    D.map6 SavedReport (D.field "x" D.float) (D.field "y" D.float) (D.field "time" D.float) (optional "depth" D.float) (optional "heading" D.float) (optional "speed" D.float)


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "hostileTracks.playerReport" ->
            Just (D.map (Reports.playerReport >> encodeReport >> E.object) (arg 0 (D.map6 (\x y depth heading speed time -> { x = x, y = y, depth = depth, heading = heading, speed = speed, time = time }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "heading" D.float) (D.field "speed" D.float) (D.field "time" D.float))))

        "hostileTracks.searchDuration" ->
            Just (D.map (\d -> E.float (Reports.searchDuration { difficulty = d })) (arg 0 (optional "difficulty" difficulty)))

        "hostileTracks.projectedReport" ->
            Just (D.map3 (\r time lead -> encodeTrack (Reports.projectedReport time lead r)) (arg 0 report) (arg 1 D.float) (arg 2 D.float))

        "hostileTracks.validReport" ->
            Just (D.map3 (\raw time legacy -> E.bool (Result.map (Reports.validReport time legacy) raw |> Result.withDefault False)) (arg 0 (D.map (D.decodeValue savedReport) D.value)) (arg 1 D.float) (arg 2 D.bool))

        "hostileTracks.scatterAim" ->
            Just
                (D.map3 (\rng target radius -> Reports.scatterAim radius target { rng = rng } |> (\( p, after ) -> E.list identity [ E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ) ], E.int after.rng ]))
                    (arg 0 (D.field "rng" D.int))
                    (arg 1 (D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)))
                    (arg 2 D.float)
                )

        "hostileTracks.updateHostileTrack" ->
            Just
                (D.map4 (\s ship senses dt -> Hunt.updateHostileTrack senses dt s ship |> (\( after, t ) -> E.list identity [ Ship.encode after, Maybe.map encodeTrack t |> Maybe.withDefault E.null ]))
                    (arg 0 hunt)
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                    (arg 2 (D.map2 Hunt.Senses (D.field "subVisualRange" D.float) (D.field "storm" D.float)))
                    (arg 3 D.float)
                )

        "hostileTracks.reportHunterState" ->
            Just
                (D.map3 (\s ship t -> Hunt.reportHunterState ship t s |> (\( after, state ) -> E.list identity [ Ship.encode after, encodeHunt state ]))
                    (arg 0 hunt)
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                    (arg 2 (D.nullable track))
                )

        "hostileTracks.pursueAndAttack" ->
            Just
                (D.map4 (\s ship t dt -> Hunt.pursueAndAttack dt attacks t ship s |> (\( after, state ) -> E.list identity [ Ship.encode after, encodeHunt state ]))
                    (arg 0 hunt)
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                    (arg 2 track)
                    (arg 3 D.float)
                )

        _ ->
            Nothing
