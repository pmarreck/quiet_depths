port module EndMission exposing (main)

{-| The question asked on surfacing at extraction before the objective is
complete: end the patrol now, or keep patrolling. JavaScript opens the dialog
with the briefed objective and whether the patrol has earned partial credit;
this view decides what the captain is told and sends the answer back.
-}

import Browser
import Html exposing (Html, button, div, h2, p, span, text)
import Html.Attributes exposing (autofocus, class, id, tabindex)
import Html.Events exposing (onClick)


type alias Reading =
    { objective : String, partial : Bool }


port endMissionReading : (Reading -> msg) -> Sub msg


port endMissionOrder : String -> Cmd msg


type Credit
    = PartialSuccess
    | Unsuccessful


credit : Reading -> Credit
credit r =
    if r.partial then
        PartialSuccess

    else
        Unsuccessful


creditText : Credit -> String
creditText c =
    case c of
        PartialSuccess ->
            "Ending now records a partial success."

        Unsuccessful ->
            "Nothing toward the objective is aboard yet. Ending now records an unsuccessful patrol."


type Msg
    = Read Reading
    | Answer String


update : Msg -> Maybe Reading -> ( Maybe Reading, Cmd Msg )
update msg reading =
    case msg of
        Read next ->
            ( Just next, Cmd.none )

        Answer answer ->
            ( reading, endMissionOrder answer )


objectiveLine : Reading -> String
objectiveLine r =
    "You are surfaced at extraction, but the objective is not complete: " ++ r.objective ++ "."


{-| The dialog opens with focus on its heading, not on either answer, so a
helm key still held when it appears cannot answer it.
-}
view : Maybe Reading -> Html Msg
view reading =
    div [ class "end-mission" ]
        [ div [ class "report-heading", tabindex -1, autofocus True ]
            [ span [ class "eyebrow" ] [ text "EXTRACTION" ]
            , h2 [ id "end-mission-title" ] [ text "End mission?" ]
            ]
        , case reading of
            Just r ->
                div []
                    [ p [ id "end-mission-objective" ] [ text (objectiveLine r) ]
                    , p [ id "end-mission-credit" ] [ text (creditText (credit r)) ]
                    ]

            Nothing ->
                div [] []
        , p [ class "end-mission-note" ] [ text "Keep patrolling to go on. You will be asked again after leaving and re-entering extraction." ]
        , div [ class "end-mission-actions" ]
            [ button [ id "end-mission-confirm", class "start-button", onClick (Answer "end") ] [ text "END MISSION" ]
            , button [ id "end-mission-continue", class "resume-button", onClick (Answer "continue") ] [ text "KEEP PATROLLING" ]
            ]
        ]


main : Program () (Maybe Reading) Msg
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> endMissionReading Read
        }
