module Sim.CombatGeometry exposing (Aloft, shipHit, sphereHit, wrap)

{-| Where a moving shell or weapon meets a ship's box or a sphere, as the
fraction of its path. Heights are altitudes above the surface.
-}

import Sim.Carrier exposing (carrierSize)
import Sim.Math as M
import Sim.Mechanics exposing (rad)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


type alias Aloft =
    { x : Float, y : Float, altitude : Float }


{-| An angle wrapped into 0 to 360.
-}
wrap : Float -> Float
wrap n =
    M.remainder (M.remainder n 360 + 360) 360


{-| JavaScript's `value || 0`.
-}
orZero : Float -> Float
orZero value =
    if M.truthy value then
        value

    else
        0


{-| The fraction along a segment where it enters a ship's box, in the ship's
own frame. A sunk ship's box lowers with it; a submarine's sits at its depth,
65 m when unknown. An unknown kind is sized as a merchant.
-}
shipHit : Aloft -> Aloft -> { a | x : Float, y : Float, heading : Float, sinkDepth : Float, depth : Maybe Float } -> Maybe Kind -> Maybe Float
shipHit from to ship kind =
    let
        a =
            rad ship.heading

        sn =
            sin a

        cs =
            cos a

        scale =
            case kind of
                Just (Surface Fishing) ->
                    0.38

                Just (Surface Escort) ->
                    0.78

                Just Submarine ->
                    0.5

                _ ->
                    1

        submerged =
            if kind == Just Submarine then
                Maybe.withDefault 65 ship.depth

            else
                0

        local p =
            ( (p.x - ship.x) * cs - (p.y - ship.y) * sn
            , (p.x - ship.x) * sn + (p.y - ship.y) * cs
            , p.altitude + orZero ship.sinkDepth + submerged
            )

        ( px, py, pz ) =
            local from

        ( qx, qy, qz ) =
            local to

        bounds =
            if kind == Just (Surface Carrier) then
                [ ( negate carrierSize.halfBeam, carrierSize.halfBeam ), ( negate carrierSize.halfLength, carrierSize.halfLength ), ( -7, carrierSize.deckHeight ) ]

            else
                [ ( -14 * scale, 14 * scale )
                , ( -65 * scale, 65 * scale )
                , ( -7
                  , if kind == Just Submarine then
                        7

                    else
                        23 * scale
                  )
                ]

        axis ( start, end, ( low, high ) ) span =
            case span of
                Nothing ->
                    Nothing

                Just ( enter, leave ) ->
                    let
                        v =
                            end - start
                    in
                    if M.abs v < 1.0e-10 then
                        if start < low || high < start then
                            Nothing

                        else
                            span

                    else
                        let
                            first =
                                (low - start) / v

                            second =
                                (high - start) / v

                            ( lo, hi ) =
                                if second < first then
                                    ( second, first )

                                else
                                    ( first, second )

                            entered =
                                M.max enter lo

                            left =
                                M.min leave hi
                        in
                        if left < entered then
                            Nothing

                        else
                            Just ( entered, left )
    in
    case List.foldl axis (Just ( 0, 1 )) (List.map2 (\( s, e ) b -> ( s, e, b )) [ ( px, qx ), ( py, qy ), ( pz, qz ) ] bounds) of
        Just ( enter, _ ) ->
            if enter >= 0 && enter <= 1 then
                Just enter

            else
                Nothing

        Nothing ->
            Nothing


{-| The fraction along a segment closest to a sphere's center, if the segment
passes within its radius there.
-}
sphereHit : Aloft -> Aloft -> Aloft -> Float -> Maybe Float
sphereHit from to body radius =
    let
        x =
            to.x - from.x

        y =
            to.y - from.y

        z =
            to.altitude - from.altitude

        q =
            x * x + y * y + z * z

        t =
            if M.truthy q then
                M.clamp 0 1 (((body.x - from.x) * x + (body.y - from.y) * y + (body.altitude - from.altitude) * z) / q)

            else
                0
    in
    if M.hypot3 (from.x + t * x - body.x) (from.y + t * y - body.y) (from.altitude + t * z - body.altitude) < radius then
        Just t

    else
        Nothing
