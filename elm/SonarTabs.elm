port module SonarTabs exposing (main)

import Browser
import Html exposing (button, div, text)
import Html.Attributes exposing (attribute, class, type_)
import Html.Events exposing (onClick)


type Instrument
    = Bearings
    | Scribbler
    | Painter


label : Instrument -> String
label instrument =
    case instrument of
        Bearings ->
            "Bearings"

        Scribbler ->
            "Scribbler"

        Painter ->
            "Painter"


port chooseSonar : String -> Cmd msg

port restoreSonarTab : (String -> msg) -> Sub msg


main : Program () Instrument Instrument
main =
    Browser.element
        { init = \_ -> ( Bearings, Cmd.none )
        , update = \instrument _ -> ( instrument, chooseSonar (String.toLower (label instrument)) )
        , subscriptions = \_ -> restoreSonarTab (\name -> case name of
                "scribbler" -> Scribbler
                "painter" -> Painter
                _ -> Bearings
            )
        , view = \selected ->
            let
                tab instrument =
                    button
                        [ type_ "button", onClick instrument
                        , attribute "aria-pressed" (if selected == instrument then "true" else "false")
                        ] [ text (label instrument) ]
            in
            div []
                [ div [ class "sonar-tabs", attribute "role" "group", attribute "aria-label" "Sonar instruments" ]
                    (List.map tab [ Bearings, Scribbler, Painter ])
                , case selected of
                    Scribbler ->
                        div [ class "scribbler-key", attribute "id" "scribbler-key" ]
                            [ text "The center magnifies the seabed under your keel. Scroll to review." ]

                    _ ->
                        text ""
                ]
        }
