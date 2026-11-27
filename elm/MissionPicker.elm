port module MissionPicker exposing (Choice, Conditions, Flags, Model, Msg, Slot, Slots, main)

import Browser
import Html exposing (Html, b, button, details, div, fieldset, img, input, label, legend, option, p, select, small, span, summary, text)
import Html.Attributes exposing (alt, attribute, checked, class, classList, disabled, id, selected, src, type_, value)
import Html.Events exposing (onCheck, onClick, onInput)
import Json.Encode as Encode
import PatrolDifficulty as Difficulty
import PatrolMission exposing (Mission)


type alias Flags =
    { selected : String
    , difficulty : Difficulty.Model
    , pauseKey : String
    , times : List Choice
    , weather : List Choice
    }


type alias Choice =
    { id : String, name : String }


type alias Conditions =
    { timeOfDay : String, weather : String, changing : Bool }


type alias Setup =
    { mission : String, conditions : Conditions }


type alias Slot =
    { id : Int, revision : String, image : String, label : String }


type alias Slots =
    { entries : List Slot, canSave : Bool, message : String }


type alias Model =
    { selected : Mission, pauseKey : String, difficulty : Difficulty.Model, slots : Slots, confirm : Maybe Slot, busy : Bool, times : List Choice, weather : List Choice, conditions : Conditions }


type Msg
    = Choose Mission
    | BeginPatrol
    | SelectSetup Setup
    | SetTime String
    | SetWeather String
    | SetChanging Bool
    | ChangeDifficulty Difficulty.Msg
    | ShowDifficulty Difficulty.Model
    | ShowPauseKey String
    | Refresh Slots
    | Save Slot
    | Confirm Slot
    | Cancel
    | Load Slot
    | Transfer String Int String


port difficultyChanged : { id : String, value : Encode.Value } -> Cmd msg


port showDifficulty : (Difficulty.Model -> msg) -> Sub msg


port showPauseKey : (String -> msg) -> Sub msg


port beginPatrol : (() -> msg) -> Sub msg


port patrolRequested : Setup -> Cmd msg


port selectSetup : (Setup -> msg) -> Sub msg


port showSlots : (Slots -> msg) -> Sub msg


port saveSlot : { id : Int, revision : String } -> Cmd msg


port readSlot : { id : Int, revision : String } -> Cmd msg


port transferFile : { action : String, id : Int, revision : String, setup : Setup } -> Cmd msg


