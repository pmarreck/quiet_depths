port module StationStrip exposing (main)

{-| The strip under the main view: what the boat is doing at a glance, the
weather and sea, and the date and time. JavaScript measures and formats the
figures each frame; this view decides which station status applies.
-}

import Browser
import Html exposing (Html, b, div, i, span, text)
import Html.Attributes exposing (class, id)


type alias Reading =
    { bottomed : Bool, surfaced : Bool, depth : Float, silent : Bool, weather : String, time : String }


port stationReading : (Reading -> msg) -> Sub msg


{-| The first that applies, in this order.
-}
type Station
    = Bottomed
    | Surfaced
    | PeriscopeDepth
    | SilentRunning
    | Submerged


station : Reading -> Station
station r =
    if r.bottomed then
        Bottomed

    else if r.surfaced then
        Surfaced

    else if r.depth <= 15 then
        PeriscopeDepth

    else if r.silent then
        SilentRunning

    else
        Submerged


stationText : Station -> String
stationText s =
    case s of
        Bottomed ->
            "RESTING ON THE BOTTOM"

        Surfaced ->
            "SURFACED · EXPOSED"

        PeriscopeDepth ->
            "PERISCOPE DEPTH"

        SilentRunning ->
            "SILENT RUNNING"

        Submerged ->
            "SUBMERGED"


{-| Until the first reading the strip shows the page's original markup.
-}
view : Maybe Reading -> Html msg
view reading =
    div [ class "station-strip" ]
        (case reading of
            Nothing ->
                [ span [] [ i [ class "status-light" ] [], text " ", b [ id "station-status" ] [ text "PERISCOPE DEPTH" ] ]
                , span [ id "weather" ] [ text "SEA STATE 3 ", span [] [ text " / " ], text " DUSK" ]
                , span [ id "sim-time" ] [ text "18:42:00" ]
                ]

            Just r ->
                [ span [] [ i [ class "status-light" ] [], text " ", b [ id "station-status" ] [ text (stationText (station r)) ] ]
                , span [ id "weather" ] [ text r.weather ]
                , span [ id "sim-time" ] [ text r.time ]
                ]
        )


main : Program () (Maybe Reading) Reading
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = \reading _ -> ( Just reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> stationReading identity
        }
