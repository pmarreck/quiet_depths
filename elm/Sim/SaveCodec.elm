module Sim.SaveCodec exposing (andMap, optional, point)

{-| Small pieces every save decoder shares.
-}

import Json.Decode as D


{-| Applies a decoded field to a decoded constructor, for records too wide
for `D.map8`.
-}
andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


{-| A field that may be absent; when present it must decode, so a malformed
value is refused rather than read as absent.
-}
optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key valueDecoder =
    D.oneOf [ D.field key D.value |> D.map (\_ -> True), D.succeed False ]
        |> D.andThen
            (\present ->
                if present then
                    D.map Just (D.field key valueDecoder)

                else
                    D.succeed Nothing
            )


point : D.Decoder { x : Float, y : Float }
point =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)
