module Sim.SurfaceWake exposing (WakeSample, recordWake, surfaceCrossing, wakeLifetime)

{-| The boat's wake: where the hull, sail and masts break the surface as it
moves, recorded once a second as a trail the renderer draws foam along.
-}

import Sim.HullDesign exposing (design)
import Sim.Math as M
import Sim.Periscope exposing (scopeExtension, scopeEyeHeight)
import Sim.SurfaceMotion as Motion exposing (Point, Sea, boatPoint, surfaceHeight)


type alias WakeSample =
    { x : Float, y : Float, heading : Float, time : Float, width : Float, strength : Float }


{-| Seconds a crossing stays in the trail.
-}
wakeLifetime : Float
wakeLifetime =
    26


type alias Column =
    { forward : Float, top : Float, base : Float, beam : Float }


hullProfile : List Column
hullProfile =
    List.map (\st -> { forward = negate st.z, top = st.radius, base = negate st.radius, beam = st.radius }) design.stations


{-| Cross sections of the capsule the exterior model uses for the sail.
-}
sailProfile : List Column
sailProfile =
    List.map
        (\i ->
            let
                angle =
                    toFloat i * pi / 8

                cap =
                    design.sailRadius * sin angle

                center =
                    design.bridgeRoof - design.sailRadius - design.sailBarrel / 2
            in
            { forward = negate design.bridgeZ + design.sailRadius * design.sailStretch * cos angle
            , top = center + design.sailBarrel / 2 + cap
            , base = center - design.sailBarrel / 2 - cap
            , beam = design.sailRadius
            }
        )
        (List.range 0 8)


type alias Boat a c =
    { a
        | x : Float
        , y : Float
        , heading : Float
        , depth : Float
        , pitch : Float
        , speed : Float
        , scope : Bool
        , scopeTravel : Maybe Float
        , systems : { c | periscope : Float }
        , time : Float
    }


{-| The leading crossing found so far, and how much of the boat is out.
-}
type alias Crossing =
    { leading : Float, x : Float, y : Float, exposure : Float }


type alias Cut =
    { upper : Point, lower : Point, high : Float, low : Float }


{-| Where the moving boat's leading edge meets the surface, how wide its wake
spreads and how strong it is, or nothing when it is too deep or too slow.
-}
surfaceCrossing : Boat a c -> Sea b -> Maybe WakeSample
surfaceCrossing s sea =
    let
        speed =
            M.abs s.speed
    in
    if s.depth > 23 || speed < 0.1 then
        Nothing

    else
        let
            hull =
                Motion.surfaceMotion s sea s.time

            angle =
                s.heading * pi / 180

            sign =
                M.sign s.speed

            east =
                sign * sin angle

            north =
                sign * cos angle

            clearance p =
                negate p.depth - surfaceHeight p.x p.y s.time sea

            consider a b f found =
                let
                    px =
                        a.x + (b.x - a.x) * f

                    py =
                        a.y + (b.y - a.y) * f

                    along =
                        (px - s.x) * east + (py - s.y) * north
                in
                if found.leading < along then
                    { found | leading = along, x = px, y = py }

                else
                    found

            section col found =
                let
                    upper =
                        boatPoint hull { side = 0, forward = col.forward, down = negate col.top }

                    lower =
                        boatPoint hull { side = 0, forward = col.forward, down = negate col.base }

                    high =
                        clearance upper

                    low =
                        clearance lower
                in
                ( { upper = upper, lower = lower, high = high, low = low }
                , if high >= 0 && low <= 0 then
                    let
                        met =
                            consider upper
                                lower
                                (if high == low then
                                    0

                                 else
                                    high / (high - low)
                                )
                                found
                    in
                    { met | exposure = M.max met.exposure (M.min high col.beam) }

                  else
                    found
                )

            only col found =
                Tuple.second (section col found)

            -- The leading intersection usually falls between two model
            -- stations; a pitched-up bow can meet the water along its underside.
            profile columns found =
                case columns of
                    [] ->
                        found

                    first :: rest ->
                        List.foldl
                            (\col ( a, acc ) ->
                                let
                                    ( b, cut ) =
                                        section col acc

                                    withTop =
                                        if (a.high > 0) /= (b.high > 0) then
                                            consider a.upper b.upper (a.high / (a.high - b.high)) cut

                                        else
                                            cut

                                    withBottom =
                                        if (a.low > 0) /= (b.low > 0) then
                                            consider a.lower b.lower (a.low / (a.low - b.low)) withTop

                                        else
                                            withTop
                                in
                                ( b, withBottom )
                            )
                            (section first found)
                            rest
                            |> Tuple.second

            scope found =
                if scopeExtension s > 0 && not (M.isZero s.systems.periscope) then
                    only { forward = negate design.scopeZ, top = scopeEyeHeight s, base = scopeEyeHeight s - 6, beam = 0.16 } found

                else
                    found

            crossing =
                { leading = -1 / 0, x = 0, y = 0, exposure = 0 }
                    |> profile hullProfile
                    |> profile sailProfile
                    -- Upper rudder, when backing down; deck mount; bridge; fixed snorkel; aerial.
                    |> only { forward = -29.6, top = 4.3, base = 0.8, beam = 0.13 }
                    |> only { forward = 16.7, top = 5.95, base = 5.15, beam = 0.7 }
                    |> only { forward = negate design.bridgeZ, top = design.bridgeRoof + 0.97, base = design.bridgeRoof, beam = 0.55 }
                    |> only { forward = 2.6, top = 15, base = 11, beam = 0.09 }
                    |> only { forward = 1.6, top = 13.5, base = 10.5, beam = 0.06 }
                    |> scope
        in
        if not (M.truthy crossing.exposure) then
            Nothing

        else
            let
                exposed =
                    sqrt (crossing.exposure / design.hullRadius)
            in
            Just
                { x = crossing.x
                , y = crossing.y
                , time = s.time
                , heading =
                    M.remainder
                        (s.heading
                            + (if sign < 0 then
                                180

                               else
                                0
                              )
                        )
                        360
                , width = speed * 0.514444 * (0.22 + 0.2 * exposed)
                , strength = M.min 1 (speed / 10) * exposed
                }


{-| Drops crossings older than the lifetime and adds one a second while the
boat breaks the surface.
-}
recordWake : Boat a c -> Sea b -> List WakeSample -> List WakeSample
recordWake s sea wake =
    let
        trimmed =
            case wake of
                first :: _ ->
                    if wakeLifetime < s.time - first.time then
                        List.filter (\p -> s.time - p.time <= wakeLifetime) wake

                    else
                        wake

                [] ->
                    wake

        recent =
            case List.reverse trimmed of
                last :: _ ->
                    s.time - last.time < 1

                [] ->
                    False
    in
    if recent then
        trimmed

    else
        case surfaceCrossing s sea of
            Just sample ->
                trimmed ++ [ sample ]

            Nothing ->
                trimmed
