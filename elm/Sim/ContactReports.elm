module Sim.ContactReports exposing (Reporting, Sighted, contact, recordLampContact, sighted)

{-| Contact reports: a ship sighted, heard or ranged, the fix each method
earns, and the fix a lamp signal spells out.
-}

import PatrolMission exposing (Mission(..))
import Sim.Contact exposing (Contact, Sighting(..))
import Sim.ContactReadings as Readings
import Sim.FleetTheater as FleetTheater exposing (Battle)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry)
import Sim.Ship exposing (Ship)
import Sim.SignalLamp exposing (LampFix)
import Sim.TrackEstimates as TrackEstimates
import Sim.Vessel exposing (Kind(..), Side(..))


{-| What an observation knows of the ship it came from. A sound source knows
only its position.
-}
type alias Sighted =
    { id : String, x : Float, y : Float, kind : Maybe Kind, depth : Maybe Float, name : Maybe String, military : Maybe Bool, side : Maybe Side }


sighted : Ship -> Sighted
sighted v =
    { id = v.id, x = v.x, y = v.y, kind = Just v.kind, depth = v.depth, name = Just v.name, military = v.military, side = v.side }


{-| The patrol fields a contact report reads and writes.
-}
type alias Reporting s p c =
    { s
        | x : Float
        , y : Float
        , time : Float
        , rng : Int
        , contacts : List Contact
        , nextId : Float
        , events : List LogEntry
        , patrol : { p | seed : Float }
        , mission : Mission
        , convoy : Maybe c
        , battle : Maybe Battle
    }


{-| The contact with this id, or a new one, and the patrol with it listed.
-}
listed : String -> (String -> Contact) -> Reporting s p c -> ( Contact, Reporting s p c )
listed id fresh s =
    case List.filter (\c -> c.id == id) s.contacts |> List.head of
        Just c ->
            ( c, s )

        Nothing ->
            let
                c : Contact
                c =
                    fresh (TrackEstimates.designation s.nextId)
            in
            ( c, { s | contacts = s.contacts ++ [ c ], nextId = s.nextId + 1 } )


{-| The patrol with a contact's new state in its place.
-}
store : Contact -> Reporting s p c -> Reporting s p c
store c s =
    { s
        | contacts =
            List.map
                (\old ->
                    if old.id == c.id then
                        c

                    else
                        old
                )
                s.contacts
    }


blank : String -> String -> Float -> Float -> Float -> Sighting -> Contact
blank id label bearing x y method =
    { id = id
    , label = label
    , x = x
    , y = y
    , range = 0
    , bearing = bearing
    , confidence = 0
    , age = 0
    , identified = Just False
    , name = Nothing
    , side = Nothing
    , probableSide = Nothing
    , kind = Nothing
    , military = Nothing
    , method = Just method
    , fix = Nothing
    , lastSweep = Nothing
    , sweepArea = Nothing
    , passiveAt = Nothing
    , passiveBearing = Nothing
    , passiveX = Nothing
    , passiveY = Nothing
    , depthEstimate = Nothing
    , courseEstimated = Nothing
    }


{-| A report of a ship by one method. Every report draws one number from the
patrol's random stream, so changing what a report shows keeps later seeded
events the same. Passive bearings carry a fixed bias; ranging methods refix
the contact when it has no fix, or its fix is five seconds old and either the
periscope still holds it or its uncertainty has grown past the new reading's.
-}
contact : Sighted -> Sighting -> Reporting s p c -> ( Contact, Reporting s p c )
contact ship method s0 =
    let
        b : Float
        b =
            Mechanics.bearing s0 ship

        ( c0, s1 ) =
            listed ship.id (\label -> blank ship.id label b 0 0 Passive) s0

        s2 : Reporting s p c
        s2 =
            if s1.nextId /= s0.nextId then
                Mechanics.log ("New contact. " ++ c0.label ++ ", bearing " ++ String.fromInt (round b) ++ ".") Mechanics.Contact s1

            else
                s1

        ( observationRoll, rng1 ) =
            Mechanics.rand s2.rng

        bias : Float
        bias =
            if method == Passive then
                3 * Readings.observationBias s2.patrol.seed c0.id Readings.Passive

            else
                0

        bearing : Float
        bearing =
            M.remainder (b + bias + 360) 360

        c1 : Contact
        c1 =
            if s2.convoy /= Nothing && method == Passive then
                { c0 | bearing = bearing, age = 0, method = Just method, passiveBearing = Just bearing, passiveAt = Just s2.time, passiveX = Just s2.x, passiveY = Just s2.y }

            else
                { c0 | bearing = bearing, age = 0, method = Just method }

        s3 : Reporting s p c
        s3 =
            { s2 | rng = rng1 }
    in
    if method /= Passive && method /= Lights then
        let
            d : Float
            d =
                Mechanics.distance s0 ship

            ( c2, s4 ) =
                ranged ship method b d observationRoll c1 s3

            c3 : Contact
            c3 =
                if method == Visual then
                    { c2
                        | identified = Just True
                        , name = ship.name
                        , kind = ship.kind
                        , military = ship.military
                        , side =
                            case ship.side of
                                Just side ->
                                    Just side

                                Nothing ->
                                    c2.side
                    }

                else
                    c2

            c4 : Contact
            c4 =
                case ( ( method, s4.mission, s4.battle ), ship.kind ) of
                    ( ( Active, Tiebreaker, Just battle ), Just kind ) ->
                        if c3.identified /= Just True && c3.probableSide == Nothing then
                            case FleetTheater.classifyEcho battle { kind = kind, side = ship.side } c3 observationRoll of
                                Just guess ->
                                    { c3 | probableSide = Just guess }

                                Nothing ->
                                    c3

                        else
                            c3

                    _ ->
                        c3
        in
        ( c4, store c4 s4 )

    else
        let
            c2 : Contact
            c2 =
                { c1 | confidence = M.max 0.24 c1.confidence }
        in
        ( c2, store c2 s3 )


