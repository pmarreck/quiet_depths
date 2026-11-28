port module Bench.Geometry exposing (main)

{-| What the number-type pilot costs: `Sim.CombatGeometry`'s ship-box and
sphere tests, written with `Sim.Finite`, against the same functions as Floats
before the pilot (`Bench.GeometryFloat`). Both run over one fixed corpus of
paths shaped like the differential tests', and each run returns a checksum of
the results, which must match between the two.

A measurement, not a test; `scripts/elm-geometry-bench.mjs` drives it.

-}

import Bench.GeometryFloat as Before
import Json.Decode as D
import Json.Encode as E
import Sim.CombatGeometry as After
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


port request : (D.Value -> msg) -> Sub msg


port reply : E.Value -> Cmd msg


type alias Point =
    Before.Aloft


type alias Ship =
    { x : Float, y : Float, heading : Float, sinkDepth : Float, depth : Maybe Float }


type alias BoxCase =
    { from : Point, to : Point, ship : Ship, kind : Maybe Kind }


type alias SphereCase =
    { from : Point, to : Point, body : Point, radius : Float }


{-| The next state of a linear congruential generator, and its draw in [0, 1).
-}
draw : Int -> ( Float, Int )
draw state =
    let
        next : Int
        next =
            modBy 4294967296 (state * 1664525 + 1013904223)
    in
    ( toFloat next / 4294967296, next )


{-| A list of `count` values, each drawn from the generator's state.
-}
generate : Int -> (Int -> ( a, Int )) -> Int -> List a
generate count make seed =
    List.foldl (\_ ( items, state ) -> make state |> Tuple.mapFirst (\item -> item :: items)) ( [], seed ) (List.range 1 count)
        |> Tuple.first


{-| Draws `count` numbers in [0, 1) and passes them on as a list.
-}
draws : Int -> Int -> ( List Float, Int )
draws count seed =
    List.foldl (\_ ( values, state ) -> draw state |> Tuple.mapFirst (\v -> v :: values)) ( [], seed ) (List.range 1 count)


kinds : List (Maybe Kind)
kinds =
    [ Just (Surface Merchant), Just (Surface Escort), Just (Surface Fishing), Just (Surface Carrier), Just Submarine, Nothing ]


boxCase : Int -> ( BoxCase, Int )
boxCase seed =
    case draws 12 seed of
        ( [ a, b, c, d, e, f, g, h, i, j, k, l ], next ) ->
            let
                ship : Ship
                ship =
                    { x = (a - 0.5) * 400, y = (b - 0.5) * 400, heading = c * 360, sinkDepth = d * 30, depth = Just (e * 120) }
            in
            ( { from = { x = ship.x + (f - 0.5) * 400, y = ship.y + (g - 0.5) * 400, altitude = h * 60 - 20 }
              , to = { x = ship.x + (i - 0.5) * 400, y = ship.y + (j - 0.5) * 400, altitude = k * 60 - 20 }
              , ship = ship
              , kind = List.drop (floor (l * 6)) kinds |> List.head |> Maybe.withDefault Nothing
              }
            , next
            )

        ( _, next ) ->
            ( { from = Before.Aloft 0 0 0, to = Before.Aloft 0 0 0, ship = Ship 0 0 0 0 Nothing, kind = Nothing }, next )


sphereCase : Int -> ( SphereCase, Int )
sphereCase seed =
    case draws 10 seed of
        ( [ a, b, c, d, e, f, g, h, i, j ], next ) ->
            ( { from = { x = (a - 0.5) * 100, y = (b - 0.5) * 100, altitude = c * 50 }
              , to = { x = (d - 0.5) * 100, y = (e - 0.5) * 100, altitude = f * 50 }
              , body = { x = (g - 0.5) * 60, y = (h - 0.5) * 60, altitude = i * 40 }
              , radius = j * 30
              }
            , next
            )

        ( _, next ) ->
            ( { from = Before.Aloft 0 0 0, to = Before.Aloft 0 0 0, body = Before.Aloft 0 0 0, radius = 0 }, next )


boxes : List BoxCase
boxes =
    generate 5000 boxCase 91


spheres : List SphereCase
spheres =
    generate 5000 sphereCase 92


{-| A hit counts 1 plus its fraction, a miss nothing.
-}
score : Maybe Float -> Float
score hit =
    case hit of
        Just t ->
            1 + t

        Nothing ->
            0


{-| Runs one variant over its corpus `rounds` times; the checksum of the results.
-}
run : String -> Int -> Maybe Float
run variant rounds =
    let
        repeat : (Float -> Float) -> Float
        repeat pass =
            List.foldl (\_ total -> pass total) 0 (List.range 1 rounds)
    in
    case variant of
        "box-float" ->
            Just (repeat (\total -> List.foldl (\c sum -> sum + score (Before.shipHit c.from c.to c.ship c.kind)) total boxes))

        "box-finite" ->
            Just (repeat (\total -> List.foldl (\c sum -> sum + score (After.shipHit c.from c.to c.ship c.kind)) total boxes))

        "sphere-float" ->
            Just (repeat (\total -> List.foldl (\c sum -> sum + score (Before.sphereHit c.from c.to c.body c.radius)) total spheres))

        "sphere-finite" ->
            Just (repeat (\total -> List.foldl (\c sum -> sum + score (After.sphereHit c.from c.to c.body c.radius)) total spheres))

        _ ->
            Nothing


main : Program () () D.Value
main =
    Platform.worker
        { init = \_ -> ( (), Cmd.none )
        , update =
            \raw _ ->
                ( ()
                , reply
                    (case D.decodeValue (D.map2 run (D.field "variant" D.string) (D.field "rounds" D.int)) raw of
                        Ok (Just v) ->
                            E.float v

                        _ ->
                            E.null
                    )
                )
        , subscriptions = \_ -> request identity
        }
