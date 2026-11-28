module Bench.GeometryFloat exposing (Aloft, shipHit, sphereHit)

{-| Sim.CombatGeometry as it stood before the number-type pilot (commit
1e833e0), kept as the Float baseline that scripts/elm-geometry-bench.mjs
times the pilot against.
-}

import Sim.Carrier exposing (carrierSize)
import Sim.Math as M
import Sim.Mechanics exposing (rad)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


type alias Aloft =
    { x : Float, y : Float, altitude : Float }


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
        a : Float
        a =
            rad ship.heading

        sn : Float
        sn =
            sin a

        cs : Float
        cs =
            cos a

        submerged : Float
        submerged =
            if kind == Just Submarine then
                Maybe.withDefault 65 ship.depth

            else
                0

        local : Aloft -> ( Float, Float, Float )
        local p =
            ( (p.x - ship.x) * cs - (p.y - ship.y) * sn
            , (p.x - ship.x) * sn + (p.y - ship.y) * cs
            , p.altitude + orZero ship.sinkDepth + submerged
            )

        ( px, py, pz ) =
            local from

        ( qx, qy, qz ) =
            local to

        bounds : List ( Float, Float )
        bounds =
            if kind == Just (Surface Carrier) then
                [ ( negate carrierSize.halfBeam, carrierSize.halfBeam ), ( negate carrierSize.halfLength, carrierSize.halfLength ), ( -7, carrierSize.deckHeight ) ]

            else
                let
                    scale : Float
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
                in
                [ ( -14 * scale, 14 * scale )
                , ( -65 * scale, 65 * scale )
                , ( -7
                  , if kind == Just Submarine then
                        7

                    else
                        23 * scale
                  )
                ]

        axis : ( Float, Float, ( Float, Float ) ) -> Maybe ( Float, Float ) -> Maybe ( Float, Float )
        axis ( start, end, ( low, high ) ) span =
            case span of
                Nothing ->
                    Nothing

                Just ( enter, leave ) ->
                    let
                        v : Float
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
                            first : Float
                            first =
                                (low - start) / v

                            second : Float
                            second =
                                (high - start) / v

                            ( lo, hi ) =
                                if second < first then
                                    ( second, first )

                                else
                                    ( first, second )

                            entered : Float
                            entered =
                                M.max enter lo

                            left : Float
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
        x : Float
        x =
            to.x - from.x

        y : Float
        y =
            to.y - from.y

        z : Float
        z =
            to.altitude - from.altitude

        q : Float
        q =
            x * x + y * y + z * z

        t : Float
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
