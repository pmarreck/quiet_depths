module SimHarness.AirSupport exposing (function)

{-| Harness entries for enemy air support. The aircraft update reads the
conditions from the same patrol through the world harness's sky decoder.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.AirSupport as Air exposing (AirReport, AirSupport, Aircraft)
import Sim.AircraftFlight as Flight
import Sim.AircraftPhase as AircraftPhase
import Sim.Boat exposing (Systems)
import Sim.Coast as Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.Environment as Env
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.Ordnance as Ordnance exposing (Aloft, Blast, Round)
import Sim.Ship as Ship exposing (Ship)
import Sim.Sound as Sound exposing (Sound)
import SimHarness.Codec exposing (andMap, arg, point)
import SimHarness.Fleet exposing (optional)
import SimHarness.Hulls exposing (logKind)
import SimHarness.Patrol exposing (systems)
import SimHarness.World as World


type alias Skies =
    { x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , speed : Float
    , time : Float
    , mission : Mission
    , rng : Int
    , patrol : { seed : Float }
    , chart : Maybe Coastline
    , difficulty : Maybe { airSupport : Maybe Bool, detection : Maybe Float, pursuit : Maybe Float }
    , systems : Systems
    , scope : Bool
    , scopeTravel : Maybe Float
    , ships : List Ship
    , aircraft : List Aircraft
    , airSupport : AirSupport
    , blasts : List Blast
    , gunRounds : List Round
    , weaponSequence : Int
    , soundSequence : Int
    , acoustics : List Sound
    , invalid : List InvalidNumber
    , events : List LogEntry
    , debrief : List Debrief.Entry
    }


named : String -> (a -> String) -> List a -> D.Decoder a
named what name values =
    D.string
        |> D.andThen
            (\given ->
                List.filter (\v -> name v == given) values
                    |> List.head
                    |> Maybe.map D.succeed
                    |> Maybe.withDefault (D.fail ("unknown " ++ what ++ ": " ++ given))
            )


mission : D.Decoder Mission
mission =
    D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail id))


aloft : D.Decoder Aloft
aloft =
    D.map3 Aloft (D.field "x" D.float) (D.field "y" D.float) (D.field "altitude" D.float)


encodeAloft : Aloft -> E.Value
encodeAloft a =
    E.object [ ( "x", E.float a.x ), ( "y", E.float a.y ), ( "altitude", E.float a.altitude ) ]


{-| Optional fields encode only when present, as the TypeScript leaves them
out.
-}
present : List ( String, Maybe E.Value ) -> List ( String, E.Value )
present =
    List.filterMap (\( key, value ) -> Maybe.map (Tuple.pair key) value)


airReport : D.Decoder AirReport
airReport =
    D.succeed AirReport
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "time" D.float)
        |> andMap (optional "depth" D.float)
        |> andMap (optional "heading" D.float)
        |> andMap (optional "speed" D.float)
        |> andMap (optional "reason" D.string)


encodeAirReport : AirReport -> E.Value
encodeAirReport r =
    E.object
        ([ ( "x", E.float r.x ), ( "y", E.float r.y ), ( "time", E.float r.time ) ]
            ++ present [ ( "depth", Maybe.map E.float r.depth ), ( "heading", Maybe.map E.float r.heading ), ( "speed", Maybe.map E.float r.speed ), ( "reason", Maybe.map E.string r.reason ) ]
        )


airSupport : D.Decoder AirSupport
airSupport =
    D.map5 AirSupport
        (D.field "status" (named "sortie" Air.sortieName Air.sorties))
        (D.field "requestedAt" (D.nullable D.float))
        (D.field "launchAt" (D.nullable D.float))
        (D.field "base" point)
        (D.field "lastKnown" (D.nullable airReport))


