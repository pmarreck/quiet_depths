port module MissionPicker exposing (main)

import Browser
import Html exposing (Html, b, button, div, small, span, text)
import Html.Attributes exposing (attribute, classList, id, type_)
import Html.Events exposing (onClick)


type alias Mission =
    { id : String
    , name : String
    , category : String
    , duration : String
    }


type alias Model =
    { missions : List Mission
    , selected : String
    }


type Msg
    = Choose Mission
    | BeginPatrol


port missionSelected : String -> Cmd msg


port beginPatrol : (() -> msg) -> Sub msg


port patrolRequested : String -> Cmd msg


main : Program Model Model Msg
main =
    Browser.element
        { init = \flags -> ( flags, Cmd.none )
        , update = update
        , subscriptions = \_ -> beginPatrol (\() -> BeginPatrol)
        , view = view
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Choose mission ->
            ( { model | selected = mission.id }, missionSelected mission.id )

        BeginPatrol ->
            ( model, patrolRequested model.selected )


view : Model -> Html Msg
view model =
    div [ id "mission-picker" ] (List.map (missionButton model.selected) model.missions)


missionButton : String -> Mission -> Html Msg
missionButton selected mission =
    let
        active =
            selected == mission.id
    in
    button
        [ type_ "button"
        , classList [ ( "mission-option", True ), ( "active", active ) ]
        , attribute "data-mission" mission.id
        , attribute "aria-pressed" (if active then "true" else "false")
        , onClick (Choose mission)
        ]
        [ span [ attribute "aria-hidden" "true" ] []
        , div [] [ b [] [ text mission.name ], small [] [ text mission.category ] ]
        , span [] [ text mission.duration ]
        ]
