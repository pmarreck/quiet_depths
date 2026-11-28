module Sim.FleetActionSaves exposing (SavedTheater, SavedVolley, savedTheater, validTheater)

{-| Whether a saved fleet action can be resumed: a round counter and a next
round time, both patrol areas, all eight task-group units with their planned
roles, and at most twelve volleys, each with a fresh id, a sane flight and
two ships on opposite sides. Whether each field is present with the right
JSON type is the decoder's question; a save that does not decode is invalid.
Restore has checked the time, the weapon sequence and the ships themselves
before it asks.
-}

import Json.Decode as D
import Set
import Sim.FleetTheater exposing (Area)
import Sim.FleetVolleys exposing (Position)
import Sim.Math as M
import Sim.SaveParts exposing (area, position)
import Sim.Ship as Ship exposing (Ship)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


type alias SavedVolley =
    { id : Float
    , underwater : Bool
    , from : Position
    , to : Position
    , source : String
    , target : String
    , launched : Float
    , arrives : Float
    , damage : Float
    }


type alias SavedTheater =
    { time : Float
    , weaponSequence : Float
    , ships : List Ship
    , round : Float
    , next : Float
    , areas : List Area
    , volleys : List SavedVolley
    }


finite : Float -> Bool
finite v =
    not (isNaN v || isInfinite v)


{-| `Number.isInteger`: finite with no fraction. `floor` compiles to
`Math.floor`, so this holds beyond 32 bits.
-}
isInteger : Float -> Bool
isInteger v =
    finite v && toFloat (floor v) == v


{-| `Number.isSafeInteger`: an integer no larger in magnitude than 2^53 - 1.
-}
isSafeInteger : Float -> Bool
isSafeInteger v =
    isInteger v && M.abs v <= 9007199254740991


validTheater : SavedTheater -> Bool
validTheater s =
    not
        (not (isInteger s.round)
            || s.round
            < 0
            || not (finite s.next)
            || s.next
            < 0
            || List.length s.areas
            /= 2
            || List.any (\a -> not (finite a.x && finite a.y && finite a.radius && 0 < a.radius)) s.areas
        )
        && List.length (List.filter (\v -> v.incidental /= Just True) s.ships)
        == 8
        && List.all (taskGroupPresent s.ships) [ Friendly, Hostile ]
        && List.length s.volleys
        <= 12
        && List.all (validVolley s) s.volleys
        && distinct (List.map .id s.volleys)


taskGroupPresent : List Ship -> Side -> Bool
taskGroupPresent ships side =
    let
        prefix : String
        prefix =
            case side of
                Friendly ->
                    "friendly-"

                Hostile ->
                    "hostile-"

        unitPresent : Int -> Bool
        unitPresent i =
            List.any
                (\v ->
                    v.id
                        == prefix
                        ++ String.fromInt (i + 1)
                        && v.side
                        == Just side
                        && v.military
                        == Just True
                        && v.kind
                        == (if i == 3 then
                                Submarine

                            else
                                Surface Escort
                           )
                        && (Maybe.map finite v.depth |> Maybe.withDefault False)
                )
                ships
    in
    List.all unitPresent (List.range 0 3)


{-| Each comparison is the TypeScript's own, so a NaN in the save fails or
passes exactly where it does there.
-}
validVolley : SavedTheater -> SavedVolley -> Bool
validVolley s v =
    let
        position : Position -> Bool
        position p =
            finite p.x && finite p.y && finite p.altitude

        ship : String -> Maybe Ship
        ship id =
            List.filter (\u -> u.id == id) s.ships |> List.head
    in
    not
        (not (isSafeInteger v.id)
            || v.id
            < 1
            || M.notLess v.id s.weaponSequence
            || not (position v.from && position v.to && finite v.launched && finite v.arrives)
            || v.launched
            < 0
            || s.time
            < v.launched
            || v.arrives
            <= s.time
            || v.arrives
            <= v.launched
            || not (finite v.damage)
            || v.damage
            < 0
        )
        && (case ( ship v.source, ship v.target ) of
                ( Just source, Just target ) ->
                    source.side /= target.side

                _ ->
                    False
           )


distinct : List Float -> Bool
distinct ids =
    List.length ids == Set.size (Set.fromList ids)


savedVolley : D.Decoder SavedVolley
savedVolley =
    D.map8 SavedVolley
        (D.field "id" D.float)
        (D.field "underwater" D.bool)
        (D.field "from" position)
        (D.field "to" position)
        (D.field "source" D.string)
        (D.field "target" D.string)
        (D.field "launched" D.float)
        (D.field "arrives" D.float)
        |> D.andThen (\make -> D.map make (D.field "damage" D.float))


{-| The fleet action as a save holds it, with the clock, weapon sequence and
ships its checks read.
-}
savedTheater : D.Decoder SavedTheater
savedTheater =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.map7 SavedTheater
                    (D.succeed now)
                    (D.field "weaponSequence" D.float)
                    (D.field "ships" (D.list (Ship.decoder now)))
                    (D.at [ "battle", "round" ] D.float)
                    (D.at [ "battle", "next" ] D.float)
                    (D.at [ "battle", "areas" ] (D.list area))
                    (D.at [ "battle", "volleys" ] (D.list savedVolley))
            )
