module SimHarness.AirSupport exposing (function)

{-| Harness entries for enemy air support. The aircraft update reads the
conditions from the same patrol through the world harness's sky decoder.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.AirSupport as Air exposing (AirSupport, Aircraft)
import Sim.AircraftFlight as Flight
import Sim.Boat exposing (Systems)
import Sim.Coast as Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.Environment as Env
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.Ordnance exposing (Blast, Round)
import Sim.OrdnanceSaves exposing (airSupport, aircraft, blast, encodeAirSupport, encodeAircraft, encodeBlast, encodeRound, gunRound)
import Sim.SaveParts exposing (logKind)
import Sim.Ship as Ship exposing (Ship)
import Sim.Sound as Sound exposing (Sound)
import SimHarness.Codec exposing (andMap, arg)
import SimHarness.Fleet exposing (optional)
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


mission : D.Decoder Mission
mission =
    D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail id))


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
                    |> andMap (D.field "gunRounds" (D.list gunRound))
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
