module Sim.CombatGeometry exposing (Aloft, shipHit, sphereHit, wrap)

{-| Where a moving shell or weapon meets a ship's box or a sphere, as the
fraction of its path. Heights are altitudes above the surface.

This module pilots the owner's number rules (`Sim.Finite`; context:
docs/plan\_context/numerics.md). Its callers still hold Floats, so each value
enters as a pending number and is settled where the box test first compares
it. A result beyond the finite range, or indeterminate, counts as no hit.
None of those branches can be reached while every coordinate, depth and
radius is below 1e150 in magnitude, far beyond anything a patrol holds.

-}

import Sim.Carrier exposing (carrierSize)
import Sim.Finite as F exposing (Finite, Pending, Settled(..))
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


{-| A settled number, or nothing when it left the finite range.
-}
within : Pending -> Maybe Finite
within p =
    case F.settle p of
        Within v ->
            Just v

        _ ->
            Nothing


{-| The fraction along a segment where it enters a ship's box, in the ship's
own frame. A sunk ship's box lowers with it; a submarine's sits at its depth,
65 m when unknown. An unknown kind is sized as a merchant.
-}
shipHit : Aloft -> Aloft -> { a | x : Float, y : Float, heading : Float, sinkDepth : Float, depth : Maybe Float } -> Maybe Kind -> Maybe Float
shipHit from to ship kind =
    Maybe.andThen (\a -> boxHit from to ship kind (F.sine a) (F.cosine a)) (within (F.fromFloat (rad ship.heading)))


boxHit : Aloft -> Aloft -> { a | x : Float, y : Float, heading : Float, sinkDepth : Float, depth : Maybe Float } -> Maybe Kind -> F.Unit -> F.Unit -> Maybe Float
boxHit from to ship kind sn cs =
    let
        submerged : Pending
        submerged =
            if kind == Just Submarine then
                F.fromFloat (Maybe.withDefault 65 ship.depth)

            else
                F.pending F.zero

        local : Aloft -> ( Pending, Pending, Pending )
        local p =
            let
                dx : Pending
                dx =
                    F.minus (F.fromFloat p.x) (F.fromFloat ship.x)

                dy : Pending
                dy =
                    F.minus (F.fromFloat p.y) (F.fromFloat ship.y)
            in
            ( F.minus (F.scaled cs dx) (F.scaled sn dy)
            , F.plus (F.scaled sn dx) (F.scaled cs dy)
            , F.plus (F.plus (F.fromFloat p.altitude) (F.fromFloat (orZero ship.sinkDepth))) submerged
            )

        ( px, py, pz ) =
            local from

        ( qx, qy, qz ) =
            local to
    in
    case Maybe.andThen (List.foldl axis (Just ( F.zero, F.one )) << List.map2 (\( s, e ) b -> ( s, e, b )) [ ( px, qx ), ( py, qy ), ( pz, qz ) ]) (bounds kind) of
        Just ( enter, _ ) ->
            if F.notAbove F.zero enter && F.notAbove enter F.one then
                Just (F.value enter)

            else
                Nothing

        Nothing ->
            Nothing


{-| A ship's box in its own frame: across, along and up. The carrier's comes
from her Float dimensions, so it exists only if all of them settle.
-}
bounds : Maybe Kind -> Maybe (List ( Finite, Finite ))
bounds kind =
    if kind == Just (Surface Carrier) then
        let
            faces : Float -> Float -> Maybe ( Finite, Finite )
            faces low high =
                Maybe.map2 Tuple.pair (within (F.fromFloat low)) (within (F.fromFloat high))
        in
        Maybe.map3 (\across along up -> [ across, along, up ])
            (faces (negate carrierSize.halfBeam) carrierSize.halfBeam)
            (faces (negate carrierSize.halfLength) carrierSize.halfLength)
            (faces -7 carrierSize.deckHeight)

    else
        let
            size : F.Unit
            size =
                case kind of
                    Just (Surface Fishing) ->
                        F.unitLiteral 0.38

                    Just (Surface Escort) ->
                        F.unitLiteral 0.78

                    Just Submarine ->
                        F.unitLiteral 0.5

                    _ ->
                        F.unitLiteral 1

            symmetric : Finite -> ( Finite, Finite )
            symmetric half =
                ( F.negative (F.scale size half), F.scale size half )
        in
        Just
            [ symmetric (F.literal 14)
            , symmetric (F.literal 65)
            , ( F.literal -7
              , if kind == Just Submarine then
                    F.literal 7

                else
                    F.scale size (F.literal 23)
              )
            ]


