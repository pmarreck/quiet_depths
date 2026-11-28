port module ViewHeader exposing (Model, Reading, main)

{-| The header over the station's view: the station and what it shows, a
telegram being copied by lamp, whether the feed is live, the periscope's
view against the bow with an order turning the boat to it, and the compass
strip and true heading of the view. JavaScript words each part; this view
lays them out as the page's stylesheets expect.
-}

import Browser
import Html exposing (Html, b, div, small, span, text)
import Html.Attributes exposing (class, classList, hidden, id)


type alias Reading =
    { label : String
    , subtitle : String
    , lamp : String
    , lampShown : Bool
    , tag : String
    , bowShown : Bool
    , bearings : String
    , relative : String
    , turning : Bool
    , compassShown : Bool
    , marks : List String
    , look : String
    }


port headerReading : (Reading -> msg) -> Sub msg


type alias Model =
    Maybe Reading


{-| Until the first reading, the page's original markup.
-}
before : Reading
before =
    { label = "OPTICAL OBSERVATION"
    , subtitle = "PERISCOPE RAISED · 6× OPTICS"
    , lamp = ""
    , lampShown = False
    , tag = "LIVE FEED"
    , bowShown = False
    , bearings = ""
    , relative = ""
    , turning = False
    , compassShown = True
    , marks = [ "330", "000", "030", "060", "090" ]
    , look = "032°"
    }


view : Model -> Html Reading
view model =
    let
        r : Reading
        r =
            Maybe.withDefault before model
    in
    div [ class "sight-header" ]
        [ div [ class "view-top" ]
            [ div []
                [ span [ class "live-dot" ] []
                , text " "
                , b [ id "view-label" ] [ text r.label ]
                , small [ id "view-subtitle" ] [ text r.subtitle ]
                , small [ id "lamp-copy", hidden (not r.lampShown) ] [ text r.lamp ]
                ]
            , span [ class "view-tag", id "view-tag" ] [ text r.tag ]
            ]
        , div [ id "bow-readout", class "bow-readout", classList [ ( "hidden", not r.bowShown ) ] ]
            [ span [ id "sight-bearings" ] [ text r.bearings ]
            , text " "
            , span [ id "sight-relative" ] [ text r.relative ]
            , text " "
            , span [ id "sight-order", hidden (not r.turning) ] [ text "SUB TURNING TO VIEW" ]
            ]
        , div [ class "compass", id "compass", classList [ ( "hidden", not r.compassShown ) ] ] (List.map (\m -> span [] [ text m ]) r.marks)
        , div [ class "look-heading", id "look-heading", classList [ ( "hidden", not r.compassShown ) ] ] [ text r.look ]
        ]


main : Program () Model Reading
main =
    Browser.element
        { init = \_ -> ( Nothing, Cmd.none )
        , update = \reading _ -> ( Just reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> headerReading identity
        }