{-| A ranging report's fix, when the contact needs one.
-}
ranged : Sighted -> Sighting -> Float -> Float -> Float -> Contact -> Reporting s p c -> ( Contact, Reporting s p c )
ranged ship method b d observationRoll c s =
    let
        sigma : Float
        sigma =
            if method == Visual then
                M.max 25 (d * 0.045)

            else
                M.max 15 (d * 0.03)

        refix : Bool
        refix =
            case c.fix of
                Nothing ->
                    True

                Just fix ->
                    M.notLess (s.time - fix.time) 5
                        && ((method == Visual && fix.source == Just "visual")
                                || (TrackEstimates.estimate c s.time |> Maybe.map (\e -> sigma * 2.448 < e.major) |> Maybe.withDefault False)
                           )
    in
    if not refix then
        ( c, s )

    else
        let
            range : Float
            range =
                d
                    * (if method == Visual then
                        1 + 0.06 * Readings.observationBias s.patrol.seed c.id Readings.Visual

                       else
                        0.97 + observationRoll * 0.06
                      )

            placed : Contact
            placed =
                { c
                    | range = range
                    , x = s.x + sin (Mechanics.rad b) * range
                    , y = s.y + cos (Mechanics.rad b) * range
                    , confidence =
                        if method == Visual then
                            0.9

                        else
                            0.75
                }

            measurement : TrackEstimates.Observation
            measurement =
                { x = placed.x, y = placed.y, time = s.time, vx = Nothing, vy = Nothing, positionSigma = Just sigma, velocitySigma = Just 1.5, maneuverSigma = Just 0.03, source = Just (sightingName method) }

            ( sounded, observation, s1 ) =
                if method == Active && ship.kind == Just Submarine then
                    let
                        ( roll, rng ) =
                            Mechanics.rand s.rng

                        depthEstimate : Maybe Float
                        depthEstimate =
                            Maybe.map (\depth -> M.clamp 0 320 (toFloat (round ((depth + (roll - 0.5) * (12 + d * 0.012)) / 10)) * 10)) ship.depth

                        withDepth : Contact
                        withDepth =
                            { placed | kind = Just Submarine, depthEstimate = depthEstimate }
                    in
                    case c.fix of
                        Just fix ->
                            let
                                dt : Float
                                dt =
                                    s.time - fix.time

                                dx : Float
                                dx =
                                    (placed.x - fix.x) / dt

                                dy : Float
                                dy =
                                    (placed.y - fix.y) / dt

                                scale : Float
                                scale =
                                    M.max 1 (M.hypot2 dx dy / 9)
                            in
                            ( { withDepth | courseEstimated = Just True }, { measurement | vx = Just (dx / scale), vy = Just (dy / scale) }, { s | rng = rng } )

                        Nothing ->
                            ( withDepth, measurement, { s | rng = rng } )

                else
                    ( placed, measurement, s )
        in
        ( Maybe.withDefault sounded (TrackEstimates.fixContact observation sounded), s1 )


sightingName : Sighting -> String
sightingName method =
    case method of
        Visual ->
            "visual"

        Passive ->
            "passive"

        Active ->
            "active"

        Lights ->
            "lights"

        Lamp ->
            "lamp"

        Satellite ->
            "satellite"


{-| A lamp signal's fix on the submarine that sent it: her position, course,
speed and depth, plainly hostile. A contact made for it stays listed even if
the fix is refused.
-}
recordLampContact : LampFix -> Reporting s p c -> Reporting s p c
recordLampContact fix s0 =
    let
        ( c0, s1 ) =
            listed fix.target (\label -> blank fix.target label 0 fix.x fix.y Lamp) s0

        speed : Float
        speed =
            fix.speed * 0.514444

        angle : Float
        angle =
            Mechanics.rad fix.course
    in
    case TrackEstimates.fixContact { time = fix.time, x = fix.x, y = fix.y, vx = Just (sin angle * speed), vy = Just (cos angle * speed), positionSigma = Just 10, velocitySigma = Just 0.4, maneuverSigma = Just 0.015, source = Just "lamp" } c0 of
        Just fixed ->
            store
                { fixed
                    | x = fix.x
                    , y = fix.y
                    , range = Mechanics.distance s1 fix
                    , bearing = Mechanics.bearing s1 fix
                    , age = s1.time - fix.time
                    , confidence = 0.92
                    , method = Just Lamp
                    , kind = Just Submarine
                    , probableSide = Just Hostile
                    , depthEstimate = Just fix.depth
                    , courseEstimated = Just True
                }
                s1

        Nothing ->
            s1
