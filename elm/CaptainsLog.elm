port module CaptainsLog exposing (main)

{-| The captain's log panel: the newest entries first, each with its patrol
time. Rows are keyed so an arriving entry adds one row instead of redrawing
the list. JavaScript keys and formats the entries and keeps a reader who is at
the top of the list there as entries arrive.
-}

import Browser
import Html exposing (Html, div, node, section, span, text)
import Html.Attributes exposing (attribute, class, id, tabindex)
import Html.Keyed as Keyed


type alias Entry =
    { key : String, kind : String, time : String, text : String }


type alias Reading =
    { count : String, entries : List Entry }


port logReading : (Reading -> msg) -> Sub msg


row : Entry -> ( String, Html msg )
row entry =
    ( entry.key
    , div [ class ("log-entry " ++ entry.kind) ] [ node "time" [] [ text entry.time ], span [] [ text entry.text ] ]
    )


{-| Until the first reading the panel shows the page's original markup.
-}
view : Reading -> Html msg
view reading =
    section [ class "log-panel" ]
        [ div [ class "section-heading" ] [ text "CAPTAIN’S LOG ", span [ id "log-count" ] [ text reading.count ] ]
        , Keyed.node "div"
            [ id "log", attribute "role" "log", attribute "aria-label" "Captain’s log entries", tabindex 0 ]
            (List.map row reading.entries)
        ]


main : Program () Reading Reading
main =
    Browser.element
        { init = \() -> ( { count = "01", entries = [] }, Cmd.none )
        , update = \reading _ -> ( reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> logReading identity
        }
