module Sim.ConvoyWatch exposing (AlliedLamp, Convoy, Lamplight, Observation, Raiding, convoyIds, convoyLosses, resolveConvoyCharge, scopeClear, setupHenhouse, signalHail, updateConvoyRaid, updateLamp)

{-| The wolf in the henhouse: a convoy under attack by a hunting submarine.
The surviving merchants signal the boat an estimate of the hunter by lamp
when she surfaces near them; the hunter fires at the convoy on a seeded
schedule, and the escort answers with depth charges that may damage it.
-}

import Sim.Acoustics as Acoustics
import Sim.BoatSensors as BoatSensors
import Sim.Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.Environment exposing (Environment)
import Sim.Equipment as Equipment
import Sim.FleetVolleys exposing (Volley)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.MessWatch as MessWatch
import Sim.Ordnance exposing (Blast, BlastKind(..))
import Sim.PatrolContacts as PatrolContacts
import Sim.PatrolReports as PatrolReports exposing (Report)
import Sim.ReplayEvents as Replay
import Sim.Seafloor as Seafloor
import Sim.Ship as Ship exposing (Ship)
import Sim.SignalLamp as SignalLamp exposing (Estimate, LampFix, Transmission)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems
import Sim.Text as Text
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


type alias Convoy =
    { message : Maybe (Transmission Estimate), pin : Maybe Estimate, number : Float, round : Int, next : Float, shot : Maybe Volley }


type alias AlliedLamp =
    { message : Maybe (Transmission LampFix), sequence : Float, lastIssue : Float }


{-| What the boat is looking through, which lamp is in view, and how fast time
runs.
-}
type alias Observation =
    { observation : Maybe String, lampInView : Maybe String, timeRate : Maybe Float }


convoyIds : List String
convoyIds =
    [ "wren", "dahlia", "petrel", "escort" ]


isConvoy : Ship -> Bool
isConvoy v =
    List.member v.id convoyIds


convoyLosses : { s | ships : List Ship } -> Int
convoyLosses s =
    List.length (List.filter (\v -> isConvoy v && v.hull <= 0) s.ships)


{-| The convoy and its hunter, laid out from the patrol's seed ahead of the
boat, with the merchant Plover already sunk and her wreck marked.
-}
setupHenhouse : { s | x : Float, y : Float, depth : Float, targetDepth : Float, heading : Float, targetHeading : Float, time : Float, patrol : { p | seed : Float }, chart : Maybe Coastline, ships : List Ship, convoy : Maybe Convoy, events : List LogEntry } -> { s | x : Float, y : Float, depth : Float, targetDepth : Float, heading : Float, targetHeading : Float, time : Float, patrol : { p | seed : Float }, chart : Maybe Coastline, ships : List Ship, convoy : Maybe Convoy, events : List LogEntry }
setupHenhouse s =
    let
        h : Float -> Float
        h n =
            hash01 s.patrol.seed (11700 + n)

        base : { x : Float, y : Float }
        base =
            { x = s.x + 500 + h 1 * 300, y = s.y + 950 + h 2 * 400 }

        heading : Float
        heading =
            35 + h 3 * 55

        vessel : String -> String -> Kind -> Float -> Float -> Ship
        vessel id name kind x y =
            let
                v : Ship
                v =
                    Ship.fresh { id = id, name = name, kind = kind, x = base.x + x, y = base.y + y, heading = heading, speed = 4 }
            in
            { v
                | hull = 100
                , depth =
                    Just
                        (if kind == Submarine then
                            45 + h 4 * 30

                         else
                            0
                        )
                , side =
                    Just
                        (if id == "wolf" then
                            Hostile

                         else
                            Friendly
                        )
                , military = Just True
                , alert = 0
                , attack = 0
                , disabled = Just False
                , flood = Just 0
                , sinkDepth = Just 0
            }

        side : Float
        side =
            if h 5 < 0.5 then
                -1

            else
                1

        plover : Ship
        plover =
            vessel "plover" "Plover" (Surface Merchant) -480 -450

        wreck : Ship
        wreck =
            { plover
                | hull = 0
                , speed = 0
                , settled = Just True
                , sunkAt = Just 0
                , sinkDepth = Just (M.max 0 (negate (Seafloor.floorSurface s.chart plover.x plover.y).height - 8))
                , wreckMark = Just { x = plover.x, y = plover.y, observed = True }
            }

        wren : Ship
        wren =
            vessel "wren" "Wren" (Surface Merchant) 0 0

        towards : Float
        towards =
            M.remainder (Mechanics.bearing s wren + 356) 360
    in
    Mechanics.log "Plover already lost. Wreck marked. The surviving convoy can signal an estimate if they see you surface."
        Info
        { s
            | ships =
                [ wren
                , vessel "dahlia" "Dahlia" (Surface Merchant) -400 350
                , vessel "petrel" "Petrel" (Surface Merchant) 300 620
                , vessel "escort" "Ibis" (Surface Escort) (side * 1000) 580
                , vessel "wolf" "Wolf" Submarine (side * (1100 + h 6 * 500)) (840 + h 7 * 420)
                , wreck
                ]
            , convoy = Just { message = Nothing, pin = Nothing, number = 0, round = 0, next = 80 + h 8 * 30, shot = Nothing }
            , depth = 0
            , targetDepth = 0
            , heading = towards
            , targetHeading = towards
        }


