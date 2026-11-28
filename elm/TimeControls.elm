port module TimeControls exposing (Model, Msg, Order, Reading, main)

{-| The time controls in the footer: time compression at 1, 5 or 20 times,
and how the local autosave stands. JavaScript says the rate, whether it may
be changed now and the save's state; this view shows them and sends a
chosen rate back.
-}

import Browser
import Html exposing (Html, button, div, span, text)
import Html.Attributes exposing (attribute, class, classList, disabled, id)
import Html.Events exposing (onClick)


type alias Reading =
    { rate : Int, enabled : Bool, save : String, handled : Int }


type alias Order =
    { rate : Int, seq : Int }


port timeReading : (Reading -> msg) -> Sub msg


port timeOrder : Order -> Cmd msg


{-| A rate the player has chosen is held until a reading reports that order
handled, so a reading sent before it cannot move the choice back.
-}
type alias Model =
    { reading : Reading, seq : Int, pending : Maybe Int }


type Msg
    = Read Reading
    | Choose Int


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Read reading ->
            case model.pending of
                Just rate ->
                    if reading.handled >= model.seq then
                        ( { model | reading = reading, pending = Nothing }, Cmd.none )

                    else
                        ( { model | reading = { reading | rate = rate } }, Cmd.none )

                Nothing ->
                    ( { model | reading = reading }, Cmd.none )

        Choose rate ->
            let
                reading : Reading
                reading =
                    model.reading
            in
            ( { model | seq = model.seq + 1, pending = Just rate, reading = { reading | rate = rate } }, timeOrder { rate = rate, seq = model.seq + 1 } )


rates : List Int
rates =
    [ 1, 5, 20 ]


view : Model -> Html Msg
view { reading } =
    div [ class "time-controls" ]
        (span [] [ text "TIME" ]
            :: List.map
                (\rate ->
                    button [ attribute "data-time" (String.fromInt rate), classList [ ( "active", rate == reading.rate ) ], disabled (not reading.enabled), onClick (Choose rate) ]
                        [ text (String.fromInt rate ++ "×") ]
                )
                rates
            ++ [ span [ class "footer-rule" ] [], span [ id "save-status" ] [ text reading.save ] ]
        )


main : Program () Model Msg
main =
    Browser.element
        { init = \_ -> ( { reading = { rate = 1, enabled = True, save = "LOCAL AUTOSAVE", handled = 0 }, seq = 0, pending = Nothing }, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> timeReading Read
        }
