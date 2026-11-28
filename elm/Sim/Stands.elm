module Sim.Stands exposing (Action(..), Signal, Target, Watching, actionName, attackingPlayer, bearingTo, clamp01, disabled, findShip, military, nth, range, scripted, setShip, sideOf, stand, strength)

{-| A ship's stand in the cold watch, toward another ship or the player, and
what the watch's modules share: the patrol fields it reads, the signal the
patrol answers, and each ship's side, strength, range and bearing.
-}

import PatrolMission exposing (Mission)
import Sim.Coast exposing (Coastline)
import Sim.FleetVolleys exposing (Volley)
import Sim.Math as M
import Sim.Ship exposing (Order(..), Parley, Ship)
import Sim.TrafficEncounters exposing (Traffic)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


type Action
    = Ping
    | Shell
    | ShortRun
    | Attack
    | Answer
    | Arrival
    | Withdraw


actionName : Action -> String
actionName action =
    case action of
        Ping ->
            "ping"

        Shell ->
            "shell"

        ShortRun ->
            "short-run"

        Attack ->
            "attack"

        Answer ->
            "answer"

        Arrival ->
            "arrival"

        Withdraw ->
            "withdraw"


{-| The patrol fields the watch reads and writes.
-}
type alias Watching s p =
    { s
        | x : Float
        , y : Float
        , time : Float
        , mission : Mission
        , chart : Maybe Coastline
        , patrol : { p | seed : Float }
        , ships : List Ship
        , traffic : Traffic
        , weaponSequence : Int
    }


{-| What the patrol does for an action by a ship, with its volley if it
fired one.
-}
type alias Signal s p =
    Action -> Ship -> Maybe Volley -> Watching s p -> Watching s p


{-| What a stand is taken against: another ship, or where the player was
last observed.
-}
type alias Target =
    { x : Float, y : Float, id : String, depth : Maybe Float }


sideOf : Ship -> Side
sideOf v =
    Maybe.withDefault Hostile v.side


military : Ship -> Bool
military v =
    v.military == Just True


disabled : Ship -> Bool
disabled v =
    v.disabled == Just True


strength : Ship -> Float
strength v =
    (case v.kind of
        Surface Merchant ->
            1

        Surface Carrier ->
            4

        _ ->
            3
    )
        * v.hull
        / 100
        * (if disabled v then
            0.5

           else
            1
          )


scripted : { s | mission : Mission } -> Ship -> Bool
scripted s v =
    v.incidental /= Just True && (PatrolMission.briefing s.mission).encounterOrders == PatrolMission.Engage


range : { a | x : Float, y : Float } -> { b | x : Float, y : Float } -> Float
range a b =
    M.hypot2 (a.x - b.x) (a.y - b.y)


bearingTo : { a | x : Float, y : Float } -> { b | x : Float, y : Float } -> Float
bearingTo a b =
    M.remainder (atan2 (b.x - a.x) (b.y - a.y) * 180 / pi + 360) 360


clamp01 : Float -> Float
clamp01 n =
    M.max 0 (M.min 1 n)


{-| The ship's stand against `target`, taken afresh (watching, at this range,
cruising at its present or earlier speed) when it was against another.
-}
stand : Float -> String -> Float -> Ship -> Parley
stand time target d v =
    let
        fresh : Maybe Float -> Parley
        fresh cruise =
            { against = target, level = 0, order = Watch, range = d, next = time, cruise = Maybe.withDefault v.speed cruise, origin = Nothing }
    in
    case v.parley of
        Just p ->
            if p.against == target then
                p

            else
                fresh (Just p.cruise)

        Nothing ->
            fresh Nothing


attackingPlayer : Float -> Ship -> Bool
attackingPlayer time v =
    (case v.parley of
        Just p ->
            p.against == "player" && p.order == Fight

        Nothing ->
            False
    )
        || (case v.lastAttackAt of
                Just t ->
                    time - t < 45

                Nothing ->
                    False
           )


setShip : Int -> Ship -> Watching s p -> Watching s p
setShip i ship s =
    { s
        | ships =
            List.indexedMap
                (\j v ->
                    if j == i then
                        ship

                    else
                        v
                )
                s.ships
    }


findShip : String -> List Ship -> Maybe ( Int, Ship )
findShip id ships =
    List.indexedMap Tuple.pair ships |> List.filter (\( _, v ) -> v.id == id) |> List.head


nth : Int -> List a -> Maybe a
nth i list =
    List.drop i list |> List.head
