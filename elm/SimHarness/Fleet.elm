module SimHarness.Fleet exposing (function, optional, shots)

{-| Harness entries for the fleet action: its stage, its battle, its volleys
and its save validation.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.FleetAction as FleetAction
import Sim.FleetActionSaves as Saves exposing (savedTheater)
import Sim.FleetTheater as Theater exposing (Battle)
import Sim.FleetVolleys as Volleys exposing (Volley)
import Sim.SaveParts exposing (battle, encodeBattle, encodeVolley, volley)
import Sim.Ship as Ship exposing (Ship)
import Sim.Vessel as Vessel exposing (Kind, Side)
import SimHarness.Codec exposing (arg)


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


side : D.Decoder Side
side =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\s -> Vessel.sideName s == name) Vessel.sides of
                    s :: _ ->
                        D.succeed s

                    [] ->
                        D.fail name
            )


kind : D.Decoder Kind
kind =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\k -> Vessel.kindName k == name) Vessel.kinds of
                    k :: _ ->
                        D.succeed k

                    [] ->
                        D.fail name
            )


{-| A theater for one call, with a log standing in for the mission's
handler. Like the mission, it takes an impact id from the weapon sequence
for each arrival, so shots fired later in the same call must draw past it.
-}
type alias State =
    { time : Float
    , weaponSequence : Int
    , ships : List Ship
    , battle : Battle
    , patrol : { seed : Float }
    , log : List E.Value
    }


state : D.Decoder State
state =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.map5 (\weaponSequence ships b seed log -> { time = now, weaponSequence = weaponSequence, ships = ships, battle = b, patrol = { seed = seed }, log = log })
                    (D.field "weaponSequence" D.int)
                    (D.field "ships" (D.list (Ship.decoder now)))
                    (D.field "battle" battle)
                    (D.at [ "patrol", "seed" ] D.float)
                    (D.succeed [])
            )


record : Ship -> Volley -> Bool -> State -> State
record ship v fired s =
    { s
        | log = s.log ++ [ E.object [ ( "ship", Ship.encode ship ), ( "volley", encodeVolley v ), ( "fired", E.bool fired ) ] ]
        , weaponSequence =
            if fired then
                s.weaponSequence

            else
                s.weaponSequence + 1
    }


encodeState : State -> E.Value
encodeState s =
    E.object
        [ ( "weaponSequence", E.int s.weaponSequence )
        , ( "ships", E.list Ship.encode s.ships )
        , ( "battle", encodeBattle s.battle )
        , ( "log", E.list identity s.log )
        ]


{-| What `activeVolleys` reads: the battle's volleys, the convoy's shot and
passing traffic's volleys, each possibly absent.
-}
shots : D.Decoder { battle : Maybe { volleys : List Volley }, convoy : Maybe { shot : Maybe Volley }, traffic : Maybe { volleys : List Volley } }
shots =
    D.map3 (\b convoy traffic -> { battle = b, convoy = convoy, traffic = traffic })
        (optional "battle" (D.map (\vs -> { volleys = vs }) (D.field "volleys" (D.list volley))))
        (optional "convoy" (D.map (\shot -> { shot = shot }) (D.field "shot" (D.nullable volley))))
        (optional "traffic" (D.map (\vs -> { volleys = vs }) (D.field "volleys" (D.list volley))))


afloat : D.Decoder (List { side : Maybe Side, hull : Float, incidental : Maybe Bool })
afloat =
    D.list (D.map3 (\s h i -> { side = s, hull = h, incidental = i }) (optional "side" side) (D.field "hull" D.float) (optional "incidental" D.bool))


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "fleetAction.fleetTheater" ->
            Just
                (D.map2 (\origin seed -> Theater.fleetTheater origin seed |> (\t -> E.object [ ( "ships", E.list Ship.encode t.ships ), ( "battle", encodeBattle t.battle ) ]))
                    (arg 0 (D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)))
                    (arg 1 D.float)
                )

        "fleetAction.advanceFleetAction" ->
            Just (D.map (FleetAction.advanceFleetAction record >> encodeState) (arg 0 state))

        "fleetAction.activeVolleys" ->
            Just (D.map (Volleys.activeVolleys >> E.list encodeVolley) (arg 0 shots))

        "fleetAction.fleetShotPose" ->
            Just
                (D.map2
                    (\v time ->
                        let
                            p : { id : Int, x : Float, y : Float, depth : Float, time : Float, age : Float, heading : Float, pitch : Float, speed : Float }
                            p =
                                Volleys.fleetShotPose v time
                        in
                        E.object [ ( "id", E.int p.id ), ( "x", E.float p.x ), ( "y", E.float p.y ), ( "depth", E.float p.depth ), ( "time", E.float p.time ), ( "age", E.float p.age ), ( "heading", E.float p.heading ), ( "pitch", E.float p.pitch ), ( "speed", E.float p.speed ) ]
                    )
                    (arg 0 volley)
                    (arg 1 D.float)
                )

        "fleetAction.classifyEcho" ->
            Just
                (D.map4 (\b ship observation roll -> Theater.classifyEcho b ship observation roll |> Maybe.map (Vessel.sideName >> E.string) |> Maybe.withDefault E.null)
                    (arg 0 battle)
                    (arg 1 (D.map2 (\k s -> { kind = k, side = s }) (D.field "kind" kind) (optional "side" side)))
                    (arg 2 (D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)))
                    (arg 3 D.float)
                )

        "fleetAction.affiliation" ->
            Just
                (D.map
                    (Theater.affiliation >> E.string)
                    (arg 0 (D.map4 (\s p m i -> { side = s, probableSide = p, military = m, identified = i }) (optional "side" side) (optional "probableSide" side) (optional "military" D.bool) (optional "identified" D.bool)))
                )

        "fleetAction.isOpponent" ->
            Just (D.map (Theater.isOpponent >> E.bool) (arg 0 (D.map2 (\m s -> { military = m, side = s }) (optional "military" D.bool) (optional "side" side))))

        "fleetAction.sidesAfloat" ->
            Just (D.map (Theater.sidesAfloat >> (\c -> E.object [ ( "friendly", E.int c.friendly ), ( "hostile", E.int c.hostile ) ])) (arg 0 afloat))

        "fleetAction.friendlyLead" ->
            Just (D.map (Theater.friendlyLead >> E.int) (arg 0 afloat))

        "fleetAction.validTheater" ->
            Just (D.map (Result.map Saves.validTheater >> Result.withDefault False >> E.bool) (arg 0 (D.map (D.decodeValue savedTheater) D.value)))

        _ ->
            Nothing
