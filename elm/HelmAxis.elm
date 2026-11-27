port module HelmAxis exposing (main)

{-| One axis of the helm (heading, depth or speed): its readout, optional
turn buttons beside it, a slider whose gold thumb is the requested value with
a white tick at the actual value, the actual and requested text, and optional
preset orders. JavaScript sends a reading each frame and carries out the
orders this view sends back: "set" an absolute value, or "nudge" the
requested value by a relative amount.
-}

import Browser
import Html exposing (Html, b, button, div, i, input, span, text)
import Html.Attributes exposing (attribute, class, disabled, id, step, style, type_, value)
import Html.Events exposing (on, onClick)
import Json.Decode as Decode


type alias Flags =
    { axis : String, title : String, unit : String, presetsClass : String, sublabelId : String, nudges : List Nudge }


{-| A button beside the readout that moves the requested value by `by`.
-}
type alias Nudge =
    { id : String, label : String, aria : String, by : Float, before : Bool }


type alias Preset =
    { label : String, value : Float }


type alias Reading =
    { value : String
    , sublabel : String
    , sublabelColor : String
    , min : Float
    , max : Float
    , step : Float
    , requested : Float
    , actual : Float
    , actualPercent : Float
    , valueText : String
    , ariaLabel : String
    , act : String
    , req : String
    , enabled : Bool
    , presets : List Preset
    , handled : Int
    }


type alias Order =
    { axis : String, kind : String, value : Float, detent : Bool, seq : Int }


port axisReading : (Reading -> msg) -> Sub msg


port axisOrder : Order -> Cmd msg


{-| Orders reach the app asynchronously while it keeps sending readings, so a
reading may predate the latest order. Each order carries a sequence number;
until a reading reports that order handled, the view keeps the value the
player set instead of springing back to the older one.
-}
type alias Model =
    { flags : Flags, reading : Maybe Reading, detent : Bool, seq : Int, pending : Maybe Float }


type Msg
    = Read Reading
    | Dragging Bool
    | Slide Float
    | Choose Float
    | Turn Float


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Read reading ->
            case model.pending of
                Just amount ->
                    if reading.handled >= model.seq then
                        ( {model | reading = Just reading, pending = Nothing}, Cmd.none )

                    else
                        ( {model | reading = Just {reading | requested = amount}}, Cmd.none )

                Nothing ->
                    ( {model | reading = Just reading}, Cmd.none )

        Dragging pointer ->
            -- A pointer drag may snap to a detent; arrow keys step exactly.
            ( {model | detent = pointer}, Cmd.none )

        Slide amount ->
            give amount model.detent model

        Choose amount ->
            give amount False model

        Turn by ->
            -- Relative to whatever the app holds as requested, so nothing to hold here.
            ( model, axisOrder {axis = model.flags.axis, kind = "nudge", value = by, detent = False, seq = model.seq} )


give : Float -> Bool -> Model -> ( Model, Cmd Msg )
give amount detent model =
    let
        seq =
            model.seq + 1
    in
    -- Elm reapplies an input's value on every render; hold the player's value
    -- so a render before the app answers cannot snap the slider back a step.
    ( {model | seq = seq, pending = Just amount, reading = Maybe.map (\r -> {r | requested = amount}) model.reading}
    , axisOrder {axis = model.flags.axis, kind = "set", value = amount, detent = detent, seq = seq}
    )


number : Float -> String
number =
    String.fromFloat


view : Model -> Html Msg
view model =
    case model.reading of
        Nothing ->
            -- Nothing to show until the first reading; the page draws one immediately.
            div [ class "axis-controls" ] []

        Just r ->
            let
                axis =
                    model.flags.axis

                nudgeButtons reading before =
                    model.flags.nudges
                        |> List.filter (\n -> n.before == before)
                        |> List.map (\n -> button [ id n.id, attribute "aria-label" n.aria, disabled (not reading.enabled), onClick (Turn n.by) ] [ text n.label ])
            in
            div [ class "axis-controls" ]
                ([ div [ class "control-label" ] [ text (model.flags.title ++ " "), span [] [ text model.flags.unit ] ]
                 , div [ class "big-value" ]
                    (nudgeButtons r True
                        ++ b [ id (axis ++ "-value") ] [ text r.value ]
                        :: (if model.flags.sublabelId == "" then
                                []

                            else
                                [ span [ id model.flags.sublabelId, style "color" r.sublabelColor ] [ text r.sublabel ] ]
                           )
                        ++ nudgeButtons r False
                    )
                 , div [ class "dual-range", attribute "style" ("--actual:" ++ number r.actualPercent ++ "%") ]
                    [ input
                        [ attribute "aria-label" r.ariaLabel
                        , attribute "aria-description" "White tick actual; gold tick requested"
                        , type_ "range"
                        , id axis
                        , Html.Attributes.min (number r.min)
                        , Html.Attributes.max (number r.max)
                        , step (number r.step)
                        , value (number r.requested)
                        , attribute "data-actual" (number r.actual)
                        , attribute "data-requested" (number r.requested)
                        , attribute "aria-valuetext" r.valueText
                        , disabled (not r.enabled)
                        , on "pointerdown" (Decode.succeed (Dragging True))
                        , on "keydown" (Decode.succeed (Dragging False))
                        , on "input" (Decode.map Slide (Decode.at [ "target", "valueAsNumber" ] Decode.float))
                        ]
                        []
                    , i [ class "actual-tick", attribute "aria-hidden" "true" ] []
                    ]
                 , span [ class "ordered", id (axis ++ "-order") ] [ span [] [ text r.act ], span [] [ text r.req ] ]
                 ]
                    ++ (if List.isEmpty r.presets then
                            []

                        else
                            [ div [ class model.flags.presetsClass ]
                                (List.map
                                    (\p -> button [ attribute ("data-" ++ axis) (number p.value), disabled (not r.enabled), onClick (Choose p.value) ] [ text p.label ])
                                    r.presets
                                )
                            ]
                       )
                )


main : Program Flags Model Msg
main =
    Browser.element
        { init = \flags -> ( {flags = flags, reading = Nothing, detent = True, seq = 0, pending = Nothing}, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> axisReading Read
        }
