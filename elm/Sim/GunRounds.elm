module Sim.GunRounds exposing (updateRounds)

{-| Gun rounds in flight. The boat's deck gun can strike a ship afloat (a
submarine only near the surface) or an aircraft; an aircraft's fire can
strike the boat on the surface. A strike tells the ship where the boat is,
and below a ship's waterline it lets water in; a round that falls short
splashes, and a splash near a surface ship draws her attention.
-}

import Sim.AirSupport as AirSupport exposing (Aircraft)
import Sim.Carrier as Carrier
import Sim.ColdWatch as ColdWatch
import Sim.CombatGeometry as Geometry
import Sim.Equipment exposing (System(..))
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.Ordnance exposing (Aloft, GunOwner(..), Round)
import Sim.PatrolReports as PatrolReports
import Sim.Ship exposing (Ship)
import Sim.Systems as Systems
import Sim.TorpedoStrike exposing (Firing)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


{-| What a round struck first along this moment's flight.
-}
type Target
    = AShip Int Ship
    | AnAircraft Int Aircraft
    | TheBoat


orZero : Maybe Float -> Float
orZero value =
    case value of
        Just v ->
            if M.truthy v then
                v

            else
                0

        Nothing ->
            0


updateRounds : Float -> Firing s p n -> Firing s p n
updateRounds dt start =
    let
        step : Round -> ( List Round, Firing s p n ) -> ( List Round, Firing s p n )
        step r ( done, s ) =
            let
                ( flown, after ) =
                    fly dt r s
            in
            ( flown :: done, after )

        ( rounds, ended ) =
            List.foldl step ( [], start ) start.gunRounds

        recent : List Systems.Impact
        recent =
            List.filter (\p -> ended.time - p.time < 3) ended.impacts
    in
    { ended
        | gunRounds = List.filter (\r -> r.age < 6) rounds |> List.reverse
        , impacts = List.drop (List.length recent - 64) recent
    }


nearest : Aloft -> Round -> Firing s p n -> Maybe ( Target, Float )
nearest from r s =
    let
        to : Aloft
        to =
            { x = r.x, y = r.y, altitude = r.altitude }

        closer : Target -> Maybe Float -> Maybe ( Target, Float ) -> Maybe ( Target, Float )
        closer target hit found =
            case hit of
                Just t ->
                    if t < (Maybe.map Tuple.second found |> Maybe.withDefault (1 / 0)) then
                        Just ( target, t )

                    else
                        found

                Nothing ->
                    found

        ship : ( Int, Ship ) -> Maybe ( Target, Float ) -> Maybe ( Target, Float )
        ship ( i, v ) found =
            if v.hull <= 0 || (v.kind == Submarine && 8 < orZero v.depth) then
                found

            else
                closer (AShip i v) (Geometry.shipHit from to { x = v.x, y = v.y, heading = v.heading, sinkDepth = orZero v.sinkDepth, depth = v.depth } (Just v.kind)) found

        plane : ( Int, Aircraft ) -> Maybe ( Target, Float ) -> Maybe ( Target, Float )
        plane ( i, p ) found =
            if p.hull <= 0 then
                found

            else
                closer (AnAircraft i p) (Geometry.sphereHit from to { x = p.x, y = p.y, altitude = p.altitude } 10) found
    in
    case r.owner of
        PlayerGun ->
            List.foldl ship Nothing (List.indexedMap Tuple.pair s.ships)
                |> (\found -> List.foldl plane found (List.indexedMap Tuple.pair s.aircraft))

        AircraftGun ->
            if s.depth <= 2 then
                Geometry.sphereHit from to { x = s.x, y = s.y, altitude = 2 } 8 |> Maybe.map (Tuple.pair TheBoat)

            else
                Nothing


