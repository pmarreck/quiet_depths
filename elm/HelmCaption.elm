port module HelmCaption exposing (main)

{-| The caption above the helm: whose helm it is, and the key to the actual and
requested ticks on its sliders.
-}

import Browser
import Html exposing (Html, b, div, i, span, text)
import Html.Attributes exposing (class, id)


type alias Reading =
    { drone : Bool, mode : String }


port helmCaptionReading : (Reading -> msg) -> Sub msg


type Helm
    = Submarine
    | DroneRemote
    | DroneReturning
    | DroneOffline


helm : Reading -> Helm
helm r =
    if not r.drone then
        Submarine

    else if r.mode == "remote" then
        DroneRemote

    else if r.mode == "return" then
        DroneReturning

    else
        DroneOffline


helmText : Helm -> String
helmText h =
    case h of
        Submarine ->
            "SUBMARINE HELM"

        DroneRemote ->
            "DRONE HELM"

        DroneReturning ->
            "DRONE · AUTO RETURN"

        DroneOffline ->
            "DRONE · OFFLINE"


view : Reading -> Html msg
view r =
    div [ class "helm-caption" ]
        [ b [ id "helm-mode" ] [ text (helmText (helm r)) ]
        , span [] [ i [ class "actual-key" ] [], text " ACTUAL ", i [ class "request-key" ] [], text " REQUESTED" ]
        ]


main : Program () Reading Reading
main =
    Browser.element
        { init = \() -> ( { drone = False, mode = "" }, Cmd.none )
        , update = \reading _ -> ( reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> helmCaptionReading identity
        }
