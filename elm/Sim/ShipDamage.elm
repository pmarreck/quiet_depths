module Sim.ShipDamage exposing (Sinking, shipDamage)

{-| Ships taking on water and going down. A flooding ship loses hull (a
doomed carrier at her own pace), is disabled below 48 or past 8 of
flooding, and settles lower. A sunk ship descends, slowly at first, creaks
as she goes, may have compartments collapse once deep, and comes to rest on
the seabed.
-}

import Sim.Acoustics as Acoustics
import Sim.Carrier as Carrier
import Sim.Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.Foundering as Foundering
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.ReplayEvents as Replay
import Sim.Seafloor as Seafloor
import Sim.Ship exposing (Ship)
import Sim.Sound exposing (Sound)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Systems as Systems exposing (Impact)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


{-| The patrol fields ship damage reads and writes.
-}
type alias Sinking s p =
    { s
        | time : Float
        , ships : List Ship
        , chart : Maybe Coastline
        , patrol : { p | seed : Float }
        , debrief : List Debrief.Entry
        , acoustics : List Sound
        , soundSequence : Int
        , invalid : List InvalidNumber
        , impacts : List Impact
        , weaponSequence : Int
        , replay : List Replay.Marked
    }


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


directHits : Ship -> Int
directHits v =
    floor (Maybe.withDefault 0 v.directHits)


{-| Every ship, in order. Each ends with a flood and a sink depth, as the
TypeScript writes them.
-}
shipDamage : Float -> Sinking s p -> Sinking s p
shipDamage dt start =
    let
        step : Ship -> ( List Ship, Sinking s p ) -> ( List Ship, Sinking s p )
        step v ( done, s ) =
            let
                ( after, state ) =
                    damage dt v s
            in
            ( after :: done, state )

        ( ships, ended ) =
            List.foldl step ( [], start ) start.ships
    in
    { ended | ships = List.reverse ships }


damage : Float -> Ship -> Sinking s p -> ( Ship, Sinking s p )
damage dt v0 s0 =
    let
        flood : Float
        flood =
            orZero v0.flood

        v1 : Ship
        v1 =
            { v0 | flood = Just flood, sinkDepth = Just (orZero v0.sinkDepth) }

        ( flooded, s1 ) =
            if 0 < v1.hull && 0 < flood then
                flooding dt flood v1 s0

            else
                ( v1, s0 )
    in
    if 0 < flooded.hull || flooded.settled == Just True then
        ( flooded, s1 )

    else
        sinking dt flooded s1


flooding : Float -> Float -> Ship -> Sinking s p -> ( Ship, Sinking s p )
flooding dt flood v s =
    let
        carrier : Bool
        carrier =
            v.kind == Surface Carrier

        hull : Float
        hull =
            if carrier then
                (Carrier.advanceCarrierFlood dt { directHits = directHits v, hull = v.hull, flood = flood, disabled = False, speed = 0 }).hull

            else
                M.max 0 (v.hull - flood * 0.05 * dt)

        disabling : Bool
        disabling =
            hull < 48 || 8 < flood

        ( disabled, noted ) =
            if disabling then
                ( { v | hull = hull, disabled = Just True, speed = 0 }
                , if v.disabled == Just True then
                    s

                  else
                    Systems.addDebrief (v.name ++ " was disabled by flooding.") s
                )

            else
                ( { v | hull = hull }, s )

        sinkDepth : Float
        sinkDepth =
            orZero v.sinkDepth

        settledLower : Float
        settledLower =
            if carrier && Carrier.carrierDoomed { directHits = directHits v } then
                M.max sinkDepth ((1 - hull / 40) * 7)

            else
                M.min 4 (sinkDepth + dt * flood * 0.002)
    in
    ( { disabled | sinkDepth = Just settledLower }, noted )


