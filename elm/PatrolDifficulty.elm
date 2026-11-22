module PatrolDifficulty exposing (Model, Msg, longPatrolEnabled, update, view)

import Html exposing (Html, details, div, input, label, output, small, summary, text)
import Html.Attributes exposing (attribute, checked, class, disabled, id, type_, value)
import Html.Events exposing (onCheck, onInput)
import Json.Encode as Encode


type alias Slider =
    { id : String, label : String, value : Float, min : Float, max : Float, step : Float, low : String, high : String }


type alias Switch =
    { id : String, label : String, value : Bool, requires : Maybe String }


type alias Model =
    { sliders : List Slider, switches : List Switch }


type Msg
    = Slide Slider String
    | Toggle Switch Bool


longPatrolId : String
longPatrolId =
    "longPatrol"


longPatrolEnabled : Model -> Bool
longPatrolEnabled model =
    List.any (\switch -> switch.id == longPatrolId && switch.value) model.switches


enabled : Model -> Switch -> Bool
enabled model switch =
    case switch.requires of
        Nothing ->
            True

        Just parent ->
            List.any (\s -> s.id == parent && s.value) model.switches


update : Msg -> Model -> ( Model, Maybe { id : String, value : Encode.Value } )
update msg model =
    case msg of
        Toggle switch on ->
            if enabled model switch then
                ( { model | switches = List.map (\s -> if s.id == switch.id then { s | value = on } else s) model.switches }
                , Just { id = switch.id, value = Encode.bool on }
                )
            else
                ( model, Nothing )

        Slide slider raw ->
            case String.toFloat raw of
                Just parsed ->
                    let
                        level = clamp slider.min slider.max parsed
                    in
                    ( { model | sliders = List.map (\s -> if s.id == slider.id then { s | value = level } else s) model.sliders }
                    , Just { id = slider.id, value = Encode.float level }
                    )

                Nothing ->
                    ( model, Nothing )


view : String -> Model -> Html Msg
view playtime model =
    let
        range slider =
            label []
                [ text slider.label
                , output [] [ text (String.fromFloat slider.value) ]
                , input
                    [ type_ "range", attribute "data-difficulty" slider.id
                    , Html.Attributes.min (String.fromFloat slider.min), Html.Attributes.max (String.fromFloat slider.max)
                    , Html.Attributes.step (String.fromFloat slider.step), value (String.fromFloat slider.value)
                    , onInput (Slide slider)
                    ] []
                , small [] [ text (slider.low ++ " ↔ " ++ slider.high) ]
                ]

        checkbox switch =
            label [] <|
                [ text switch.label
                , input
                    [ type_ "checkbox", attribute "data-difficulty" switch.id, checked switch.value
                    , disabled (not (enabled model switch)), onCheck (Toggle switch)
                    ] []
                ]
                    ++ (if switch.id == longPatrolId then
                            [ small [ attribute "role" "status" ] [ text ("Estimated play time · " ++ String.toLower playtime) ] ]
                        else
                            []
                       )
    in
    details [ class "patrol-difficulty" ]
        [ summary [] [ text "Difficulty and realism" ]
        , div [ id "difficulty-options" ] (List.map range model.sliders ++ List.map checkbox model.switches)
        ]
