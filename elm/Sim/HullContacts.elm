module Sim.HullContacts exposing (resolveTraffic)

{-| Hull against hull: the pushes that part them, the damage and the
grounding of traffic on shoals. The TypeScript compares bodies by identity
(the boat, the site, a ship, a throwaway wreck copy); here each body is named
by its role, and one state is threaded through the pairs in the TypeScript's
order, since a ship pushed in one pair is the ship the next pair sees. The
geometry is in `Sim.HullGeometry`, the roles in `Sim.HullTraffic`.
-}

import Array exposing (Array)
import Dict exposing (Dict)
import Sim.Carrier as Carrier
import Sim.Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.Equipment as Equipment
import Sim.HullGeometry exposing (Body, Contact, hullContact, is, keelLimit, nan, orZero, pushOffShoal, weight)
import Sim.HullTraffic exposing (Hurt, Role(..), Traffic, Work, bodyOf, roleKey, shipBody, store)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.PatrolReports as Reports
import Sim.Periscope as Periscope
import Sim.Ship exposing (Ship)
import Sim.SurfaceMotion exposing (Point)
import Sim.Vessel as Vessel exposing (Kind(..), SurfaceShip(..))


resolvePair : Hurt t c r -> Role -> Role -> Work t c r -> Work t c r
resolvePair hurt roleA roleB work =
    let
        a =
            bodyOf roleA work

        b =
            bodyOf roleB work
    in
    case hullContact a b of
        Nothing ->
            work

        Just hit ->
            let
                isSite role =
                    role == Site

                wa =
                    weight a (isSite roleA)

                wb =
                    weight b (isSite roleB)

                sum =
                    wa + wb

                -- Only a submerged hull gives way vertically. The TypeScript also
                -- excludes the site, but a site weighs nothing unless it floats.
                submerged x w =
                    if x.kind == Nothing || is "sub" x then
                        w

                    else
                        0

                va =
                    submerged a wa

                vb =
                    submerged b wb

                move0 =
                    hit.overlap + 0.015

                da0 =
                    if M.truthy va then
                        move0 * hit.nd * va / (va + vb)

                    else
                        0

                db0 =
                    if M.truthy vb then
                        negate move0 * hit.nd * vb / (va + vb)

                    else
                        0

                blocked x d =
                    let
                        depth =
                            Maybe.withDefault nan x.depth
                    in
                    d < 0 && depth + d < 0 || d > 0 && keelLimit x work.s.chart < depth + d

                ( n, move, ( da, db ) ) =
                    if not (M.truthy (va + vb)) || blocked a da0 || blocked b db0 then
                        let
                            angle =
                                Mechanics.rad a.heading

                            len =
                                M.hypot2 hit.nx hit.ny
                        in
                        ( if len > 0.001 then
                            { nx = hit.nx / len, ny = hit.ny / len }

                          else
                            { nx = cos angle, ny = negate (sin angle) }
                        , hit.lateralGap + 0.015
                        , ( 0, 0 )
                        )

                    else
                        ( { nx = hit.nx, ny = hit.ny }, move0, ( da0, db0 ) )

                closing =
                    M.hypot3 (sin (Mechanics.rad a.heading) * a.speed - sin (Mechanics.rad b.heading) * b.speed)
                        (cos (Mechanics.rad a.heading) * a.speed - cos (Mechanics.rad b.heading) * b.speed)
                        (orZero a.verticalSpeed - orZero b.verticalSpeed)

                displace x amount vertical =
                    { x
                        | x = x.x + amount * n.nx
                        , y = x.y + amount * n.ny
                        , depth =
                            if M.truthy vertical then
                                Just (Maybe.withDefault nan x.depth + vertical)

                            else
                                x.depth
                    }

                pushed =
                    work
                        |> store roleA (displace a (move * wa / sum) da)
                        |> (\w -> store roleB (displace (bodyOf roleB w) (negate move * wb / sum) db) w)

                key =
                    List.sort [ roleKey roleA a, roleKey roleB b ] |> String.join "/"

                lastHit =
                    Dict.get key pushed.s.collisionHits |> Maybe.withDefault -99
            in
            if pushed.s.time - lastHit < 4 then
                pushed

            else
                let
                    noted =
                        let
                            s =
                                pushed.s
                        in
                        { pushed | s = { s | collisionHits = Dict.insert key s.time s.collisionHits } }

                    severity =
                        M.clamp 2 36 (2 + closing * 1.1)
                in
                List.foldl (strike hurt roleA roleB a b hit severity) noted [ roleA, roleB ]


strike : Hurt t c r -> Role -> Role -> Body -> Body -> Contact -> Float -> Role -> Work t c r -> Work t c r
strike hurt roleA roleB a b hit severity role work =
    let
        damaged =
            case role of
                Boat ->
                    let
                        other =
                            if roleA == Boat then
                                b

                            else
                                a

                        s =
                            work.s

                        text =
                            if roleB == Site then
                                "Hull contact with the casualty."

                            else
                                "Hull collision with another vessel."
                    in
                    { work | s = hurt severity text "planes" { s | collisions = s.collisions ++ [ { target = other.id, point = hit.point } ] } }

                _ ->
                    let
                        x =
                            bodyOf role work

                        before =
                            Maybe.withDefault 100 x.hull

                        after =
                            Carrier.incidentalHull
                                { kind = carrierKind x
                                , hull = before
                                , directHits = Maybe.withDefault 0 (Maybe.map round x.directHits)
                                }
                                severity

                        hullStored =
                            store role { x | hull = Just after } work
                    in
                    if roleA == Boat && x.military == Just False && before > 0 && M.isZero after then
                        recordHit role x hullStored

                    else
                        hullStored
    in
    if role == Site then
        damaged

    else
        let
            x =
                bodyOf role damaged
        in
        store role
            { x
                | speed = x.speed * 0.45
                , verticalSpeed =
                    case x.verticalSpeed of
                        Just v ->
                            if M.truthy v then
                                Just (v * 0.4)

                            else
                                x.verticalSpeed

                        Nothing ->
                            Nothing
            }
            damaged