encodeAirSupport : AirSupport -> E.Value
encodeAirSupport a =
    let
        orNull : (v -> E.Value) -> Maybe v -> E.Value
        orNull encode =
            Maybe.map encode >> Maybe.withDefault E.null
    in
    E.object
        [ ( "status", E.string (Air.sortieName a.status) )
        , ( "requestedAt", orNull E.float a.requestedAt )
        , ( "launchAt", orNull E.float a.launchAt )
        , ( "base", E.object [ ( "x", E.float a.base.x ), ( "y", E.float a.base.y ) ] )
        , ( "lastKnown", orNull encodeAirReport a.lastKnown )
        ]


aircraft : D.Decoder Aircraft
aircraft =
    D.succeed Aircraft
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "name" D.string)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "altitude" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (D.field "hull" D.float)
        |> andMap (D.field "phase" (named "aircraft phase" AircraftPhase.phaseName AircraftPhase.phases))
        |> andMap (D.field "takeoffUntil" D.float)
        |> andMap (D.field "attack" D.float)
        |> andMap (D.field "bank" D.float)
        |> andMap (D.field "bombDropped" D.bool)
        |> andMap (optional "previous" aloft)
        |> andMap (optional "egress" D.float)


encodeAircraft : Aircraft -> E.Value
encodeAircraft p =
    E.object
        ([ ( "id", E.string p.id )
         , ( "name", E.string p.name )
         , ( "x", E.float p.x )
         , ( "y", E.float p.y )
         , ( "altitude", E.float p.altitude )
         , ( "heading", E.float p.heading )
         , ( "speed", E.float p.speed )
         , ( "hull", E.float p.hull )
         , ( "phase", E.string (AircraftPhase.phaseName p.phase) )
         , ( "takeoffUntil", E.float p.takeoffUntil )
         , ( "attack", E.float p.attack )
         , ( "bank", E.float p.bank )
         , ( "bombDropped", E.bool p.bombDropped )
         ]
            ++ present [ ( "previous", Maybe.map encodeAloft p.previous ), ( "egress", Maybe.map E.float p.egress ) ]
        )


blast : D.Decoder Blast
blast =
    D.succeed Blast
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "delay" D.float)
        |> andMap (D.field "totalDelay" D.float)
        |> andMap (optional "airTime" D.float)
        |> andMap (optional "airHeight" D.float)
        |> andMap (D.field "age" D.float)
        |> andMap (D.field "exploded" D.bool)
        |> andMap (D.field "kind" (named "blast kind" Ordnance.blastKindName Ordnance.blastKinds))
        |> andMap (optional "splashed" D.bool)
        |> andMap (optional "explodedAt" D.float)
        |> andMap (optional "convoyCharge" D.bool)


encodeBlast : Blast -> E.Value
encodeBlast b =
    E.object
        ([ ( "id", E.int b.id )
         , ( "x", E.float b.x )
         , ( "y", E.float b.y )
         , ( "depth", E.float b.depth )
         , ( "delay", E.float b.delay )
         , ( "totalDelay", E.float b.totalDelay )
         , ( "age", E.float b.age )
         , ( "exploded", E.bool b.exploded )
         , ( "kind", E.string (Ordnance.blastKindName b.kind) )
         ]
            ++ present
                [ ( "airTime", Maybe.map E.float b.airTime )
                , ( "airHeight", Maybe.map E.float b.airHeight )
                , ( "splashed", Maybe.map E.bool b.splashed )
                , ( "explodedAt", Maybe.map E.float b.explodedAt )
                , ( "convoyCharge", Maybe.map E.bool b.convoyCharge )
                ]
        )


round : D.Decoder Round
round =
    D.succeed Round
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "owner" (named "gun owner" Ordnance.gunOwnerName Ordnance.gunOwners))
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "altitude" D.float)
        |> andMap (D.field "vx" D.float)
        |> andMap (D.field "vy" D.float)
        |> andMap (D.field "vz" D.float)
        |> andMap (D.field "age" D.float)
        |> andMap (D.field "tracer" D.bool)
        |> andMap (optional "previous" aloft)


