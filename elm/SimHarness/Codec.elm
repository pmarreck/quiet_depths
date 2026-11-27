module SimHarness.Codec exposing (andMap, arg, call1, call2, call3, call5, flag, maybe, point, position3, safeInt, surfaceShip, vesselKind, wholeNumber)

{-| Decoding a call's arguments and encoding its result, shared by the harness tables. -}

import Json.Decode as D
import Json.Encode as E
import Sim.Vessel as Vessel


arg : Int -> D.Decoder a -> D.Decoder a
arg =
    D.index


call1 : D.Decoder a -> (r -> E.Value) -> (a -> r) -> D.Decoder E.Value
call1 a encode f =
    D.map (f >> encode) (arg 0 a)


call2 : D.Decoder a -> D.Decoder b -> (r -> E.Value) -> (a -> b -> r) -> D.Decoder E.Value
call2 a b encode f =
    D.map2 (\x y -> encode (f x y)) (arg 0 a) (arg 1 b)


call3 : D.Decoder a -> D.Decoder b -> D.Decoder c -> (r -> E.Value) -> (a -> b -> c -> r) -> D.Decoder E.Value
call3 a b c encode f =
    D.map3 (\x y z -> encode (f x y z)) (arg 0 a) (arg 1 b) (arg 2 c)


call5 : D.Decoder a -> D.Decoder b -> D.Decoder c -> D.Decoder d -> D.Decoder e -> (r -> E.Value) -> (a -> b -> c -> d -> e -> r) -> D.Decoder E.Value
call5 a b c d e encode f =
    D.map5 (\v w x y z -> encode (f v w x y z)) (arg 0 a) (arg 1 b) (arg 2 c) (arg 3 d) (arg 4 e)


maybe : (a -> E.Value) -> Maybe a -> E.Value
maybe encode =
    Maybe.map encode >> Maybe.withDefault E.null


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


point : D.Decoder { x : Float, y : Float }
point =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)


position3 : D.Decoder { x : Float, y : Float, depth : Float }
position3 =
    D.map3 (\x y depth -> { x = x, y = y, depth = depth }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float)


flag : String -> D.Decoder Bool
flag name =
    D.maybe (D.field name D.bool) |> D.map (Maybe.withDefault False)


surfaceShip : D.Decoder Vessel.SurfaceShip
surfaceShip =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "merchant" ->
                        D.succeed Vessel.Merchant

                    "escort" ->
                        D.succeed Vessel.Escort

                    "fishing" ->
                        D.succeed Vessel.Fishing

                    "carrier" ->
                        D.succeed Vessel.Carrier

                    _ ->
                        D.fail ("not a surface ship: " ++ name)
            )


vesselKind : D.Decoder Vessel.Kind
vesselKind =
    D.oneOf [ D.string |> D.andThen (\k -> if k == "sub" then D.succeed Vessel.Submarine else D.fail "surface"), D.map Vessel.Surface surfaceShip ]


{-| JavaScript's `Number.isInteger`: a finite whole number of any size. -}
wholeNumber : D.Decoder Int
wholeNumber =
    D.float
        |> D.andThen
            (\f ->
                if isNaN f || isInfinite f || toFloat (round f) /= f then
                    D.fail "not a whole number"

                else
                    D.succeed (round f)
            )


{-| JavaScript's `Number.isSafeInteger`: a whole number of at most 2^53 - 1. -}
safeInt : D.Decoder Int
safeInt =
    wholeNumber
        |> D.andThen
            (\n ->
                if Basics.abs (toFloat n) <= 9007199254740991 then
                    D.succeed n

                else
                    D.fail "not a safe integer"
            )
