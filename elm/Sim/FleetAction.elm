module Sim.FleetAction exposing (OnEvent, Theater, advanceFleetAction)

{-| The fleet action: two small task groups, friendly and hostile, trading
seeded volleys while the player watches. Each round a unit from each side may
fire, perhaps yielding its turn to a healthier ship; neither side reads the
player's helm. The handler the TypeScript calls for each shot fired and each
arrival is a function here, threaded through the state in the same order,
because the mission's handler takes impact ids from the same sequence new
shots draw from. The stage is `Sim.FleetTheater`, the shots
`Sim.FleetVolleys`, and save validation `Sim.FleetActionSaves`.
-}

import Sim.FleetTheater exposing (Area, Battle)
import Sim.FleetVolleys exposing (Position, Volley)
import Sim.Math as M
import Sim.Ship exposing (Ship)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Vessel exposing (Kind(..), Side(..))


type alias Theater t p =
    { t | time : Float, weaponSequence : Int, ships : List Ship, battle : Battle, patrol : { p | seed : Float } }


{-| What the mission does for a shot fired (`True`) or an arrival (`False`),
given the ship that fired or was struck.
-}
type alias OnEvent t p =
    Ship -> Volley -> Bool -> Theater t p -> Theater t p


nan : Float
nan =
    0 / 0


{-| Where a shot meets its target: underwater at its depth (at least 2 m), or
just above the surface.
-}
aimPoint : Bool -> Ship -> Position
aimPoint underwater target =
    { x = target.x
    , y = target.y
    , altitude =
        if underwater then
            negate (M.max 2 (Maybe.withDefault nan target.depth))

        else
            2
    }


updateShip : String -> (Ship -> Ship) -> List Ship -> List Ship
updateShip id change ships =
    case ships of
        [] ->
            []

        v :: rest ->
            if v.id == id then
                change v :: rest

            else
                v :: updateShip id change rest


findShip : String -> List Ship -> Maybe Ship
findShip id ships =
    List.filter (\v -> v.id == id) ships |> List.head


setBattle : Battle -> Theater t p -> Theater t p
setBattle b s =
    { s | battle = b }


{-| Volleys arrive and strike, then, when the round comes due, each side
may fire once.
-}
advanceFleetAction : OnEvent t p -> Theater t p -> Theater t p
advanceFleetAction onEvent start =
    let
        arrived : Theater t p
        arrived =
            arrivals onEvent start
    in
    if arrived.time < arrived.battle.next then
        arrived

    else
        fireRound onEvent arrived


arrivals : OnEvent t p -> Theater t p -> Theater t p
arrivals onEvent start =
    let
        step : Volley -> ( List Volley, Theater t p ) -> ( List Volley, Theater t p )
        step volley ( kept, s ) =
            case findShip volley.target s.ships of
                Nothing ->
                    ( volley :: kept, s )

                Just target ->
                    let
                        damage : Float
                        damage =
                            if target.hull <= 0 then
                                0

                            else
                                volley.damage

                        aimed : Volley
                        aimed =
                            if M.truthy damage then
                                { volley | damage = damage, to = aimPoint volley.underwater target }

                            else
                                { volley | damage = damage }
                    in
                    if s.time < aimed.arrives then
                        ( aimed :: kept, s )

                    else
                        let
                            struck : Ship
                            struck =
                                { target | hull = M.max 0 (target.hull - aimed.damage) }
                        in
                        ( kept, onEvent struck aimed False { s | ships = updateShip struck.id (\_ -> struck) s.ships } )

        ( remaining, after ) =
            List.foldl step ( [], start ) start.battle.volleys

        b : Battle
        b =
            after.battle
    in
    setBattle { b | volleys = List.reverse remaining } after


fireRound : OnEvent t p -> Theater t p -> Theater t p
fireRound onEvent s =
    let
        b : Battle
        b =
            s.battle

        round : Int
        round =
            b.round

        roll : Int -> Float
        roll n =
            hash01 s.patrol.seed (toFloat (3000 + round * 64 + n))

        begun : Theater t p
        begun =
            setBattle { b | round = round + 1, next = s.time + 9 + roll 0 * 9 } s
    in
    List.foldl (sideFires onEvent round roll) begun [ ( 0, Friendly ), ( 1, Hostile ) ]


