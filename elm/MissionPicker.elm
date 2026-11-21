port module MissionPicker exposing (main)

import Browser
import Html exposing (Html, b, button, details, div, img, small, span, summary, text)
import Html.Attributes exposing (alt, attribute, class, classList, disabled, id, src, type_)
import Html.Events exposing (onClick)


type alias Mission =
    { id : String
    , name : String
    , category : String
    , duration : String
    }


type alias Flags =
    { missions : List Mission
    , selected : String
    }

type alias Slot =
    { id : Int, revision : String, image : String, label : String }

type alias Slots =
    { entries : List Slot, canSave : Bool, message : String }

type alias Model =
    { missions : List Mission, selected : String, slots : Slots, confirm : Maybe Slot, busy : Bool }


type Msg
    = Choose Mission
    | BeginPatrol
    | SelectSetup String
    | Refresh Slots
    | Save Slot
    | Confirm Slot
    | Cancel
    | Load Slot


port missionSelected : String -> Cmd msg


port beginPatrol : (() -> msg) -> Sub msg


port patrolRequested : String -> Cmd msg

port selectSetup : (String -> msg) -> Sub msg

port showSlots : (Slots -> msg) -> Sub msg

port saveSlot : { id : Int, revision : String } -> Cmd msg

port readSlot : { id : Int, revision : String } -> Cmd msg

main : Program Flags Model Msg
main =
    Browser.element
        { init = \flags -> ( { missions = flags.missions, selected = flags.selected, slots = { entries = [], canSave = False, message = "" }, confirm = Nothing, busy = False }, Cmd.none )
        , update = update
        , subscriptions = \_ -> Sub.batch [ beginPatrol (\() -> BeginPatrol), showSlots Refresh, selectSetup SelectSetup ]
        , view = view
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Choose mission ->
            ( { model | selected = mission.id }, missionSelected mission.id )

        BeginPatrol ->
            ( model, patrolRequested model.selected )

        SelectSetup mission ->
            ( { model | selected = mission }, missionSelected mission )

        Refresh slots ->
            ( { model | slots = slots, busy = False, confirm = Nothing }, Cmd.none )

        Save slot ->
            if slot.revision == "" then
                update (Confirm slot) model
            else
                ( { model | confirm = Just slot }, Cmd.none )

        Confirm slot ->
            ( { model | busy = True, confirm = Nothing }, saveSlot { id = slot.id, revision = slot.revision } )

        Cancel ->
            ( { model | confirm = Nothing }, Cmd.none )

        Load slot ->
            ( { model | busy = True, confirm = Nothing }, readSlot { id = slot.id, revision = slot.revision } )


view : Model -> Html Msg
view model =
    div []
        [ details [ id "patrol-slots" ]
            [ summary [] [ text "Save slots" ]
            , div [ class "slot-list" ] (List.map (slotView model) model.slots.entries)
            , small [ attribute "role" "status" ] [ text model.slots.message ]
            ]
        , div [ id "mission-picker" ] (List.map (missionButton model.selected) model.missions)
        ]

slotView : Model -> Slot -> Html Msg
slotView model slot =
    let
        number = String.fromInt slot.id
        action label msg unavailable =
            button [ type_ "button", attribute "aria-label" (label ++ " slot " ++ number), disabled (model.busy || unavailable), onClick msg ] [ text label ]
        buttons =
            if model.confirm == Just slot then
                [ span [] [ text ("Replace slot " ++ number ++ "?") ], action "Overwrite" (Confirm slot) False, action "Cancel" Cancel False ]
            else
                [ action "Save" (Save slot) (not model.slots.canSave), action "Load" (Load slot) (slot.revision == "") ]
    in
    div [ class "patrol-slot" ]
        [ if slot.image == "" then
            span [ class "slot-number" ] [ text number ]
          else
            img [ src slot.image, alt "", class "slot-image" ] []
        , div [ class "slot-caption" ]
            [ b [] [ text ("Slot " ++ number) ], small [] [ text slot.label ] ]
        , div [ class "slot-actions" ] buttons
        ]


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
