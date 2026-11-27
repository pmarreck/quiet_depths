port module FooterStatus exposing (main)

{-| The status group in the bottom bar: how suspicious the enemy is, when the
patrol's difficulty shows it, and the boat's self noise and keel clearance.
JavaScript measures and words the figures; this view decides when suspicion
reads as dangerous.
-}

import Browser
import Html exposing (Html, b, div, span, text)
import Html.Attributes exposing (class, hidden, id, style)


type alias Reading =
    { show : Bool, alert : Float, alertText : String, noiseText : String, clearanceText : String }


port footerReading : (Reading -> msg) -> Sub msg


{-| Suspicion above 30% turns the readout red.
-}
alertColor : Reading -> String
alertColor r =
    if r.alert > 30 then
        "var(--red)"

    else
        "var(--green)"


{-| Until the first reading the group shows the page's original markup.
-}
view : Maybe Reading -> Html msg
view reading =
    case reading of
        Nothing ->
            div []
                [ span [ id "alert-dot", class "status-light" ] []
                , text " "
                , b [ id "alert-label" ] [ text "UNDETECTED" ]
                , span [ class "footer-rule" ] []
                , span [ id "noise-value" ] [ text "SELF NOISE 14 dB" ]
                , span [ class "footer-rule" ] []
                , span [ id "clearance" ] [ text "KEEL CLEARANCE 218 m" ]
                ]

        Just r ->
            div []
                [ span [ id "alert-dot", class "status-light", hidden (not r.show), style "background" (alertColor r) ] []
                , text " "
                , b [ id "alert-label", hidden (not r.show), style "color" (alertColor r) ] [ text r.alertText ]
                , span [ class "footer-rule" ] []
                , span [ id "noise-value" ] [ text r.noiseText ]
                , span [ class "footer-rule" ] []
                , span [ id "clearance" ] [ text r.clearanceText ]
                ]


main : Program () (Maybe Reading) Reading
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = \reading _ -> ( Just reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> footerReading identity
        }