{-| Carrier rules apply only to the carrier; any other hull sinks at zero. -}
carrierKind : Body -> Kind
carrierKind x =
    if is "carrier" x then
        Surface Carrier

    else
        Surface Merchant


recordHit : Role -> Body -> Work t c r -> Work t c r
recordHit role x work =
    case role of
        Afloat i ->
            case Array.get i work.ships of
                Just v ->
                    let
                        ( s, struck ) =
                            Reports.recordCivilianHit ("Your sub collided with the neutral " ++ Maybe.withDefault "" x.name ++ " and sank her.") work.s v
                    in
                    { s = s, ships = Array.set i struck work.ships }

                Nothing ->
                    work

        _ ->
            work


{-| Every hull against every other in the TypeScript's order: the boat
against settled wrecks nearby, then the site, then each ship afloat (after
the periscope check) against the boat, the site and the ships before it,
each ship grounding last.
-}
resolveTraffic : Hurt t c r -> Traffic t c r -> Traffic t c r
resolveTraffic hurt traffic =
    let
        start =
            { s = traffic, ships = Array.fromList traffic.ships }

        afloat =
            List.filterMap
                (\( i, v ) ->
                    if v.hull > 0 then
                        Just i

                    else
                        Nothing
                )
                (List.indexedMap Tuple.pair traffic.ships)

        wrecks w =
            List.foldl
                (\v acc ->
                    let
                        reach =
                            if v.kind == Surface Carrier then
                                225

                            else
                                145
                    in
                    if v.hull > 0 || v.sunkAt == Nothing || reach < Mechanics.distance acc.s v then
                        acc

                    else
                        let
                            copy =
                                shipBody v
                        in
                        resolvePair hurt
                            Boat
                            (WreckCopy
                                { copy
                                    | depth =
                                        Just
                                            ((if v.kind == Submarine then
                                                Maybe.withDefault nan v.depth

                                              else
                                                0
                                             )
                                                + Maybe.withDefault nan v.sinkDepth
                                            )
                                    , fixedWreck = True
                                }
                            )
                            acc
                )
                w
                traffic.ships

        withSite w =
            if w.s.site /= Nothing then
                resolvePair hurt Boat Site w

            else
                w

        eachShip ( order, i ) w =
            w
                |> shearPeriscope i
                |> resolvePair hurt Boat (Afloat i)
                |> (\x ->
                        if x.s.site /= Nothing then
                            resolvePair hurt (Afloat i) Site x

                        else
                            x
                   )
                |> (\x -> List.foldl (\j acc -> resolvePair hurt (Afloat i) (Afloat j) acc) x (List.take order afloat))
                |> ground i

        done =
            start |> wrecks |> withSite |> (\w -> List.foldl eachShip w (List.indexedMap Tuple.pair afloat))

        s =
            done.s
    in
    { s | ships = Array.toList done.ships }


shearPeriscope : Int -> Work t c r -> Work t c r
shearPeriscope i w =
    case Array.get i w.ships of
        Just v ->
            let
                s =
                    w.s

                periscope =
                    s.systems.periscope
            in
            if v.kind /= Submarine && Periscope.scopeExtension s > 0 && s.depth <= 15 && Mechanics.distance s v < 48 && periscope > 0 then
                let
                    part =
                        Equipment.damage 100 { condition = periscope, limit = s.repairLimits.periscope }
                in
                { w
                    | s =
                        Mechanics.log "Periscope sheared away under a vessel."
                            Damage
                            { s
                                | systems = setPeriscope part.condition s.systems
                                , repairLimits = setPeriscope part.limit s.repairLimits
                                , scope = False
                                , scopeTravel = Nothing
                            }
                }

            else
                w

        Nothing ->
            w


ground : Int -> Work t c r -> Work t c r
ground i w =
    case Array.get i w.ships of
        Just v ->
            let
                seabed =
                    keelLimit (shipBody v) w.s.chart
            in
            if seabed < Maybe.withDefault 0 v.depth then
                let
                    sunk =
                        if v.kind == Submarine then
                            { v | depth = Just (M.max 0 seabed) }

                        else
                            v

                    pushed =
                        if seabed < 0 then
                            pushOffShoal sunk (negate seabed) w.s.chart

                        else
                            sunk

                    hit =
                        if 5 < w.s.time - Maybe.withDefault -99 pushed.groundedAt then
                            { pushed
                                | hull = Carrier.incidentalHull { kind = pushed.kind, hull = pushed.hull, directHits = Maybe.withDefault 0 (Maybe.map round pushed.directHits) } (2 + M.abs pushed.speed * 0.7)
                                , groundedAt = Just w.s.time
                            }

                        else
                            pushed
                in
                { w | ships = Array.set i { hit | speed = hit.speed * 0.35 } w.ships }

            else
                w

        Nothing ->
            w


setPeriscope : Float -> { a | periscope : Float } -> { a | periscope : Float }
setPeriscope value parts =
    { parts | periscope = value }
