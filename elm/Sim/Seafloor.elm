module Sim.Seafloor exposing (floorSegments, floorSurface, floorWidth)

{-| The seabed as the renderer meshes it: a grid of cells, each split along
its bottom-left to top-right diagonal, so the boat rests on the triangle the
player sees. x and north are simulation coordinates; slope Z increases toward
world-space south.
-}

import Sim.Coast as Coast exposing (Coastline)


floorWidth : Float
floorWidth =
    16000


floorSegments : Float
floorSegments =
    140


floorSurface : Maybe Coastline -> Float -> Float -> { height : Float, slopeX : Float, slopeZ : Float }
floorSurface chart x north =
    let
        cell =
            floorWidth / floorSegments

        half =
            floorWidth / 2

        col =
            toFloat (floor ((x + half) / cell))

        row =
            toFloat (floor ((half - north) / cell))

        west =
            col * cell - half

        top =
            half - row * cell

        u =
            (x - west) / cell

        v =
            (top - north) / cell

        height px py =
            negate (Coast.chartDepth chart px py)

        b =
            height west (top - cell)

        d =
            height (west + cell) top
    in
    if u + v <= 1 then
        let
            a =
                height west top
        in
        { height = a + (d - a) * u + (b - a) * v, slopeX = (d - a) / cell, slopeZ = (b - a) / cell }

    else
        let
            c =
                height (west + cell) (top - cell)
        in
        { height = c + (c - b) * (u - 1) + (c - d) * (v - 1), slopeX = (c - b) / cell, slopeZ = (c - d) / cell }
