module Sim.Coast exposing (Coastline, Island, Outcrop, chartDepth, coastline, shelfOutcrops)

{-| The patrol chart's seabed: the surveyed inner shelf, and beyond it a
seeded coast of islands and a mainland shore.
-}

import Sim.Math as M exposing (exp)
import Sim.SurfaceMotion exposing (hash01)


type alias Island =
    { x : Float, y : Float, length : Float, width : Float, cos : Float, sin : Float, height : Float, phase : Float }


type alias Coastline =
    { phase : Float, second : Float, islands : List Island, mainland : Float }


{-| Draws from the seed in sequence, as the TypeScript's `roll()` does.
-}
type alias Rolls =
    { seed : Float, next : Float }


roll : Rolls -> ( Float, Rolls )
roll rolls =
    ( hash01 rolls.seed rolls.next, { rolls | next = rolls.next + 1 } )


{-| A chain of three to six islands on each side of the inner shelf. Every
draw happens in the TypeScript's order, so a seed gives the same coast.
-}
coastline : Float -> Coastline
coastline seed =
    let
        ( phaseRoll, r1 ) =
            roll { seed = seed, next = 8500 }

        ( secondRoll, r2 ) =
            roll r1

        ( islands, r3 ) =
            List.foldl
                (\side ( found, rolls ) ->
                    let
                        ( startX, ra ) =
                            roll rolls

                        ( startY, rb ) =
                            roll ra

                        ( bearingRoll, rc ) =
                            roll rb

                        ( countRoll, rd ) =
                            roll rc

                        bearing : Float
                        bearing =
                            bearingRoll * pi * 2

                        place : Int -> ( Float, Float, ( List Island, Rolls ) ) -> ( Float, Float, ( List Island, Rolls ) )
                        place i ( x, y, ( placed, rs ) ) =
                            if i <= 0 then
                                ( x, y, ( placed, rs ) )

                            else
                                let
                                    ( tiltRoll, s1 ) =
                                        roll rs

                                    ( lengthRoll, s2 ) =
                                        roll s1

                                    ( widthRoll, s3 ) =
                                        roll s2

                                    ( heightRoll, s4 ) =
                                        roll s3

                                    ( islandPhase, s5 ) =
                                        roll s4

                                    ( stepX, s6 ) =
                                        roll s5

                                    ( stepAlong, s7 ) =
                                        roll s6

                                    ( stepAcross, s8 ) =
                                        roll s7

                                    tilt : Float
                                    tilt =
                                        bearing + (tiltRoll - 0.5) * 1.7

                                    island : Island
                                    island =
                                        { x = x
                                        , y = y
                                        , length = 950 + lengthRoll * 2300
                                        , width = 580 + widthRoll * 1300
                                        , cos = cos tilt
                                        , sin = sin tilt
                                        , height = 260 + heightRoll * 270
                                        , phase = islandPhase * pi * 2
                                        }
                                in
                                place (i - 1)
                                    ( x + side * (800 + stepX * 2100)
                                      -- y += a + b adds the whole step at once.
                                    , y + ((1000 + stepAlong * 2300) * sin bearing + (stepAcross - 0.5) * 1500)
                                    , ( placed ++ [ island ], s8 )
                                    )

                        ( _, _, result ) =
                            place (3 + floor (countRoll * 4)) ( side * (9400 + startX * 3800), (startY - 0.45) * 15000, ( found, rd ) )
                    in
                    result
                )
                ( [], r2 )
                [ -1, 1 ]

        ( mainlandRoll, _ ) =
            roll r3
    in
    { phase = phaseRoll * pi * 2, second = secondRoll * pi * 2, islands = islands, mainland = 11000 + mainlandRoll * 5500 }


{-| Charted depth in meters; negative is above sea level. The surveyed inner
shelf and the island airstrip keep the original chart, as does every patrol
saved before coastlines existed (no coastline).
-}
chartDepth : Maybe Coastline -> Float -> Float -> Float
chartDepth chart x y =
    let
        reef : Float
        reef =
            155 * exp (negate ((x - 1900) ^ 2 + (y - 700) ^ 2) / 470000)

        greybank : Float
        greybank =
            460 * exp (negate ((x + 3800) ^ 2 + (y - 4000) ^ 2) / 1900000)

        old : Float
        old =
            230 + 30 * sin (x / 1100) * cos (y / 900) - reef - greybank
    in
    case chart of
        Nothing ->
            old

        Just coast ->
            if M.abs x < 4500 && y < 5600 && y > -4500 then
                old

            else
                let
                    blend : Float
                    blend =
                        M.min 1 (M.max (M.max (M.max 0 ((M.abs x - 4500) / 2800)) ((y - 5600) / 2600)) ((negate y - 4500) / 2600))

                    shelf : Float
                    shelf =
                        243 + 33 * sin (x / 3700 + sin (y / 5900 + coast.phase)) + 24 * cos (y / 3100 + x / 7600 + coast.second)

                    blended : Float
                    blended =
                        old + (shelf - old) * blend

                    ashore : Float
                    ashore =
                        if coast.mainland - 5600 < y then
                            let
                                shore : Float
                                shore =
                                    coast.mainland + 2500 * sin (x / 5200 + coast.phase) + 1300 * sin (x / 1900 + coast.second) + 440 * sin (x / 670 + coast.phase)
                            in
                            M.min blended ((shore - y) * 0.12)

                        else
                            blended

                    island : Island -> Float -> Float
                    island i depth =
                        let
                            dx : Float
                            dx =
                                x - i.x

                            dy : Float
                            dy =
                                y - i.y

                            reach : Float
                            reach =
                                i.length * 2.5 + i.width
                        in
                        if reach < M.abs dx || reach < M.abs dy then
                            depth

                        else
                            let
                                u : Float
                                u =
                                    (dx * i.cos + dy * i.sin) / i.length

                                v : Float
                                v =
                                    (dy * i.cos - dx * i.sin) / i.width

                                bend : Float
                                bend =
                                    v + 0.24 * sin (2.9 * u + i.phase) + 0.08 * sin (5 * u + i.phase)
                            in
                            depth - blend * i.height * exp (-1.3 * (u * u + bend * bend))
                in
                M.max -360 (List.foldl island ashore coast.islands)


type alias Outcrop =
    { x : Float, y : Float, length : Float, width : Float, height : Float, heading : Float }


{-| Fixed landmarks around a site, shared by the wreck scenery and the
acoustic recorders.
-}
shelfOutcrops : { a | x : Float, y : Float } -> Float -> List Outcrop
shelfOutcrops site seed =
    List.map
        (\i ->
            let
                angle : Float
                angle =
                    hash01 seed (19800 + i) * pi * 2

                range : Float
                range =
                    65 + hash01 seed (19820 + i) * 310
            in
            { x = site.x + sin angle * range
            , y = site.y + cos angle * range
            , length = 8 + hash01 seed (19840 + i) * 22
            , width = 4 + hash01 seed (19860 + i) * 8
            , height = 3 + hash01 seed (19880 + i) * 10
            , heading = angle * 180 / pi
            }
        )
        (List.map toFloat (List.range 0 11))