sinking : Float -> Ship -> Sinking s p -> ( Ship, Sinking s p )
sinking dt v0 s0 =
    let
        sub : Bool
        sub =
            v0.kind == Submarine

        -- A submarine always carries her depth.
        origin : Float
        origin =
            if sub then
                Maybe.withDefault 0 v0.depth

            else
                0

        ( sunkAt, s1 ) =
            case v0.sunkAt of
                Just t ->
                    ( t, s0 )

                Nothing ->
                    ( s0.time, Systems.addDebrief (v0.name ++ " began sinking.") s0 )

        clearance : Float
        clearance =
            if sub || v0.kind == Surface Fishing then
                3

            else
                8

        bed : Float
        bed =
            M.max 0 (negate (Seafloor.floorSurface s1.chart v0.x v0.y).height - clearance - origin)

        beforeDrop : Float
        beforeDrop =
            orZero v0.sinkDepth

        age : Float
        age =
            s1.time - sunkAt

        rate : Float
        rate =
            if sub then
                1.3

            else
                Foundering.descentSpeed age
                    * (if v0.kind == Surface Carrier then
                        Carrier.carrierDescentFactor { directHits = directHits v0 }

                       else
                        1
                      )

        sinkDepth : Float
        sinkDepth =
            M.min bed (beforeDrop + dt * rate)

        depth : Float
        depth =
            origin + sinkDepth

        lastVisible : Float
        lastVisible =
            case v0.kind of
                Surface kind ->
                    Foundering.submergedDepth kind

                Submarine ->
                    0

        v1 : Ship
        v1 =
            { v0 | sunkAt = Just sunkAt, speed = 0, sinkDepth = Just sinkDepth }

        s2 : Sinking s p
        s2 =
            if not sub && beforeDrop < lastVisible && M.notLess sinkDepth lastVisible then
                Replay.mark (sunkEvent Replay.Sinking v1 depth) s1

            else
                s1

        ( v2, s3 ) =
            if M.notLess age (Maybe.withDefault 4 v1.nextCreak) then
                ( { v1 | nextCreak = Just (age + 9 + hash01 s2.patrol.seed (sunkAt + toFloat (floor age)) * 20) }
                , Systems.emit { kind = Acoustics.Creak, x = v1.x, y = v1.y, depth = Just depth, altitude = Nothing, power = 0.65 } s2
                )

            else
                ( v1, s2 )

        collapses : Bool
        collapses =
            v2.collapsed
                /= Just True
                && 45
                < depth
                && 18
                < sinkDepth
                && (sub || (M.notLess age Foundering.surfaceCollapseAge && lastVisible + 20 < depth && 0.45 < hash01 s3.patrol.seed sunkAt))

        ( v3, s4 ) =
            if collapses then
                ( { v2 | collapsed = Just True, collapsedAt = Just s3.time }, collapse sub depth v2 s3 )

            else
                ( v2, s3 )
    in
    if M.notLess sinkDepth bed then
        ( { v3 | settled = Just True }
        , s4
            |> Systems.emitWith (\sound -> { sound | vessel = Just v3.id }) { kind = Acoustics.Settling, x = v3.x, y = v3.y, depth = Just depth, altitude = Nothing, power = 0.9 }
            |> Systems.addDebrief (v3.name ++ " came to rest on the seabed.")
        )

    else
        ( v3, s4 )


sunkEvent : Replay.Kind -> Ship -> Float -> Replay.ReplayEvent
sunkEvent kind v depth =
    let
        event : Replay.ReplayEvent
        event =
            Replay.at kind { x = v.x, y = v.y, depth = depth }
    in
    { event | enemy = Just True, target = Just v.id }


{-| Compartments give way: a submarine's collapse marks an impact and a replay
moment; any ship's is heard.
-}
collapse : Bool -> Float -> Ship -> Sinking s p -> Sinking s p
collapse sub depth v s =
    let
        marked : Sinking s p
        marked =
            if sub then
                { s
                    | impacts = s.impacts ++ [ { id = s.weaponSequence, x = v.x, y = v.y, altitude = negate depth, time = s.time, kind = "collapse" } ]
                    , weaponSequence = s.weaponSequence + 1
                }
                    |> Replay.mark (sunkEvent Replay.Collapse v depth)

            else
                s
    in
    marked
        |> Systems.emitWith (\sound -> { sound | vessel = Just v.id }) { kind = Acoustics.Collapse, x = v.x, y = v.y, depth = Just depth, altitude = Nothing, power = 1.3 }
        |> Systems.addDebrief ("Compartments aboard " ++ v.name ++ " collapsed during the descent.")
