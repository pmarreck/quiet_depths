port module OperationCard exposing (main)

{-| The on-station card for rescue and survey missions: the range to the site,
the current advice, and the orders to start the rescue, plot the approach or
hold position. JavaScript measures the site and says which orders may be given
now; this view decides what the card shows and sends the orders back.
-}

import Browser
import Html exposing (Html, button, div, p, section, span, text)
import Html.Attributes exposing (class, classList, disabled, hidden, id)
import Html.Events exposing (onClick)


type alias Reading =
    { operation : Bool
    , survey : Bool
    , completed : Bool
    , underway : Bool
    , range : String
    , advice : String
    , startEnabled : Bool
    , approachEnabled : Bool
    , holdEnabled : Bool
    }


port operationReading : (Reading -> msg) -> Sub msg


port operationOrder : String -> Cmd msg


type Msg
    = Read Reading
    | Give String


update : Msg -> Maybe Reading -> ( Maybe Reading, Cmd Msg )
update msg reading =
    case msg of
        Read next ->
            ( Just next, Cmd.none )

        Give order ->
            ( reading, operationOrder order )


{-| A survey has no rescue to start; a rescue shows its start until it is
complete, and says so while it is under way.
-}
startButton : Reading -> Html Msg
startButton r =
    button
        [ id "start-rescue"
        , hidden (not r.operation || r.survey || r.completed)
        , disabled (not r.startEnabled)
        , onClick (Give "start-rescue")
        ]
        [ text
            (if r.underway then
                "RESCUE UNDERWAY"

             else
                "START RESCUE HERE"
            )
        ]


{-| Until the first reading the card is the page's original, hidden markup.
-}
view : Maybe Reading -> Html Msg
view reading =
    case reading of
        Nothing ->
            section [ id "operation-card", class "operation-card hidden" ]
                [ div [ class "section-heading" ] [ text "ON STATION ", span [ id "operation-range" ] [] ]
                , p [ id "operation-advice" ] []
                , button [ id "start-rescue", onClick (Give "start-rescue") ] [ text "START RESCUE HERE" ]
                , button [ id "approach-site", onClick (Give "approach") ] [ text "PLOT RESCUE APPROACH" ]
                , button [ id "hold-position", onClick (Give "hold") ] [ text "ALL STOP / HOLD DEPTH" ]
                ]

        Just r ->
            section [ id "operation-card", classList [ ( "operation-card", True ), ( "hidden", not r.operation ) ] ]
                [ div [ class "section-heading" ] [ text "ON STATION ", span [ id "operation-range" ] [ text r.range ] ]
                , p [ id "operation-advice" ] [ text r.advice ]
                , startButton r
                , button [ id "approach-site", disabled (not r.approachEnabled), onClick (Give "approach") ]
                    [ text
                        (if r.survey then
                            "PLOT SURVEY APPROACH"

                         else
                            "PLOT RESCUE APPROACH"
                        )
                    ]
                , button [ id "hold-position", disabled (not r.holdEnabled), onClick (Give "hold") ] [ text "ALL STOP / HOLD DEPTH" ]
                ]


main : Program () (Maybe Reading) Msg
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> operationReading Read
        }
