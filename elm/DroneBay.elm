port module DroneBay exposing (main)

{-| The drone bay panel: the drone's mode, its charge and part condition, and
advice that depends on where the drone is. JavaScript measures and formats the
figures each frame; this view decides which advice applies.
-}

import Browser
import Html exposing (Html, b, div, p, section, span, text)
import Html.Attributes exposing (class, classList, id)


type alias Part =
    { name : String, label : String }


type alias Reading =
    { mode : String
    , charge : String
    , parts : List Part
    , lostReason : String
    , deployReason : String
    , link : String
    , buoyancy : String
    }


port droneBayReading : (Reading -> msg) -> Sub msg


{-| Lost and stowed drones get their own advice; every other mode means the
drone is outside the boat on its tether link.
-}
type Bay
    = Lost
    | Stowed
    | Outside


bay : String -> Bay
bay mode =
    if mode == "lost" then
        Lost

    else if mode == "stowed" then
        Stowed

    else
        Outside


advice : Reading -> String
advice r =
    case bay r.mode of
        Lost ->
            r.lostReason

        Stowed ->
            if r.deployReason == "" then
                "READY · 280 M MAX · DEPLOY ≤3 KN"

            else
                r.deployReason

        Outside ->
            r.link ++ " / 100 M LINK · BUOYANCY " ++ r.buoyancy ++ "%"


metric : String -> String -> Html msg
metric name value =
    span [] [ text (name ++ " "), b [] [ text value ] ]


{-| Until the first reading the panel shows the page's original markup: a
stowed drone with no figures or advice.
-}
view : Maybe Reading -> Html msg
view reading =
    section [ class "drone-bay" ]
        (case reading of
            Nothing ->
                [ div [ class "section-heading" ] [ text "DRONE BAY ", span [ id "drone-bay-mode" ] [ text "STOWED" ] ]
                , div [ id "drone-bay-metrics" ] []
                , p [ id "drone-bay-advice" ] []
                ]

            Just r ->
                [ div [ class "section-heading" ]
                    [ text "DRONE BAY "
                    , span [ id "drone-bay-mode", classList [ ( "damaged", bay r.mode == Lost ) ] ] [ text (String.toUpper r.mode) ]
                    ]
                , div [ id "drone-bay-metrics" ] (metric "CHARGE" (r.charge ++ "%") :: List.map (\part -> metric part.name part.label) r.parts)
                , p [ id "drone-bay-advice" ] [ text (advice r) ]
                ]
        )


main : Program () (Maybe Reading) Reading
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = \reading _ -> ( Just reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> droneBayReading identity
        }
