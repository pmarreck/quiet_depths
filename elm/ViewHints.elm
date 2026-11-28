port module ViewHints exposing (Model, Reading, main)

{-| The line under the station's view: how to work the view, and its range
or the vehicle's figures. JavaScript words both; this view shows them.
-}

import Browser
import Html exposing (Html, div, span, text)
import Html.Attributes exposing (class, id)


type alias Reading =
    { hint : String, range : String }


port hintsReading : (Reading -> msg) -> Sub msg


type alias Model =
    Reading


view : Model -> Html Reading
view r =
    div [ class "view-bottom" ] [ span [ id "view-hint" ] [ text r.hint ], span [ id "view-range" ] [ text r.range ] ]


main : Program () Model Reading
main =
    Browser.element
        { init = \_ -> ( { hint = "DRAG TO LOOK AROUND / SCROLL TO ZOOM", range = "VISIBILITY 6.5 KM" }, Cmd.none )
        , update = \reading _ -> ( reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> hintsReading identity
        }