sideFires : OnEvent t p -> Int -> (Int -> Float) -> ( Int, Side ) -> Theater t p -> Theater t p
sideFires onEvent round roll ( index, side ) s =
    let
        team : List Ship
        team =
            List.filter (\v -> v.incidental /= Just True && v.side == Just side && v.hull > 0 && v.disabled /= Just True) s.ships

        others : List Ship
        others =
            List.filter (\v -> v.incidental /= Just True && v.side /= Just side && v.hull > 0) s.ships
    in
    case ( team, others ) of
        ( first :: _, _ :: _ ) ->
            let
                teamSize : Int
                teamSize =
                    List.length team

                otherSize : Int
                otherSize =
                    List.length others

                n : Int
                n =
                    index * 16
            in
            if teamSize < otherSize && 0.45 + 0.55 * toFloat teamSize / toFloat otherSize < roll (n + 10) then
                s

            else
                case nth (floor (roll (n + 3) * toFloat otherSize)) others of
                    Nothing ->
                        s

                    Just target ->
                        let
                            chosen : Ship
                            chosen =
                                nth (modBy teamSize (round + floor (roll (n + 1) * toFloat teamSize))) team |> Maybe.withDefault first

                            unit : Ship
                            unit =
                                if chosen.hull < 40 && teamSize > 1 && roll (n + 2) < 0.7 then
                                    List.foldl
                                        (\v best ->
                                            if best.hull < v.hull then
                                                v

                                            else
                                                best
                                        )
                                        first
                                        team

                                else
                                    chosen
                        in
                        fire onEvent roll n unit target s

        _ ->
            s


nth : Int -> List a -> Maybe a
nth i list =
    List.drop i list |> List.head


fire : OnEvent t p -> (Int -> Float) -> Int -> Ship -> Ship -> Theater t p -> Theater t p
fire onEvent roll n unit target s =
    let
        sub : Bool
        sub =
            unit.kind == Submarine

        hit : Bool
        hit =
            roll (n + 4)
                < (if sub then
                    0.78

                   else
                    0.58
                  )

        damage : Float
        damage =
            if hit then
                toFloat
                    (round
                        ((if sub then
                            28

                          else
                            17
                         )
                            + roll (n + 5)
                            * 16
                        )
                    )

            else
                0

        underwater : Bool
        underwater =
            sub || target.kind == Submarine

        aimed : Position
        aimed =
            aimPoint underwater target

        point : Position
        point =
            if hit then
                aimed

            else
                { aimed
                    | x =
                        aimed.x
                            + 90
                            * (if roll (n + 6) < 0.5 then
                                -1

                               else
                                1
                              )
                    , y = aimed.y + 120 * (roll (n + 7) - 0.5)
                }

        duration : Float
        duration =
            if underwater then
                M.min 48 (M.max 5 (M.hypot2 (point.x - unit.x) (point.y - unit.y) / 30))

            else
                2.5 + roll (n + 8) * 2

        shot : Volley
        shot =
            { id = s.weaponSequence
            , underwater = underwater
            , from =
                { x = unit.x
                , y = unit.y
                , altitude =
                    if underwater then
                        negate (M.max 2 (Maybe.withDefault nan unit.depth))

                    else
                        3
                }
            , to = point
            , source = unit.id
            , target = target.id
            , launched = s.time
            , arrives = s.time + duration
            , damage = damage
            , warning = Nothing
            }

        b : Battle
        b =
            s.battle

        fired : Theater t p
        fired =
            onEvent unit shot True { s | weaponSequence = s.weaponSequence + 1, battle = { b | volleys = b.volleys ++ [ shot ] } }

        area : Area
        area =
            nth
                (if sub then
                    1

                 else
                    0
                )
                fired.battle.areas
                |> Maybe.withDefault { x = nan, y = nan, label = "", radius = nan }

        turn : Ship -> Ship
        turn v =
            { v
                | heading =
                    if 1800 < M.hypot2 (v.x - area.x) (v.y - area.y) then
                        M.remainder (atan2 (area.x - v.x) (area.y - v.y) * 180 / pi + 360) 360

                    else
                        M.remainder (v.heading + (roll (n + 9) - 0.5) * 32 + 360) 360
            }
    in
    { fired | ships = updateShip unit.id turn fired.ships }
