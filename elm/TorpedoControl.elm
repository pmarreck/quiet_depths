port module TorpedoControl exposing (main)

{-| Torpedo control: torpedoes aboard, the two bow tubes, the maximum run for
the next torpedo, the launch order with a hint about the selected target, and
the torpedoes now running. JavaScript measures and formats the figures and
says which orders may be given now; this view decides what each tube and
target means for the captain and sends the orders back.
-}

import Browser
import Html exposing (Html, b, button, div, input, label, node, p, span, text)
import Html.Attributes exposing (attribute, class, classList, disabled, for, id, step, type_, value)
import Html.Events exposing (on, onClick)
import Json.Decode as Decode


type alias Flags =
    { maxRun : Float }


type alias Tube =
    { key : String, name : String, offline : Bool, remaining : Maybe Float }


type alias Target =
    { side : String, probableSide : String, identified : Bool, military : Bool, bearing : String }


type alias Reading =
    { torps : String
    , tubes : List Tube
    , runSetting : Float
    , runText : String
    , target : Maybe Target
    , running : String
    , fireEnabled : Bool
    , runEnabled : Bool
    , handled : Int
    }


type alias Order =
    { kind : String, value : Float, seq : Int }


port torpedoReading : (Reading -> msg) -> Sub msg


port torpedoOrder : Order -> Cmd msg


{-| As with the helm sliders, a run the player has set is held until a
reading reports that order handled, so a reading sent before it cannot snap
the slider back.
-}
type alias Model =
    { maxRun : Float, reading : Maybe Reading, seq : Int, pending : Maybe Float }


type Msg
    = Read Reading
    | SetRun Float
    | Launch


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Read reading ->
            case model.pending of
                Just run ->
                    if reading.handled >= model.seq then
                        ( { model | reading = Just reading, pending = Nothing }, Cmd.none )

                    else
                        ( { model | reading = Just { reading | runSetting = run } }, Cmd.none )

                Nothing ->
                    ( { model | reading = Just reading }, Cmd.none )

        SetRun run ->
            ( { model | seq = model.seq + 1, pending = Just run, reading = Maybe.map (\r -> { r | runSetting = run }) model.reading }
            , torpedoOrder { kind = "run", value = run, seq = model.seq + 1 }
            )

        Launch ->
            ( model, torpedoOrder { kind = "fire", value = 0, seq = model.seq } )


type TubeState
    = Offline
    | Empty
    | Ready
    | Reloading Float


tubeState : Tube -> TubeState
tubeState tube =
    if tube.offline then
        Offline

    else
        case tube.remaining of
            Nothing ->
                Empty

            Just remaining ->
                if remaining == 0 then
                    Ready

                else
                    Reloading remaining


tubeText : TubeState -> String
tubeText state =
    case state of
        Offline ->
            "Offline"

        Empty ->
            "Empty"

        Ready ->
            "Ready"

        Reloading remaining ->
            "Reload " ++ String.fromInt (ceiling remaining) ++ " s"


{-| What the captain should know about the selected target before launching.
-}
hint : Maybe Target -> String
hint target =
    case target of
        Nothing ->
            "Select a contact to set firing bearing."

        Just t ->
            if t.side == "friendly" then
                "Confirmed friendly. Hold fire."

            else if t.probableSide == "friendly" && not t.identified then
                "Probable friendly. Check identification."

            else if t.identified && not t.military then
                "Identified neutral. Hold fire."

            else
                "Firing bearing " ++ t.bearing ++ "° true. Seeker may choose another target."


tubeView : Tube -> Html msg
tubeView tube =
    let
        state =
            tubeState tube
    in
    span [] [ text (tube.name ++ " "), b [ id ("tube-" ++ tube.key), classList [ ( "ready", state == Ready ) ] ] [ text (tubeText state) ] ]


instructions : Html msg
instructions =
    p [ class "weapon-instructions" ] [ text "Choose a contact above. Rise to 100 m or less, then LAUNCH. After four seconds the torpedo follows its own sonar; it can acquire another ship." ]


runInput : Model -> List (Html.Attribute Msg) -> Html Msg
runInput model extra =
    input
        ([ type_ "range"
         , id "run-limit"
         , Html.Attributes.min "100"
         , step "20"
         , Html.Attributes.max (String.fromFloat model.maxRun)
         , attribute "aria-label" "Maximum distance for the next torpedo"
         , on "input" (Decode.map SetRun (Decode.at [ "target", "valueAsNumber" ] Decode.float))
         ]
            ++ extra
        )
        []


{-| Until the first reading the panel shows the page's original markup.
-}
view : Model -> Html Msg
view model =
    case model.reading of
        Nothing ->
            div [ class "torpedo-control" ]
                [ div [ class "section-heading" ] [ text "TORPEDO CONTROL ", span [ id "torp-count" ] [] ]
                , div [ class "tubes", attribute "aria-label" "Bow tubes", attribute "role" "group" ]
                    [ span [] [ text "Port ", b [ id "tube-port" ] [] ], span [] [ text "Starboard ", b [ id "tube-starboard" ] [] ] ]
                , label [ class "run-limit", for "run-limit" ] [ text "Maximum run ", node "output" [ id "run-readout", attribute "for" "run-limit" ] [], runInput model [] ]
                , button [ id "fire", disabled True, onClick Launch ] [ text "LAUNCH TORPEDO " ]
                , p [ id "weapon-hint" ] [ text "1. Select a contact below sonar. 2. Rise above 100 m. 3. Launch. The torpedo steers with its own sonar after arming." ]
                , instructions
                , div [ id "torpedo-status", class "torpedo-status" ] []
                ]

        Just r ->
            div [ class "torpedo-control" ]
                [ div [ class "section-heading" ] [ text "TORPEDO CONTROL ", span [ id "torp-count" ] [ text r.torps ] ]
                , div [ class "tubes", attribute "aria-label" "Bow tubes", attribute "role" "group" ] (List.map tubeView r.tubes)
                , label [ class "run-limit", for "run-limit" ]
                    [ text "Maximum run "
                    , node "output" [ id "run-readout", attribute "for" "run-limit" ] [ text r.runText ]
                    , runInput model [ value (String.fromFloat r.runSetting), disabled (not r.runEnabled) ]
                    ]
                , button [ id "fire", disabled (not r.fireEnabled), onClick Launch ] [ text "LAUNCH TORPEDO " ]
                , p [ id "weapon-hint" ] [ text (hint r.target) ]
                , instructions
                , div [ id "torpedo-status", class "torpedo-status" ] [ text r.running ]
                ]


main : Program Flags Model Msg
main =
    Browser.element
        { init = \flags -> ( { maxRun = flags.maxRun, reading = Nothing, seq = 0, pending = Nothing }, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> torpedoReading Read
        }
