module Sim.ColdWatch exposing (advanceTraffic, canAttackPlayer, playerSignal)

{-| The cold watch: military traffic that meets other ships, or the player,
takes a stand toward them that escalates from watching to approaching,
warning (a shell across the bow, a short torpedo run, a sonar ping) and
fighting, or ends in retreat when outmatched, hurt or unwilling. Volleys fly
and land on a seeded schedule. The patrol reacts to each arrival, warning,
shot, landing and withdrawal through `Signal`, called in the TypeScript's
order, since the patrol takes impact ids from the same sequence volleys
draw from. Arrivals of new traffic are `Sim.TrafficEncounters`, the shared
types `Sim.Stands`, and each ship's turn `Sim.StandDecisions`.
-}

import PatrolMission exposing (Mission)
import Sim.Carrier as Carrier
import Sim.FleetVolleys exposing (Volley)
import Sim.Math as M
import Sim.Ship exposing (Order(..), Parley, Ship)
import Sim.StandDecisions exposing (decide)
import Sim.Stands exposing (Action(..), Signal, Watching, findShip, military, nth, range, scripted, setShip, sideOf, stand)
import Sim.TrafficEncounters as Encounters exposing (Traffic)
import Sim.Vessel exposing (Side(..))


{-| A hostile military ship notices the player. `heard` is where, if known;
`Nothing` falls back on the ship's own last report. A serious signal means a
fight; otherwise the stand escalates one step, to a warning.
-}
playerSignal : Bool -> Maybe { x : Float, y : Float } -> { s | x : Float, y : Float, time : Float } -> Ship -> Ship
playerSignal serious heard s v =
    if not (military v) || v.hull <= 0 || sideOf v == Friendly then
        v

    else
        let
            p0 : Parley
            p0 =
                stand s.time "player" (range s v) v

            source : Maybe { x : Float, y : Float }
            source =
                case heard of
                    Just point ->
                        Just point

                    Nothing ->
                        Maybe.map (\r -> { x = r.x, y = r.y }) v.report

            p : Parley
            p =
                case source of
                    Just h ->
                        { p0 | origin = Just { x = toFloat (round (h.x / 250)) * 250, y = toFloat (round (h.y / 250)) * 250, time = s.time } }

                    Nothing ->
                        p0
        in
        if p.order == Fight then
            { v | parley = Just p }

        else
            { v
                | parley =
                    Just
                        { p
                            | level =
                                if serious then
                                    4

                                else
                                    M.min 4 (p.level + 1)
                            , next = s.time
                            , order =
                                if serious then
                                    Fight

                                else
                                    Warn
                        }
            }


canAttackPlayer : { s | mission : Mission } -> Ship -> Bool
canAttackPlayer s v =
    case v.parley of
        Nothing ->
            (v.incidental /= Just True && M.notLess v.alert 80) || scripted s v

        Just p ->
            p.order == Fight && p.against == "player"


{-| One tick: the watch's traffic arrives when due, volleys land, and every
four seconds each military ship whose stand is due decides what to do.
`holiday` restrains how readily ships take the initiative.
-}
advanceTraffic : Bool -> Signal s p -> Watching s p -> Watching s p
advanceTraffic holiday signal start =
    let
        window : Int
        window =
            floor (start.time / Encounters.halfDay)

        t0 : Traffic
        t0 =
            start.traffic

        visited : Watching s p
        visited =
            if t0.window < window && M.notLess start.time (Encounters.encounterTime start.patrol.seed window) then
                Encounters.visitors window (\ship st -> signal Arrival ship Nothing st) { start | traffic = { t0 | window = window } }

            else
                start

        landed : Watching s p
        landed =
            land signal visited

        t : Traffic
        t =
            landed.traffic
    in
    if landed.time < t.next then
        landed

    else
        List.foldl (shipTurn holiday signal t.turn)
            { landed | traffic = { t | next = landed.time + 4, turn = t.turn + 1 } }
            (List.range 0 (List.length landed.ships - 1))


{-| Volleys that have arrived strike their target, if it still floats, which
then fights whoever fired; each arrival is answered through the signal.
-}
land : Signal s p -> Watching s p -> Watching s p
land signal start =
    let
        step : Volley -> ( List Volley, Watching s p ) -> ( List Volley, Watching s p )
        step shot ( kept, s ) =
            if s.time < shot.arrives then
                ( shot :: kept, s )

            else
                let
                    struck : Watching s p
                    struck =
                        case findShip shot.target s.ships of
                            Just ( i, target ) ->
                                if 0 < target.hull && M.truthy shot.damage then
                                    let
                                        hit : Ship
                                        hit =
                                            { target | hull = Carrier.incidentalHull { kind = target.kind, hull = target.hull, directHits = floor (Maybe.withDefault 0 target.directHits) } shot.damage }

                                        p : Parley
                                        p =
                                            stand s.time shot.source (range hit shot.from) hit
                                    in
                                    setShip i { hit | parley = Just { p | level = 4, order = Fight } } s

                                else
                                    s

                            Nothing ->
                                s
                in
                ( kept
                , case findShip shot.source struck.ships of
                    Just ( _, source ) ->
                        signal Answer source (Just shot) struck

                    Nothing ->
                        struck
                )

        ( remaining, after ) =
            List.foldl step ( [], start ) start.traffic.volleys

        t : Traffic
        t =
            after.traffic
    in
    { after | traffic = { t | volleys = List.reverse remaining } }


shipTurn : Bool -> Signal s p -> Int -> Int -> Watching s p -> Watching s p
shipTurn holiday signal turn i s =
    case nth i s.ships of
        Just v ->
            if v.hull <= 0 || not (military v) then
                s

            else
                case v.parley of
                    Just prior ->
                        if s.time < prior.next then
                            s

                        else
                            decide holiday signal turn i v (Just prior) s

                    Nothing ->
                        decide holiday signal turn i v Nothing s

        Nothing ->
            s
