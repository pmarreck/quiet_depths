port module HelmPropulsion exposing (main)

{-| The propulsion group of the submarine helm: electric or diesel drive, the
diesel power routing, silent running and the plant's status line. JavaScript
sends a reading each frame, including which orders may be given now, and
carries out the orders this view sends back.
-}

import Browser
import Html exposing (Html, button, div, i, kbd, label, option, select, span, text)
import Html.Attributes exposing (attribute, class, classList, disabled, hidden, id, selected, value)
import Html.Events exposing (on, onClick, targetValue)
import Json.Decode as Decode


type alias Mode =
    { value : String, label : String }


type alias Reading =
    { engine : String
    , silent : Bool
    , dieselMode : String
    , modes : List Mode
    , routing : Bool
    , hint : String
    , electricEnabled : Bool
    , dieselEnabled : Bool
    , silentEnabled : Bool
    , routingEnabled : Bool
    }


type alias Order =
    { kind : String, value : String }


port propulsionReading : (Reading -> msg) -> Sub msg


port propulsionOrder : Order -> Cmd msg


type Msg
    = Read Reading
    | Give Order


{-| Matches the boat's state at the start of every patrol until the first reading.
-}
initial : Reading
initial =
    { engine = "electric"
    , silent = False
    , dieselMode = "charge"
    , modes = []
    , routing = False
    , hint = "Quiet motors. Battery draining."
    , electricEnabled = True
    , dieselEnabled = True
    , silentEnabled = True
    , routingEnabled = False
    }


update : Msg -> Reading -> ( Reading, Cmd Msg )
update msg reading =
    case msg of
        Read next ->
            ( next, Cmd.none )

        Give order ->
            ( reading, propulsionOrder order )


engineButton : Reading -> String -> String -> Bool -> Html Msg
engineButton reading engine caption enabled =
    button
        [ id engine
        , classList [ ( "active", reading.engine == engine ) ]
        , disabled (not enabled)
        , onClick (Give { kind = "engine", value = engine })
        ]
        [ text caption ]


view : Reading -> Html Msg
view reading =
    div [ class "propulsion-controls" ]
        [ div [ class "control-label power-heading" ]
            [ text "PROPULSION "
            , label [ class "diesel-routing", hidden (not reading.routing) ]
                [ select
                    [ id "diesel-mode"
                    , attribute "aria-label" "Diesel power"
                    , disabled (not reading.routingEnabled)
                    , on "change" (Decode.map (\mode -> Give { kind = "dieselMode", value = mode }) targetValue)
                    ]
                    (List.map
                        (\mode -> option [ value mode.value, selected (mode.value == reading.dieselMode) ] [ text mode.label ])
                        reading.modes
                    )
                ]
            ]
        , div [ class "engine-switch" ]
            [ engineButton reading "electric" "ELECTRIC" reading.electricEnabled
            , engineButton reading "diesel" "DIESEL" reading.dieselEnabled
            ]
        , button
            [ id "silent"
            , classList [ ( "silent-button", True ), ( "active", reading.silent ) ]
            , disabled (not reading.silentEnabled)
            , onClick (Give { kind = "silent", value = "" })
            ]
            [ i [] [], text " SILENT RUNNING ", kbd [] [ text "R" ] ]
        , span [ class "ordered", id "engine-hint" ] [ text reading.hint ]
        ]


main : Program () Reading Msg
main =
    Browser.element
        { init = \() -> ( initial, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> propulsionReading Read
        }