{-| One axis of the slab test: the part of the path's span inside the box's
faces on this axis, if any is left.
-}
axis : ( Pending, Pending, ( Finite, Finite ) ) -> Maybe ( Finite, Finite ) -> Maybe ( Finite, Finite )
axis ( start, end, ( low, high ) ) span =
    case span of
        Just ( enter, leave ) ->
            case F.settle start of
                Within s ->
                    case F.settle (F.minus end start) of
                        Within v ->
                            if F.below (F.magnitude v) (F.literal 1.0e-10) then
                                if F.below s low || F.below high s then
                                    Nothing

                                else
                                    span

                            else
                                case F.settle (F.over (F.minus (F.pending low) (F.pending s)) (F.pending v)) of
                                    Within first ->
                                        case F.settle (F.over (F.minus (F.pending high) (F.pending s)) (F.pending v)) of
                                            Within second ->
                                                let
                                                    ( lo, hi ) =
                                                        if F.below second first then
                                                            ( second, first )

                                                        else
                                                            ( first, second )

                                                    entered : Finite
                                                    entered =
                                                        F.larger enter lo

                                                    left : Finite
                                                    left =
                                                        F.smaller leave hi
                                                in
                                                if F.below left entered then
                                                    Nothing

                                                else
                                                    Just ( entered, left )

                                            _ ->
                                                Nothing

                                    _ ->
                                        Nothing

                        _ ->
                            Nothing

                _ ->
                    Nothing

        Nothing ->
            Nothing


{-| The fraction along a segment closest to a sphere's center, if the segment
passes within its radius there.
-}
sphereHit : Aloft -> Aloft -> Aloft -> Float -> Maybe Float
sphereHit from to body radius =
    let
        x : Pending
        x =
            F.minus (F.fromFloat to.x) (F.fromFloat from.x)

        y : Pending
        y =
            F.minus (F.fromFloat to.y) (F.fromFloat from.y)

        z : Pending
        z =
            F.minus (F.fromFloat to.altitude) (F.fromFloat from.altitude)
    in
    case F.settle (F.plus (F.plus (F.times x x) (F.times y y)) (F.times z z)) of
        Within q ->
            if F.isZero q then
                closest from body radius x y z F.zero

            else
                let
                    toward : Pending
                    toward =
                        F.plus (F.plus (F.times (F.minus (F.fromFloat body.x) (F.fromFloat from.x)) x) (F.times (F.minus (F.fromFloat body.y) (F.fromFloat from.y)) y))
                            (F.times (F.minus (F.fromFloat body.altitude) (F.fromFloat from.altitude)) z)
                in
                case F.settle (F.over toward (F.pending q)) of
                    Within t ->
                        closest from body radius x y z (F.bounded F.zero F.one t)

                    _ ->
                        Nothing

        _ ->
            Nothing


{-| The hit at fraction `t` of the path, if the point there is within the
sphere's radius.
-}
closest : Aloft -> Aloft -> Float -> Pending -> Pending -> Pending -> Finite -> Maybe Float
closest from body radius x y z t =
    let
        along : F.Unit
        along =
            F.toUnit t
    in
    case
        F.settle
            (F.hypot3 (F.minus (F.plus (F.fromFloat from.x) (F.scaled along x)) (F.fromFloat body.x))
                (F.minus (F.plus (F.fromFloat from.y) (F.scaled along y)) (F.fromFloat body.y))
                (F.minus (F.plus (F.fromFloat from.altitude) (F.scaled along z)) (F.fromFloat body.altitude))
            )
    of
        Within d ->
            case F.settle (F.fromFloat radius) of
                Within r ->
                    if F.below d r then
                        Just (F.value t)

                    else
                        Nothing

                _ ->
                    Nothing

        _ ->
            Nothing
