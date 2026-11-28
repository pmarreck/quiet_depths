module SimHarness.ColdWatch exposing (function)

{-| Harness entries for the cold watch and its traffic. The signal stand-in
logs each action with a snapshot of the ship and its volley, and takes an
impact id for each answer, as the patrol's handler and the test's TypeScript
stand-in do.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission)
import Sim.Coast as Coast exposing (Coastline)
import Sim.ColdWatch as Watch
import Sim.SaveParts exposing (encodeTraffic, encodeVolley, traffic)
import Sim.Ship as Ship exposing (Ship)
import Sim.Stands as Stands
import Sim.TrafficEncounters as Encounters exposing (Traffic)
import Sim.TrafficSaves as Saves exposing (savedTraffic)
import SimHarness.Codec exposing (arg)


type alias Watch =
    { x : Float
    , y : Float
    , time : Float
    , mission : Mission
    , chart : Maybe Coastline
    , patrol : { seed : Float }
    , ships : List Ship
    , traffic : Traffic
    , weaponSequence : Int
    , log : List E.Value
    }


mission : D.Decoder Mission
mission =
    D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail id))


watch : D.Decoder Watch
watch =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.map8 (\x y m chart seed ships t sequence -> { x = x, y = y, time = now, mission = m, chart = chart, patrol = { seed = seed }, ships = ships, traffic = t, weaponSequence = sequence, log = [] })
                    (D.field "x" D.float)
                    (D.field "y" D.float)
                    (D.field "mission" mission)
                    (D.at [ "environment", "chartSeed" ] D.float |> D.map (Coast.coastline >> Just))
                    (D.at [ "patrol", "seed" ] D.float)
                    (D.field "ships" (D.list (Ship.decoder now)))
                    (D.field "traffic" traffic)
                    (D.field "weaponSequence" D.int)
            )


signal : Stands.Signal { log : List E.Value } {}
signal action ship shot s =
    { s
        | log = s.log ++ [ E.object [ ( "action", E.string (Stands.actionName action) ), ( "ship", Ship.encode ship ), ( "shot", Maybe.map encodeVolley shot |> Maybe.withDefault E.null ) ] ]
        , weaponSequence =
            if action == Stands.Answer then
                s.weaponSequence + 1

            else
                s.weaponSequence
    }


encodeWatch : Watch -> E.Value
encodeWatch s =
    E.object
        [ ( "ships", E.list Ship.encode s.ships )
        , ( "traffic", encodeTraffic s.traffic )
        , ( "weaponSequence", E.int s.weaponSequence )
        , ( "log", E.list identity s.log )
        ]


point : D.Decoder { x : Float, y : Float }
point =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "coldWatch.temperament" ->
            Just (D.map2 (\seed id -> E.float (Encounters.temperament seed id)) (arg 0 D.float) (arg 1 D.string))

        "coldWatch.freshTraffic" ->
            Just (D.map (Encounters.freshTraffic >> encodeTraffic) (arg 0 D.float))

        "coldWatch.encounterTime" ->
            Just (D.map2 (\seed window -> E.float (Encounters.encounterTime seed window)) (arg 0 D.float) (arg 1 D.int))

        "coldWatch.resumeTraffic" ->
            Just (D.map2 (\time seed -> encodeTraffic (Encounters.resumeTraffic time seed)) (arg 0 D.float) (arg 1 D.float))

        "coldWatch.encounterGroups" ->
            Just
                (D.map2
                    (\seed window ->
                        Encounters.encounterGroups seed window
                            |> (\g -> E.object [ ( "friendlySub", E.bool g.friendlySub ), ( "hostileSub", E.bool g.hostileSub ), ( "friendlySurface", E.bool g.friendlySurface ), ( "hostileSurface", E.bool g.hostileSurface ) ])
                    )
                    (arg 0 D.float)
                    (arg 1 D.int)
                )

        "coldWatch.playerSignal" ->
            Just
                (D.map4
                    (\s ship serious heard -> Ship.encode (Watch.playerSignal serious (heard s) s ship))
                    (arg 0 (D.map3 (\x y time -> { x = x, y = y, time = time }) (D.field "x" D.float) (D.field "y" D.float) (D.field "time" D.float)))
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                    (arg 2 D.bool)
                    -- JavaScript's default parameter: a missing source is the boat itself;
                    -- null falls back on the ship's report.
                    (D.oneOf
                        [ D.index 3 (D.null (\_ -> Nothing))
                        , D.index 3 point |> D.map (\p _ -> Just p)
                        , D.succeed (\s -> Just { x = s.x, y = s.y })
                        ]
                    )
                )

        "coldWatch.canAttackPlayer" ->
            Just
                (D.map2 (\m ship -> E.bool (Watch.canAttackPlayer { mission = m } ship))
                    (arg 0 (D.field "mission" mission))
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                )

        "coldWatch.advanceTraffic" ->
            Just (D.map2 (\s holiday -> encodeWatch (Watch.advanceTraffic holiday signal s)) (arg 0 watch) (arg 1 D.bool))

        "coldWatch.validTraffic" ->
            Just (D.map (Result.map Saves.validTraffic >> Result.withDefault False >> E.bool) (arg 0 (D.map (D.decodeValue savedTraffic) D.value)))

        _ ->
            Nothing