{-| A ship's hail: hold her lamp in view within its range, in kilometers to
one decimal.
-}
signalHail : { a | name : String } -> Float -> String
signalHail ship range =
    ship.name ++ " hails us. Hold her lamp in your scope or tower binoculars within " ++ Text.toFixed 1 (toFloat (floor (range / 100)) * 0.1) ++ " km."


{-| The periscope is up, working and not washed over.
-}
scopeClear : { s | scope : Bool, scopeTravel : Maybe Float, x : Float, y : Float, heading : Float, depth : Float, pitch : Float, time : Float, systems : { y | periscope : Float } } -> Environment -> Bool
scopeClear s env =
    s.scope && 0 < Equipment.operatingFraction s.systems.periscope && not (BoatSensors.scopeWashed s env)


{-| The patrol fields the convoy's lamp reads and writes.
-}
type alias Lamplight s p y =
    { s
        | x : Float
        , y : Float
        , depth : Float
        , heading : Float
        , pitch : Float
        , time : Float
        , scope : Bool
        , scopeTravel : Maybe Float
        , systems : { y | periscope : Float }
        , patrol : { p | seed : Float }
        , ships : List Ship
        , convoy : Maybe Convoy
        , reports : List Report
        , events : List LogEntry
    }


find : String -> List Ship -> Maybe Ship
find id ships =
    List.filter (\v -> v.id == id) ships |> List.head


{-| The convoy's lamp: the nearest surviving merchant hails a surfaced boat
and signals the hunter's estimate, repeating a fresh one a minute after a
copied report has stood for 90 seconds; a message copied in full plots the
estimate as a telegram.
-}
updateLamp : Environment -> Observation -> Float -> Lamplight s p y -> Lamplight s p y
updateLamp env input dt s0 =
    case ( s0.convoy, find "wolf" s0.ships ) of
        ( Just c0, Just wolf ) ->
            if wolf.hull <= 0 then
                s0

            else
                let
                    range : Float
                    range =
                        SignalLamp.lampRange env

                    held : Maybe ( Transmission Estimate, Ship )
                    held =
                        c0.message |> Maybe.andThen (\m -> find m.estimate.sender s0.ships |> Maybe.map (Tuple.pair m))

                    standing : Maybe ( Transmission Estimate, Ship )
                    standing =
                        case held of
                            Just ( _, ship ) ->
                                if ship.hull <= 0 then
                                    Nothing

                                else
                                    held

                            Nothing ->
                                Nothing

                    c1 : Convoy
                    c1 =
                        if standing == Nothing then
                            { c0 | message = Nothing }

                        else
                            c0

                    ( hailed, c2, s1 ) =
                        case standing of
                            Nothing ->
                                if s0.depth <= 1 then
                                    case List.filter (\v -> isConvoy v && 0 < v.hull && Mechanics.distance s0 v <= M.max 3400 (range * 1.35)) s0.ships |> List.sortBy (Mechanics.distance s0) |> List.head of
                                        Just ship ->
                                            let
                                                m : Transmission Estimate
                                                m =
                                                    SignalLamp.makeTransmission ship wolf s0.patrol.seed (c1.number + 1) s0.time
                                            in
                                            ( Just ( m, ship ), { c1 | number = c1.number + 1, message = Just m }, PatrolReports.report "convoy-hail" (signalHail ship range) s0 )

                                        Nothing ->
                                            ( Nothing, c1, s0 )

                                else
                                    ( Nothing, c1, s0 )

                            Just _ ->
                                ( standing, c1, s0 )
                in
                case hailed of
                    Nothing ->
                        { s1 | convoy = Just c2 }

                    Just ( m0, sender ) ->
                        let
                            ( m1, c3, s2 ) =
                                if m0.delivered && M.notLess m0.elapsed 90 && M.notLess (m0.elapsed - Maybe.withDefault 0 m0.completedAt) 60 then
                                    let
                                        fresh : Transmission Estimate
                                        fresh =
                                            SignalLamp.makeTransmission sender wolf s1.patrol.seed (c2.number + 1) s1.time
                                    in
                                    ( fresh, { c2 | number = c2.number + 1 }, PatrolReports.report "convoy-update" (sender.name ++ " is repeating a new lamp report.") s1 )

                                else
                                    ( m0, c2, s1 )

                            optical : Bool
                            optical =
                                case input.observation of
                                    Just "scope" ->
                                        s2.depth <= 15 && scopeClear s2 env

                                    Just "tower" ->
                                        s2.depth <= 1

                                    _ ->
                                        False

                            seen : Bool
                            seen =
                                optical && input.lampInView == Just sender.id && Mechanics.distance s2 sender <= range

                            rate : Float
                            rate =
                                case input.timeRate of
                                    Just r ->
                                        if M.truthy r then
                                            r

                                        else
                                            1

                                    Nothing ->
                                        1

                            ( copied, m2 ) =
                                SignalLamp.copyLamp (dt / M.max 1 rate) seen m1
                        in
                        if copied then
                            { s2 | convoy = Just { c3 | message = Just m2, pin = Just m2.estimate } }
                                |> PatrolReports.report ("telegram-" ++ String.fromFloat c3.number) ("TELEGRAM " ++ String.fromFloat c3.number ++ " · " ++ String.toUpper sender.name ++ " · " ++ m2.estimate.text ++ " FROM US · estimate plotted.")

                        else
                            { s2 | convoy = Just { c3 | message = Just m2 } }

        _ ->
            s0