fly : Float -> Round -> Firing s p n -> ( Round, Firing s p n )
fly dt r0 s =
    let
        from : Aloft
        from =
            { x = r0.x, y = r0.y, altitude = r0.altitude }

        r : Round
        r =
            { r0 | age = r0.age + dt, previous = Just from, x = r0.x + r0.vx * dt, y = r0.y + r0.vy * dt, altitude = r0.altitude + r0.vz * dt }

        impact : Aloft -> String -> Firing s p n -> Firing s p n
        impact point kind state =
            { state | impacts = state.impacts ++ [ { id = r.id, x = point.x, y = point.y, altitude = point.altitude, time = state.time, kind = kind } ] }
    in
    case nearest from r s of
        Just ( target, t ) ->
            let
                point : Aloft
                point =
                    { x = from.x + (r.x - from.x) * t, y = from.y + (r.y - from.y) * t, altitude = from.altitude + (r.altitude - from.altitude) * t }
            in
            ( { r | age = 99 }, struck target point (impact point "hit" s) )

        Nothing ->
            if r.altitude < 0 then
                let
                    f : Float
                    f =
                        M.clamp 0 1 (from.altitude / (from.altitude - r.altitude))

                    point : Aloft
                    point =
                        { x = from.x + (r.x - from.x) * f, y = from.y + (r.y - from.y) * f, altitude = 0 }

                    splashed : Firing s p n
                    splashed =
                        impact point "splash" s
                in
                ( { r | age = 99 }
                , if r.owner == PlayerGun then
                    { splashed
                        | ships =
                            List.map
                                (\v ->
                                    if v.kind /= Submarine && Mechanics.distance v point < 150 then
                                        ColdWatch.playerSignal False (Just { x = splashed.x, y = splashed.y }) splashed v

                                    else
                                        v
                                )
                                splashed.ships
                    }

                  else
                    splashed
                )

            else
                ( r, s )


setShip : Int -> Ship -> Firing s p n -> Firing s p n
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


struck : Target -> Aloft -> Firing s p n -> Firing s p n
struck target point s =
    let
        scale : Float
        scale =
            2 ^ (Maybe.andThen .damage s.difficulty |> Maybe.withDefault 0)
    in
    case target of
        AShip i ship ->
            shipStruck scale point i ship s

        AnAircraft i plane ->
            let
                hull : Float
                hull =
                    M.max 0 (plane.hull - 38 * scale)

                hit : Firing s p n
                hit =
                    { s
                        | aircraft =
                            List.indexedMap
                                (\j p ->
                                    if j == i then
                                        { p | hull = hull }

                                    else
                                        p
                                )
                                s.aircraft
                    }
            in
            if hull <= 0 then
                Mechanics.log "Aircraft hit. Going down." Success hit

            else
                hit

        TheBoat ->
            Systems.hurt 3 "Aircraft strafing the surfaced hull. Dive!" (Just Deckgun) Nothing s


{-| A deck-gun strike on a ship: she learns where the boat is, the carrier
raises the alarm, and the hull and, below her waterline, the flooding take
the hit. Friends and neutrals struck go in the debrief; the gun crew logs an
observed impact at most every two seconds per ship.
-}
shipStruck : Float -> Aloft -> Int -> Ship -> Firing s p n -> Firing s p n
shipStruck scale point i ship s =
    let
        signaled : Ship
        signaled =
            ColdWatch.playerSignal True Nothing s ship |> (\v -> { v | playerDamaged = Just True })

        alarmed : Firing s p n
        alarmed =
            if signaled.kind == Surface Carrier then
                AirSupport.raiseCarrierAlarm signaled (setShip i signaled s)

            else
                setShip i signaled s

        damaged : Ship
        damaged =
            { signaled
                | hull = Carrier.incidentalHull { kind = signaled.kind, hull = signaled.hull, directHits = floor (Maybe.withDefault 0 signaled.directHits) } (12 * scale)
                , flood =
                    if point.altitude + orZero signaled.sinkDepth < 5 then
                        Just (orZero signaled.flood + 2.4 * scale)

                    else
                        signaled.flood
            }

        friendlyNoted : Firing s p n
        friendlyNoted =
            if damaged.side == Just Friendly then
                Systems.addDebrief ("Your deck gun struck the friendly " ++ damaged.name ++ ".") alarmed

            else
                alarmed

        ( neutralNoted, recorded ) =
            if damaged.military /= Just True then
                PatrolReports.recordCivilianHit ("Deck-gun fire struck the neutral " ++ damaged.name ++ ".") friendlyNoted damaged

            else
                ( friendlyNoted, damaged )
    in
    if 2 < neutralNoted.time - Maybe.withDefault -99 recorded.lastHitLog then
        setShip i { recorded | lastHitLog = Just neutralNoted.time } neutralNoted
            |> Mechanics.log "Gun impact observed." Info

    else
        setShip i recorded neutralNoted
