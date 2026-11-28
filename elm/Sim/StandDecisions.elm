module Sim.StandDecisions exposing (decide)

{-| Each military ship's turn in the cold watch: whom it faces, and its next
step in its stand: retreat, fight, stop, close in or warn, with the volleys
a fight or a warning puts in the water.
-}

import PatrolMission
import Sim.FleetVolleys exposing (Volley)
import Sim.Math as M
import Sim.Ship exposing (Order(..), Parley, Ship)
import Sim.Stands exposing (Action(..), Signal, Target, Watching, attackingPlayer, bearingTo, clamp01, disabled, military, nth, range, scripted, setShip, sideOf, stand, strength)
import Sim.SurfaceMotion exposing (hash01)
import Sim.TrafficEncounters as Encounters exposing (Traffic)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


{-| A volley at the target: a warning lands short (a torpedo stops at 45% of
the way, a shell falls 100 m off); otherwise a third miss and the rest hit
for 18 to 36.
-}
volley : Ship -> Target -> Bool -> Float -> Watching s p -> ( Volley, Watching s p )
volley v target warning roll s =
    let
        underwater : Bool
        underwater =
            v.kind == Submarine

        aimed : { x : Float, y : Float, altitude : Float }
        aimed =
            { x = target.x
            , y = target.y
            , altitude =
                if underwater then
                    negate (M.max 2 (Maybe.withDefault 0 target.depth))

                else
                    0
            }

        shot : Volley
        shot =
            { id = s.weaponSequence
            , source = v.id
            , target = target.id
            , underwater = underwater
            , warning = Just warning
            , from =
                { x = v.x
                , y = v.y
                , altitude =
                    if underwater then
                        negate (Maybe.withDefault 20 v.depth)

                    else
                        4
                }
            , to =
                if not warning then
                    aimed

                else if underwater then
                    { aimed | x = v.x + (aimed.x - v.x) * 0.45, y = v.y + (aimed.y - v.y) * 0.45 }

                else
                    { aimed | x = aimed.x + 100, y = aimed.y - 100 }
            , launched = s.time
            , arrives =
                s.time
                    + (if underwater then
                        9

                       else
                        3
                      )
            , damage =
                if warning || roll < 0.34 then
                    0

                else
                    toFloat (18 + round (18 * roll))
            }

        t : Traffic
        t =
            s.traffic
    in
    ( shot, { s | weaponSequence = s.weaponSequence + 1, traffic = { t | volleys = t.volleys ++ [ shot ] } } )


{-| Whom the ship faces: the nearest opposing military ship within 2.6 km,
weighted toward the player's attackers when friendly and toward weaker
ships; or the player, when hostile, observed nearer than that, or recently
heard. Passing traffic in a scripted battle faces only other traffic.
-}
decide : Bool -> Signal s p -> Int -> Int -> Ship -> Maybe Parley -> Watching s p -> Watching s p
decide holiday signal turn i v prior s =
    let
        script : Bool
        script =
            scripted s v

        consider : ( Int, Ship ) -> ( Maybe ( Int, Ship ), Float ) -> ( Maybe ( Int, Ship ), Float )
        consider ( j, c ) ( other, nearest ) =
            if j == i || c.hull <= 0 || not (military c) || sideOf c == sideOf v || (script && c.incidental /= Just True) then
                ( other, nearest )

            else
                let
                    d : Float
                    d =
                        range v c

                    weight : Float
                    weight =
                        if sideOf v == Friendly && attackingPlayer s.time c then
                            0.45

                        else if strength c * 1.5 < strength v then
                            0.8

                        else
                            1
                in
                if d < 2600 && d * weight < nearest then
                    ( Just ( j, c ), d * weight )

                else
                    ( other, nearest )

        ( opponent, nearestWeighted ) =
            List.foldl consider ( Nothing, 2600 ) (List.indexedMap Tuple.pair s.ships)

        observed : Maybe { x : Float, y : Float }
        observed =
            v.report
                |> Maybe.andThen
                    (\r ->
                        if s.time - r.time <= 30 then
                            Just { x = r.x, y = r.y }

                        else
                            Nothing
                    )

        player : Bool
        player =
            sideOf v == Hostile && not script && (Maybe.map (\o -> range v o < nearestWeighted) observed |> Maybe.withDefault False)

        deliberate : Bool
        deliberate =
            case prior of
                Just p ->
                    p.against == "player" && (Maybe.map (\o -> 0 < p.level && s.time - o.time < 75) p.origin |> Maybe.withDefault False)

                Nothing ->
                    False

        target : Maybe Target
        target =
            if player || deliberate then
                case observed of
                    Just o ->
                        Just { x = o.x, y = o.y, id = "player", depth = Just 0 }

                    Nothing ->
                        prior |> Maybe.andThen .origin |> Maybe.map (\o -> { x = o.x, y = o.y, id = "player", depth = Just 0 })

            else
                Maybe.map (\( _, c ) -> { x = c.x, y = c.y, id = c.id, depth = c.depth }) opponent
    in
    case ( target, prior ) of
        ( Just t, _ ) ->
            engage holiday signal turn i v opponent t s

        ( Nothing, Just p ) ->
            setShip i
                { v
                    | speed =
                        if disabled v then
                            v.speed

                        else
                            p.cruise
                    , parley = Nothing
                }
                s

        ( Nothing, Nothing ) ->
            s