{-| The patrol fields the hunter's raid reads and writes.
-}
type alias Raiding s p =
    Systems.Sounding
        { s
            | x : Float
            , y : Float
            , crewQuietUntil : Float
            , patrol : { p | seed : Float }
            , ships : List Ship
            , convoy : Maybe Convoy
            , impacts : List Systems.Impact
            , weaponSequence : Int
            , debrief : List Debrief.Entry
            , replay : List Replay.Marked
            , blasts : List Blast
        }


{-| The hunter's raid: while the boat is still approaching, its schedule waits.
A torpedo in the water strikes when it arrives; otherwise on schedule the
hunter fires at a surviving convoy ship (hitting three times in four) and
the escort, if she can, drops a charge on it.
-}
updateConvoyRaid : Float -> Bool -> Raiding s p -> Raiding s p
updateConvoyRaid dt approaching s0 =
    case ( s0.convoy, find "wolf" s0.ships ) of
        ( Just c0, Just wolf ) ->
            if approaching then
                { s0 | convoy = Just { c0 | next = c0.next + dt } }

            else
                let
                    ( c1, s1 ) =
                        case c0.shot of
                            Just shot0 ->
                                strike shot0 c0 s0

                            Nothing ->
                                ( c0, s0 )
                in
                if s1.time < c1.next || wolf.hull <= 0 || c1.shot /= Nothing then
                    { s1 | convoy = Just c1 }

                else
                    fire wolf c1 s1

        _ ->
            s0


{-| The torpedo in the water: it follows a ship it will hit, and on arrival
damages her or splashes.
-}
strike : Volley -> Convoy -> Raiding s p -> ( Convoy, Raiding s p )
strike shot0 c s =
    case find shot0.target s.ships of
        Just target ->
            let
                shot : Volley
                shot =
                    if M.truthy shot0.damage && 0 < target.hull then
                        { shot0 | to = { x = target.x, y = target.y, altitude = -2 } }

                    else
                        shot0
            in
            if M.notLess s.time shot.arrives then
                let
                    hit : Bool
                    hit =
                        0 < shot.damage && 0 < target.hull

                    p : { x : Float, y : Float, altitude : Float }
                    p =
                        shot.to

                    struck : Raiding s p
                    struck =
                        { s
                            | ships =
                                List.map
                                    (\v ->
                                        if hit && v.id == target.id then
                                            { v | hull = M.max 0 (v.hull - shot.damage) }

                                        else
                                            v
                                    )
                                    s.ships
                            , impacts =
                                s.impacts
                                    ++ [ { id = s.weaponSequence
                                         , x = p.x
                                         , y = p.y
                                         , altitude = p.altitude
                                         , kind =
                                            if hit then
                                                "torpedo"

                                            else
                                                "splash"
                                         , time = s.time
                                         }
                                       ]
                            , weaponSequence = s.weaponSequence + 1
                        }
                            |> Systems.emit { kind = Acoustics.Detonation, x = p.x, y = p.y, depth = Just 2, altitude = Nothing, power = 0.85 }
                in
                ( { c | shot = Nothing }
                , if hit then
                    Systems.addDebrief ("The hunter struck " ++ target.name ++ ".") struck
                        |> Replay.mark { kind = Replay.Torpedo, point = { x = p.x, y = p.y, depth = 2 }, heading = Nothing, target = Just target.id, shot = Just (toFloat shot.id), enemy = Just True }

                  else
                    struck
                )

            else
                ( { c | shot = Just shot }, s )

        Nothing ->
            ( c, s )


