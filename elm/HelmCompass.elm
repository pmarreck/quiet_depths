port module HelmCompass exposing (main)

{-| The widescreen helm compass. The card turns so the actual heading is
always at the top. A red and black needle marks north on the card, and a gold
marker on the rim shows the requested heading. Pointer steering is handled by
the TypeScript adapter, so this program only draws what the helm reports.
-}

import Browser
import Html exposing (Html, b, div, i, span, text)
import Html.Attributes exposing (class, style)


port compassReading : (Reading -> msg) -> Sub msg


type alias Reading =
    { heading : Float
    , requested : Float
    }


main : Program () Reading Reading
main =
    Browser.element
        { init = \() -> ( { heading = 0, requested = 0 }, Cmd.none )
        , update = \reading _ -> ( reading, Cmd.none )
        , subscriptions = \_ -> compassReading identity
        , view = view
        }


rotate : Float -> Html.Attribute msg
rotate degrees =
    style "transform" ("rotate(" ++ String.fromFloat degrees ++ "deg)")


cardLabel : Int -> String
cardLabel degrees =
    case degrees of
        0 ->
            "N"

        90 ->
            "E"

        180 ->
            "S"

        270 ->
            "W"

        _ ->
            String.fromInt (degrees // 10)


tick : Int -> Html msg
tick degrees =
    i
        [ class
            (if modBy 30 degrees == 0 then
                "compass-tick major"

             else
                "compass-tick"
            )
        , rotate (toFloat degrees)
        ]
        []


label : Int -> Html msg
label degrees =
    span [ class "compass-label", rotate (toFloat degrees) ] [ b [] [ text (cardLabel degrees) ] ]


threeDigits : Float -> String
threeDigits degrees =
    String.padLeft 3 '0' (String.fromInt (modBy 360 (round degrees)))


view : Reading -> Html Reading
view reading =
    div [ class "helm-compass" ]
        [ div [ class "compass-card", rotate -reading.heading ]
            (List.map tick (List.range 0 35 |> List.map ((*) 10))
                ++ List.map label (List.range 0 11 |> List.map ((*) 30))
                ++ [ div [ class "compass-needle" ] [ i [ class "needle-north" ] [], i [ class "needle-south" ] [] ] ]
            )
        , i [ class "compass-request", rotate (reading.requested - reading.heading) ] []
        , i [ class "compass-lubber" ] []
        , b [ class "compass-readout" ] [ text (threeDigits reading.heading ++ "°") ]
        ]