main : Program Flags Model Msg
main =
    Browser.element
        { init = \flags -> ( { selected = PatrolMission.fromId flags.selected |> Maybe.withDefault PatrolMission.Recon, pauseKey = flags.pauseKey, difficulty = flags.difficulty, slots = { entries = [], canSave = False, message = "" }, confirm = Nothing, busy = False, times = flags.times, weather = flags.weather, conditions = { timeOfDay = "random", weather = "random", changing = True } }, Cmd.none )
        , update = update
        , subscriptions = \_ -> Sub.batch [ beginPatrol (\() -> BeginPatrol), showSlots Refresh, selectSetup SelectSetup, showDifficulty ShowDifficulty, showPauseKey ShowPauseKey ]
        , view = view
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    let
        conditions =
            model.conditions
    in
    case msg of
        Choose mission ->
            ( { model | selected = mission }, Cmd.none )

        BeginPatrol ->
            ( model, patrolRequested { mission = (PatrolMission.briefing model.selected).id, conditions = conditions } )

        SelectSetup setup ->
            case PatrolMission.fromId setup.mission of
                Just mission ->
                    ( { model | selected = mission, conditions = setup.conditions }, Cmd.none )

                Nothing ->
                    ( model, Cmd.none )

        SetTime time ->
            ( { model | conditions = { conditions | timeOfDay = time } }, Cmd.none )

        SetWeather weather ->
            ( { model | conditions = { conditions | weather = weather } }, Cmd.none )

        SetChanging changing ->
            ( { model | conditions = { conditions | changing = changing } }, Cmd.none )

        ChangeDifficulty change ->
            let
                ( settings, changed ) =
                    Difficulty.update change model.difficulty
            in
            ( { model | difficulty = settings }, Maybe.withDefault Cmd.none (Maybe.map difficultyChanged changed) )

        ShowDifficulty settings ->
            ( { model | difficulty = settings }, Cmd.none )

        ShowPauseKey name ->
            ( { model | pauseKey = name }, Cmd.none )

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

        Transfer action slot revision ->
            ( model, transferFile { action = action, id = slot, revision = revision, setup = { mission = (PatrolMission.briefing model.selected).id, conditions = conditions } } )


view : Model -> Html Msg
view model =
    let
        longer =
            Difficulty.longPatrolEnabled model.difficulty

        selectedMission =
            PatrolMission.briefing model.selected
    in
    div []
        [ details [ id "patrol-slots" ]
            [ summary [] [ text "Save slots and transfers" ]
            , div [ class "slot-list" ] (List.map (slotView model) model.slots.entries)
            , div [ class "transfer-actions" ]
                [ button [ type_ "button", disabled (not model.slots.canSave), onClick (Transfer "export-current" 0 "") ] [ text "Export current patrol" ]
                , button [ type_ "button", onClick (Transfer "export-state" 0 "") ] [ text "Export entire game" ]
                , button [ type_ "button", onClick (Transfer "import-state" 0 "") ] [ text "Import entire game" ]
                ]
            , small [ attribute "role" "status" ] [ text model.slots.message ]
            ]
        , div [ id "mission-picker" ] (List.map (missionButton longer model.selected) PatrolMission.all)
        , div [ class "briefing-tip", attribute "aria-live" "polite" ]
            [ b [] [ text "YOUR FIRST ORDERS" ]
            , p []
                [ text (selectedMission.description ++ " ")
                , text ("You carry " ++ String.fromInt PatrolMission.startingTorpedoes ++ " torpedoes in total, with two bow tubes ready. ")
                , Html.strong [ class "key-only" ] [ text (model.pauseKey ++ " pauses the patrol.") ]
                ]
            ]
        , fieldset [ class "patrol-conditions" ]
            [ legend [] [ text "PATROL CONDITIONS" ]
            , conditionMenu "Time of day" "patrol-time" "Patrol time of day" model.times model.conditions.timeOfDay SetTime
            , conditionMenu "Weather" "patrol-weather" "Patrol starting weather" model.weather model.conditions.weather SetWeather
            , label [ class "weather-fronts" ]
                [ input [ id "changing-weather", type_ "checkbox", checked model.conditions.changing, onCheck SetChanging ] []
                , text " Changing weather fronts"
                ]
            , p [] [ text "Day turns to night during your patrol. Clear skies, rain and storms change how far either side can see." ]
            ]
        , Html.map ChangeDifficulty (Difficulty.view (PatrolMission.estimatedMinutes longer selectedMission) model.difficulty)
        ]


conditionMenu : String -> String -> String -> List Choice -> String -> (String -> Msg) -> Html Msg
conditionMenu title elementId accessible choices current change =
    let
        item choice =
            option [ value choice.id, selected (choice.id == current) ] [ text choice.name ]
    in
    label []
        [ text title
        , span [ class "select-wrap" ]
            [ select [ id elementId, attribute "aria-label" accessible, onInput change ]
                (List.map item ({ id = "random", name = "Random" } :: choices))
            ]
        ]


slotView : Model -> Slot -> Html Msg
slotView model slot =
    let
        number =
            String.fromInt slot.id

        action label msg unavailable =
            button [ type_ "button", attribute "aria-label" (label ++ " slot " ++ number), disabled (model.busy || unavailable), onClick msg ] [ text label ]

        buttons =
            if model.confirm == Just slot then
                [ span [] [ text ("Replace slot " ++ number ++ "?") ], action "Overwrite" (Confirm slot) False, action "Cancel" Cancel False ]

            else
                [ action "Save" (Save slot) (not model.slots.canSave)
                , action "Load" (Load slot) (slot.revision == "")
                , action "Export" (Transfer "export-slot" slot.id slot.revision) (slot.revision == "")
                , action "Import" (Transfer "import-slot" slot.id slot.revision) False
                ]
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


missionButton : Bool -> Mission -> Mission -> Html Msg
missionButton longer selected choice =
    let
        mission =
            PatrolMission.briefing choice

        active =
            selected == choice
    in
    button
        [ type_ "button"
        , classList [ ( "mission-option", True ), ( "active", active ) ]
        , attribute "data-mission" mission.id
        , attribute "aria-pressed"
            (if active then
                "true"

             else
                "false"
            )
        , onClick (Choose choice)
        ]
        [ span [ attribute "aria-hidden" "true" ] []
        , div [] [ b [] [ text mission.name ], small [] [ text mission.category ] ]
        , span [] [ text (PatrolMission.estimatedMinutes longer mission) ]
        ]