{-| The ship's next step in its stand: retreat if leaving, hurt or unwilling;
fight if already fighting, at the top of the ladder, helping the player or
spoiling for it; stop after an approach; otherwise, with initiative, close in
or warn, and the other side stiffens in reply.
-}
engage : Bool -> Signal s p -> Int -> Int -> Ship -> Maybe ( Int, Ship ) -> Target -> Watching s p -> Watching s p
engage holiday signal turn i v opponent target s =
    let
        d : Float
        d =
            range v target

        p0 : Parley
        p0 =
            stand s.time target.id d v

        key : Int
        key =
            Encounters.identity v.id + turn * 9

        roll : Int -> Float
        roll n =
            hash01 s.patrol.seed (toFloat (key + n))

        aggression : Float
        aggression =
            Encounters.temperament s.patrol.seed v.id

        damage : Float
        damage =
            clamp01
                ((100 - v.hull)
                    / 100
                    + Maybe.withDefault 0 v.flood
                    * 0.035
                    + (if disabled v then
                        0.48

                       else
                        0
                      )
                )

        leaving : Bool
        leaving =
            0 < p0.level && p0.range + 75 < d

        p : Parley
        p =
            { p0 | next = s.time + 12 + roll 1 * 12 }

        holding : Parley -> Ship -> Ship
        holding stance ship =
            { ship | parley = Just stance }
    in
    if leaving || (0.28 < damage && roll 2 < damage * (1.25 - 0.75 * aggression)) || (0 < p.level && p.order /= Fight && roll 3 < (1 - aggression) * 0.44) then
        let
            placed : Watching s p
            placed =
                setShip i (holding p v) s

            signaled : Watching s p
            signaled =
                if p.order /= Retreat then
                    signal Withdraw (holding p v) Nothing placed

                else
                    placed
        in
        setShip i
            { v
                | heading = M.remainder (bearingTo v target + 180) 360
                , speed =
                    if disabled v then
                        0

                    else
                        M.max 4 p.cruise * (1 - 0.5 * damage)
                , parley = Just { p | order = Retreat, level = 0, next = p.next + 65, range = d }
            }
            signaled

    else
        let
            initiative : Float
            initiative =
                if holiday then
                    PatrolMission.encounterOdds.holidayInitiative

                else
                    1

            help : Bool
            help =
                sideOf v == Friendly && (Maybe.map (\( _, c ) -> c.id == target.id && attackingPlayer s.time c) opponent |> Maybe.withDefault False)
        in
        if p.order == Fight || M.notLess p.level 4 || (help && roll 3 < 0.3 + 0.65 * aggression) || (0.91 < aggression && roll 4 < initiative * 0.65) then
            let
                fighting : Parley
                fighting =
                    { p | order = Fight, level = 4 }

                placed : Watching s p
                placed =
                    setShip i (holding fighting v) s

                fired : Watching s p
                fired =
                    if target.id /= "player" && not (disabled v) && v.kind /= Surface Merchant then
                        let
                            ( shot, launched ) =
                                volley (holding fighting v) target False (roll 5) placed
                        in
                        signal Attack (holding fighting v) (Just shot) launched

                    else
                        placed
            in
            setShip i (holding { fighting | range = d } v) fired

        else if p.order == Approach then
            setShip i (holding { p | order = Stop, range = d } { v | speed = 0 }) s

        else if roll 4 < initiative * (0.12 + 0.74 * aggression) then
            escalate signal i v opponent target d (roll 6) { p | level = M.min 4 (p.level + 1) } s

        else if p.order == Stop || p.order == Retreat then
            setShip i (holding { p | order = Watch, range = d } { v | speed = p.cruise }) s

        else
            setShip i (holding { p | range = d } v) s


escalate : Signal s p -> Int -> Ship -> Maybe ( Int, Ship ) -> Target -> Float -> Float -> Parley -> Watching s p -> Watching s p
escalate signal i v opponent target d choice p s =
    let
        action : Int
        action =
            floor (choice * 3)

        ( acted, afterAction ) =
            if M.isZero (toFloat action) || v.kind == Surface Merchant then
                let
                    closing : Ship
                    closing =
                        { v
                            | heading = bearingTo v target
                            , speed =
                                if disabled v then
                                    0

                                else
                                    p.cruise + 2
                            , parley = Just { p | order = Approach }
                        }
                in
                ( closing, setShip i closing s )

            else
                let
                    warning : Ship
                    warning =
                        { v | parley = Just { p | order = Warn } }

                    placed : Watching s p
                    placed =
                        setShip i warning s
                in
                if v.kind == Submarine && action == 1 then
                    ( warning, signal Ping warning Nothing placed )

                else
                    let
                        ( shot, launched ) =
                            volley warning target True 0 placed
                    in
                    ( warning
                    , signal
                        (if v.kind == Submarine then
                            ShortRun

                         else
                            Shell
                        )
                        warning
                        (Just shot)
                        launched
                    )

        replied : Watching s p
        replied =
            case opponent of
                Just ( j, o ) ->
                    let
                        current : Ship
                        current =
                            nth j afterAction.ships |> Maybe.withDefault o

                        settled : Bool
                        settled =
                            Maybe.map (\op -> op.order == Fight || op.order == Retreat) current.parley |> Maybe.withDefault False
                    in
                    if target.id == current.id && not settled then
                        let
                            reply : Parley
                            reply =
                                stand afterAction.time v.id d current
                        in
                        setShip j { current | parley = Just { reply | level = M.min 4 (reply.level + 1) } } afterAction

                    else
                        afterAction

                Nothing ->
                    afterAction
    in
    setShip i { acted | parley = Maybe.map (\stance -> { stance | range = d }) acted.parley } replied