encodeRound : Round -> E.Value
encodeRound r =
    E.object
        ([ ( "id", E.int r.id )
         , ( "owner", E.string (Ordnance.gunOwnerName r.owner) )
         , ( "x", E.float r.x )
         , ( "y", E.float r.y )
         , ( "altitude", E.float r.altitude )
         , ( "vx", E.float r.vx )
         , ( "vy", E.float r.vy )
         , ( "vz", E.float r.vz )
         , ( "age", E.float r.age )
         , ( "tracer", E.bool r.tracer )
         ]
            ++ present [ ( "previous", Maybe.map encodeAloft r.previous ) ]
        )


skies : D.Decoder Skies
skies =
    D.map2 Tuple.pair (D.field "time" D.float) (D.field "ships" (D.list (D.field "id" D.string)))
        |> D.andThen
            (\( now, ids ) ->
                D.succeed (\x y depth heading speed m rng seed chart difficulty sys scope scopeTravel ships planes support blasts rounds weapons sounds acoustics events debrief -> Skies x y depth heading speed now m rng { seed = seed } chart difficulty sys scope scopeTravel ships planes support blasts rounds weapons sounds acoustics [] events debrief)
                    |> andMap (D.field "x" D.float)
                    |> andMap (D.field "y" D.float)
                    |> andMap (D.field "depth" D.float)
                    |> andMap (D.field "heading" D.float)
                    |> andMap (D.field "speed" D.float)
                    |> andMap (D.field "mission" mission)
                    |> andMap (D.field "rng" D.int)
                    |> andMap (D.at [ "patrol", "seed" ] D.float)
                    |> andMap (D.at [ "environment", "chartSeed" ] D.float |> D.map (Coast.coastline >> Just))
                    |> andMap (optional "difficulty" (D.map3 (\a d p -> { airSupport = a, detection = d, pursuit = p }) (optional "airSupport" D.bool) (optional "detection" D.float) (optional "pursuit" D.float)))
                    |> andMap (D.field "systems" systems)
                    |> andMap (D.field "scope" D.bool)
                    |> andMap (optional "scopeTravel" D.float)
                    |> andMap (D.field "ships" (D.list (Ship.decoder now)))
                    |> andMap (D.field "aircraft" (D.list aircraft))
                    |> andMap (D.field "airSupport" airSupport)
                    |> andMap (D.field "blasts" (D.list blast))
                    |> andMap (D.field "gunRounds" (D.list round))
                    |> andMap (D.field "weaponSequence" D.int)
                    |> andMap (D.field "soundSequence" D.int)
                    |> andMap (D.field "acoustics" (D.list (Sound.decoder ids)))
                    |> andMap (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                    |> andMap (D.field "debrief" (D.list (D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string))))
            )


{-| The fields air support changes.
-}
encodeSkies : Skies -> E.Value
encodeSkies s =
    E.object
        [ ( "ships", E.list Ship.encode s.ships )
        , ( "aircraft", E.list encodeAircraft s.aircraft )
        , ( "airSupport", encodeAirSupport s.airSupport )
        , ( "blasts", E.list encodeBlast s.blasts )
        , ( "gunRounds", E.list encodeRound s.gunRounds )
        , ( "weaponSequence", E.int s.weaponSequence )
        , ( "soundSequence", E.int s.soundSequence )
        , ( "acoustics", E.list Sound.encode s.acoustics )
        , ( "rng", E.int s.rng )
        , ( "events", E.list (\e -> E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]) s.events )
        , ( "debrief", E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ]) s.debrief )
        , ( "invalid", E.list (\n -> E.object [ ( "where", E.string n.place ), ( "value", E.float n.value ) ]) s.invalid )
        ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "airSupport.raiseCarrierAlarm" ->
            Just (D.map2 (\s carrier -> encodeSkies (Air.raiseCarrierAlarm carrier s)) (arg 0 skies) (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now))))

        "airSupport.requestSupport" ->
            Just (D.map (Air.requestSupport >> encodeSkies) (arg 0 skies))

        "airSupport.updateAircraft" ->
            Just (D.map3 (\s sky dt -> encodeSkies (Flight.updateAircraft (Env.environmentAt sky) dt s)) (arg 0 skies) (arg 0 World.boat) (arg 1 D.float))

        _ ->
            Nothing
