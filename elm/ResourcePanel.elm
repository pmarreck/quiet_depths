port module ResourcePanel exposing (main)

{-| The battery, oxygen and diesel fuel gauges. JavaScript measures each level
and words it, including a damaged store's reduced capacity; this view draws
the bars and decides when a level reads as low.
-}

import Browser
import Html exposing (Html, b, div, i, section, span, text)
import Html.Attributes exposing (class, id, style)


type alias Gauge =
    { key : String, level : Float, text : String }


type alias Reading =
    { gauges : List Gauge }


port resourceReading : (Reading -> msg) -> Sub msg


label : String -> String
label key =
    case key of
        "battery" ->
            "▰ \u{00A0} BATTERY"

        "oxygen" ->
            "◌ \u{00A0} OXYGEN"

        _ ->
            "◒ \u{00A0} DIESEL FUEL"


{-| Below 20% a store reads red.
-}
levelColor : Float -> String
levelColor level =
    if level < 20 then
        "var(--red)"

    else
        ""


gauge : Gauge -> Html msg
gauge g =
    div [ class "resource" ]
        [ span [] [ text (label g.key) ]
        , b [ id (g.key ++ "-value"), style "color" (levelColor g.level) ] [ text g.text ]
        , div [ class "bar" ] [ i [ id (g.key ++ "-bar"), style "width" (String.fromFloat g.level ++ "%") ] [] ]
        ]


{-| The page's original markup, shown until the first reading.
-}
original : List (Html msg)
original =
    List.map
        (\( key, value ) ->
            div [ class "resource" ]
                [ span [] [ text (label key) ], b [ id (key ++ "-value") ] [ text value ], div [ class "bar" ] [ i [ id (key ++ "-bar") ] [] ] ]
        )
        [ ( "battery", "92%" ), ( "oxygen", "100%" ), ( "fuel", "86%" ) ]


view : Maybe Reading -> Html msg
view reading =
    section [ class "resources" ]
        (case reading of
            Nothing ->
                original

            Just r ->
                List.map gauge r.gauges
        )


main : Program () (Maybe Reading) Reading
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = \reading _ -> ( Just reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> resourceReading identity
        }
