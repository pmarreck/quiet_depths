port module MissionBlock exposing (main)

{-| The mission block at the top of the left panel: the mission type and title,
its summary, the current objective with progress, and the way home.
JavaScript supplies the mission, the objective and the measured distance home;
this view decides when the pickup and the return home replace the objective,
and lays out the title.
-}

import Browser
import Html exposing (Html, b, br, div, h1, p, section, span, text)
import Html.Attributes exposing (class, hidden, id)


type alias Reading =
    { missionType : String
    , missionName : String
    , short : String
    , pickup : Bool
    , returning : Bool
    , convoy : Bool
    , objectiveLabel : String
    , objectiveText : String
    , objectiveProgress : String
    , homeDistance : String
    }


port missionReading : (Reading -> msg) -> Sub msg


type Piece
    = Words String
    | LineBreak


{-| Each of these words starts a new line of the title and closes it with a
period, at its first appearance: "A quiet observation" reads
"A quiet / observation.".
-}
closingWords : List String
closingWords =
    [ "observation", "home", "through" ]


breakBefore : String -> List Piece -> List Piece
breakBefore word pieces =
    case pieces of
        [] ->
            []

        (Words words) :: rest ->
            case String.indexes word words of
                at :: _ ->
                    Words (String.left at words) :: LineBreak :: Words (word ++ "." ++ String.dropLeft (at + String.length word) words) :: rest

                [] ->
                    Words words :: breakBefore word rest

        LineBreak :: rest ->
            LineBreak :: breakBefore word rest


titleLines : String -> List (Html msg)
titleLines name =
    List.foldl breakBefore [ Words name ] closingWords
        |> List.map
            (\piece ->
                case piece of
                    Words words ->
                        text words

                    LineBreak ->
                        br [] []
            )


{-| Picking up the crew comes first; otherwise a finished mission sends the
boat home. Progress and the summary follow the return home alone.
-}
objectiveLabel : Reading -> String
objectiveLabel r =
    if r.pickup then
        "SURFACE FOR PICKUP"

    else if r.returning then
        "RETURN TO EXTRACTION"

    else
        r.objectiveLabel


objectiveText : Reading -> String
objectiveText r =
    if r.pickup then
        "Request 0 m and wait until surfaced"

    else if r.returning then
        "Reach the green circle and surface"

    else
        r.objectiveText


progress : Reading -> String
progress r =
    if r.returning then
        "✓"

    else
        r.objectiveProgress


summary : Reading -> List (Html msg)
summary r =
    if r.returning then
        [ text "Your work is done. Bring everyone home." ]

    else
        [ text r.short ]


{-| Until the first reading the block shows the page's original markup.
-}
original : Reading
original =
    { missionType = "RECONNAISSANCE"
    , missionName = "A quiet observation"
    , short = ""
    , pickup = False
    , returning = False
    , convoy = False
    , objectiveLabel = "PHOTOGRAPH THE CONVOY"
    , objectiveText = "Capture 2 merchant silhouettes"
    , objectiveProgress = "0/2"
    , homeDistance = "2.3 km southwest"
    }


view : Maybe Reading -> Html msg
view reading =
    let
        r =
            Maybe.withDefault original reading
    in
    section [ class "mission-block" ]
        [ span [ class "eyebrow", id "mission-type" ] [ text r.missionType ]
        , h1 [ id "mission-name" ]
            (case reading of
                -- The page's original title had no space before its break.
                Nothing ->
                    [ text "A quiet", br [] [], text "observation." ]

                Just _ ->
                    titleLines r.missionName
            )
        , p [ id "mission-desc" ]
            (case reading of
                Nothing ->
                    [ text "Listen first. Look carefully.", br [] [], text "Leave no trace." ]

                Just _ ->
                    summary r
            )
        , div [ class "objective" ]
            [ span [ class "objective-mark" ] [ text "◇" ]
            , div [] [ b [ id "objective-label" ] [ text (objectiveLabel r) ], p [ id "objective-text" ] [ text (objectiveText r) ] ]
            , span [ id "progress" ] [ text (progress r) ]
            ]
        , div [ class "extraction", hidden r.convoy ]
            [ span [] [ text "↙" ], p [] [ text "Then surface at extraction", br [] [], b [ id "home-distance" ] [ text r.homeDistance ] ] ]
        ]


main : Program () (Maybe Reading) Reading
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = \reading _ -> ( Just reading, Cmd.none )
        , view = view
        , subscriptions = \_ -> missionReading identity
        }