{-| The hunter's next torpedo, on the round's seeded rolls, and the escort's
answer.
-}
fire : Ship -> Convoy -> Raiding s p -> Raiding s p
fire wolf c s =
    let
        round : Int
        round =
            c.round

        roll : Float -> Float
        roll n =
            hash01 s.patrol.seed (13000 + toFloat round * 12 + n)

        scheduled : Convoy
        scheduled =
            { c | round = round + 1, next = s.time + 42 + roll 0 * 28 }

        ships : List Ship
        ships =
            List.filter (\v -> isConvoy v && 0 < v.hull) s.ships
    in
    case List.drop (floor (roll 1 * toFloat (List.length ships))) ships |> List.head of
        Nothing ->
            { s | convoy = Just scheduled }

        Just chosen ->
            let
                hit : Bool
                hit =
                    roll 2 < 0.76

                wolfDepth : Float
                wolfDepth =
                    Maybe.withDefault 0 wolf.depth

                shot : Volley
                shot =
                    { id = s.weaponSequence
                    , underwater = True
                    , from = { x = wolf.x, y = wolf.y, altitude = negate wolfDepth }
                    , to =
                        { x =
                            chosen.x
                                + (if hit then
                                    0

                                   else
                                    120
                                  )
                        , y = chosen.y
                        , altitude = -2
                        }
                    , source = wolf.id
                    , target = chosen.id
                    , launched = s.time
                    , arrives = s.time + 12 + roll 4 * 14
                    , damage =
                        if hit then
                            45 + toFloat (floor (roll 3 * 21))

                        else
                            0
                    , warning = Nothing
                    }

                launched : Raiding s p
                launched =
                    { s | convoy = Just { scheduled | shot = Just shot }, weaponSequence = s.weaponSequence + 1 }
                        |> MessWatch.recordLocalLaunch wolf
                        |> Systems.launchNoise wolf wolf.depth False
                        |> Systems.emit { kind = Acoustics.Seeker, x = wolf.x, y = wolf.y, depth = Just wolfDepth, altitude = Nothing, power = 0.45 }
            in
            case List.filter (\v -> v.kind == Surface Escort && v.disabled /= Just True) ships |> List.head of
                Just escort ->
                    let
                        a : Float
                        a =
                            Mechanics.rad escort.heading

                        ( charge, dropped ) =
                            PatrolContacts.dropDepthCharge { x = escort.x + sin a * -30, y = escort.y - cos a * 30, depth = 40 + roll 5 * 30, delay = 6, kind = Charge } launched
                    in
                    { dropped
                        | blasts =
                            List.map
                                (\b ->
                                    if b.id == charge.id then
                                        { b | convoyCharge = Just True }

                                    else
                                        b
                                )
                                dropped.blasts
                    }

                Nothing ->
                    launched


{-| An escort's charge exploding within 650 m of the hunter damages it about
a third of the time.
-}
resolveConvoyCharge : { c | x : Float, y : Float, id : Int } -> { s | patrol : { p | seed : Float }, ships : List Ship, time : Float, debrief : List Debrief.Entry } -> { s | patrol : { p | seed : Float }, ships : List Ship, time : Float, debrief : List Debrief.Entry }
resolveConvoyCharge charge s =
    case find "wolf" s.ships of
        Just wolf ->
            if 0 < wolf.hull && Mechanics.distance wolf charge < 650 && hash01 s.patrol.seed (toFloat charge.id + 14600) < 0.32 then
                Systems.addDebrief "An escort depth charge damaged the hunter."
                    { s
                        | ships =
                            List.map
                                (\v ->
                                    if v.id == "wolf" then
                                        { v | hull = M.max 0 (v.hull - 14 - 12 * hash01 (toFloat charge.id) 2) }

                                    else
                                        v
                                )
                                s.ships
                    }

            else
                s

        Nothing ->
            s
