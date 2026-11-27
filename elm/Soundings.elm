port module Soundings exposing (main)

{-| The soundings strip above the helm: clearance below the keel (or below the
drone while it is piloted), water depth, wind, and advice that turns gold when
clearance is shallow and red near the bottom. JavaScript measures and formats
the numbers each frame; this view decides what the clearance means.
-}

import Browser
import Html exposing (Html, div, section, small, span, strong, text)
import Html.Attributes exposing (attribute, classList, id)


type alias Reading =
    { drone : Bool
    , belowKeel : Float
    , belowKeelText : String
    , waterDepthText : String
    , windText : String
    }


port soundingsReading : (Reading -> msg) -> Sub msg


type Clearance
    = Clear
    | Shallow
    | Danger
    | Contact


clearance : Float -> Clearance
clearance below =
    if below < 0 then
        Contact

    else if below < 10 then
        Danger

    else if below < 30 then
        Shallow

    else
        -- Also where an unmeasurable (NaN) clearance lands, as before.
        Clear


advice : Clearance -> String
advice level =
    case level of
        Clear ->
            "CLEAR BELOW"

        Shallow ->
            "SHALLOW CLEARANCE"

        Danger ->
            "DANGER · RISE"

        Contact ->
            "BOTTOM CONTACT"


{-| Gold from shallow clearance down; red from danger down.
-}
styling : Clearance -> { caution : Bool, danger : Bool }
styling level =
    case level of
        Clear ->
            { caution = False, danger = False }

        Shallow ->
            { caution = True, danger = False }

        Danger ->
            { caution = True, danger = True }

        Contact ->
            { caution = True, danger = True }


{-| The figures the page showed before its first reading.
-}
initial : Reading
initial =
    { drone = False, belowKeel = 213, belowKeelText = "213 m", waterDepthText = "230 m", windText = "9 km/h WIND" }


view : Reading -> Html Reading
view r =
    let
        level =
            clearance r.belowKeel

        look =
            styling level
    in
    section
        [ id "soundings"
        , classList [ ( "soundings-strip", True ), ( "caution", look.caution ), ( "danger", look.danger ) ]
        , attribute "aria-label" "Seafloor soundings"
        ]
        [ div []
            [ span [ id "below-label" ]
                [ text
                    (if r.drone then
                        "BELOW DRONE"

                     else
                        "BELOW KEEL"
                    )
                ]
            , strong [ id "below-keel" ] [ text r.belowKeelText ]
            ]
        , div [] [ span [] [ text "WATER DEPTH" ], strong [ id "water-depth" ] [ text r.waterDepthText ] ]
        , div [ Html.Attributes.class "soundings-advice" ]
            -- The virtual DOM rewrites this text only when the advice changes,
            -- so screen readers hear each change once.
            [ span [ id "seabed-advice", attribute "aria-live" "polite" ] [ text (advice level) ]
            , small [ id "wind-value" ] [ text r.windText ]
            ]
        ]


main : Program () Reading Reading
main =
    Browser.element
        { init = \() -> ( initial, Cmd.none )
        , update = \reading _ -> ( reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> soundingsReading identity
        }
