module Sim.TrafficSaves exposing (SavedTraffic, SavedVolley, savedTraffic, validTraffic)

{-| Whether a saved patrol's traffic can be resumed: the watch counters in
range, ship ids unique, passing traffic named and sided as the watch makes
it, each ship's last attack and stand sane, and each volley in flight with a
fresh id, a real course and a source and target that exist (only a warning
may be aimed at the player). Whether each field has the right JSON type is
the decoder's question; a save that does not decode is invalid.
-}

import Json.Decode as D
import Set
import Sim.FleetVolleys exposing (Position)
import Sim.Math as M
import Sim.SaveParts exposing (position)
import Sim.Ship as Ship exposing (Ship)
import Sim.TrafficEncounters as Encounters


type alias SavedVolley =
    { id : Float
    , source : String
    , target : String
    , underwater : Bool
    , warning : Bool
    , from : Position
    , to : Position
    , launched : Float
    , arrives : Float
    , damage : Float
    }


type alias SavedTraffic =
    { time : Float
    , weaponSequence : Float
    , ships : List Ship
    , window : Float
    , turn : Float
    , next : Float
    , volleys : List SavedVolley
    }


finite : Float -> Bool
finite v =
    not (isNaN v || isInfinite v)


isInteger : Float -> Bool
isInteger v =
    finite v && toFloat (floor v) == v


isSafeInteger : Float -> Bool
isSafeInteger v =
    isInteger v && M.abs v <= 9007199254740991


{-| `passage-<digits>-<0..3>-<0..3>`, as the watch names passing traffic.
-}
passageId : String -> Bool
passageId id =
    let
        digit : Char -> Bool
        digit c =
            '0' <= c && c <= '9'

        slot : String -> Bool
        slot part =
            List.member part [ "0", "1", "2", "3" ]
    in
    case String.split "-" id of
        [ "passage", window, group, index ] ->
            not (String.isEmpty window) && String.all digit window && slot group && slot index

        _ ->
            False


validTraffic : SavedTraffic -> Bool
validTraffic s =
    let
        ids : Set.Set String
        ids =
            Set.fromList (List.map .id s.ships)
    in
    not
        (not (isInteger s.window)
            || s.window
            < -1
            || toFloat (floor (s.time / Encounters.halfDay))
            < s.window
            || not (isSafeInteger s.turn)
            || s.turn
            < 0
            || not (finite s.next)
            || s.next
            < 0
            || Set.size ids
            /= List.length s.ships
        )
        && List.all (validShip s.time ids) s.ships
        && List.all (validVolley s ids) s.volleys
        && List.length s.volleys
        == Set.size (Set.fromList (List.map .id s.volleys))


validShip : Float -> Set.Set String -> Ship -> Bool
validShip time ids v =
    let
        incidentalOk : Bool
        incidentalOk =
            case v.incidental of
                Nothing ->
                    True

                Just flag ->
                    -- The ship decoder accepts only the two sides the watch assigns,
                    -- so a present side is the TypeScript's hostile-or-friendly check.
                    flag && passageId v.id && v.side /= Nothing

        attackOk : Bool
        attackOk =
            case v.lastAttackAt of
                Nothing ->
                    True

                Just t ->
                    not (not (finite t) || t < 0 || time < t)

        parleyOk : Bool
        parleyOk =
            case v.parley of
                Nothing ->
                    True

                Just p ->
                    not
                        (not (isInteger p.level)
                            || p.level
                            < 0
                            || 4
                            < p.level
                            || not (finite p.next && finite p.cruise && finite p.range)
                            || p.range
                            < 0
                            || p.next
                            < 0
                            || (p.against /= "player" && not (Set.member p.against ids))
                            || (case p.origin of
                                    Just o ->
                                        not (finite o.x && finite o.y && finite o.time) || time < o.time

                                    Nothing ->
                                        False
                               )
                        )
    in
    incidentalOk && attackOk && parleyOk


validVolley : SavedTraffic -> Set.Set String -> SavedVolley -> Bool
validVolley s ids v =
    let
        point : Position -> Bool
        point p =
            finite p.x && finite p.y
    in
    not
        (not (isSafeInteger v.id)
            || v.id
            < 1
            || M.notLess v.id s.weaponSequence
            || not (point v.from && point v.to)
            || not (List.all finite [ v.from.altitude, v.to.altitude, v.launched, v.arrives, v.damage ])
            || v.launched
            < 0
            || s.time
            < v.launched
            || v.arrives
            <= s.time
            || v.damage
            < 0
            || (v.warning && not (M.isZero v.damage))
        )
        && Set.member v.source ids
        && (Set.member v.target ids || (v.target == "player" && v.warning))


savedVolley : D.Decoder SavedVolley
savedVolley =
    D.map8 (\id source target underwater warning from to launched -> { id = id, source = source, target = target, underwater = underwater, warning = warning, from = from, to = to, launched = launched, arrives = 0, damage = 0 })
        (D.field "id" D.float)
        (D.field "source" D.string)
        (D.field "target" D.string)
        (D.field "underwater" D.bool)
        (D.field "warning" D.bool)
        (D.field "from" position)
        (D.field "to" position)
        (D.field "launched" D.float)
        |> D.andThen (\v -> D.map2 (\arrives damage -> { v | arrives = arrives, damage = damage }) (D.field "arrives" D.float) (D.field "damage" D.float))


{-| The coastal traffic as a save holds it, with the clock, weapon sequence
and ships its checks read.
-}
savedTraffic : D.Decoder SavedTraffic
savedTraffic =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.map7 SavedTraffic
                    (D.succeed now)
                    (D.field "weaponSequence" D.float)
                    (D.field "ships" (D.list (Ship.decoder now)))
                    (D.at [ "traffic", "window" ] D.float)
                    (D.at [ "traffic", "turn" ] D.float)
                    (D.at [ "traffic", "next" ] D.float)
                    (D.at [ "traffic", "volleys" ] (D.list savedVolley))
            )
