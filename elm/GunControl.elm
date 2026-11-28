port module GunControl exposing (Model, Msg, Order, Reading, Target, main)

{-| The deck gun and the noisemaker: rounds aboard, how to use the gun, the
visual target the gun sight's aim command will use, the order opening the
gun sight, and the noisemakers left with the order to deploy one.
JavaScript reads the patrol, lists the targets in sight and says which
orders may be given now; this view shows them and sends the orders back.
-}

import Browser
import Html exposing (Html, button, div, label, option, p, span, text)
import Html.Attributes exposing (attribute, class, disabled, for, id, selected, value)
import Html.Events exposing (on, onClick, targetValue)
import Html.Keyed as Keyed
import Json.Decode as Decode


type alias Target =
    { id : String, label : String }


type alias Reading =
    { ammo : String
    , decoys : String
    , targets : List Target
    , target : String
    , openEnabled : Bool
    , decoyEnabled : Bool
    , handled : Int
    }


type alias Order =
    { kind : String, target : String, seq : Int }


port gunReading : (Reading -> msg) -> Sub msg


port gunOrder : Order -> Cmd msg


{-| As with the torpedo run, a target the player has chosen is held until a
reading reports that order handled, so a reading sent before it cannot
snap the choice back.
-}
type alias Model =
    { reading : Maybe Reading, seq : Int, pending : Maybe String }


type Msg
    = Read Reading
    | Choose String
    | OpenSight
    | Deploy


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Read reading ->
            case model.pending of
                Just chosen ->
                    if reading.handled >= model.seq then
                        ( { model | reading = Just reading, pending = Nothing }, Cmd.none )

                    else
                        ( { model | reading = Just { reading | target = chosen } }, Cmd.none )

                Nothing ->
                    ( { model | reading = Just reading }, Cmd.none )

        Choose chosen ->
            ( { model | seq = model.seq + 1, pending = Just chosen, reading = Maybe.map (\r -> { r | target = chosen }) model.reading }
            , gunOrder { kind = "target", target = chosen, seq = model.seq + 1 }
            )

        OpenSight ->
            ( model, gunOrder { kind = "open", target = "", seq = model.seq } )

        Deploy ->
            ( model, gunOrder { kind = "decoy", target = "", seq = model.seq } )


{-| Until the first reading, manual aim alone and both orders withheld.
-}
before : Reading
before =
    { ammo = "", decoys = "", targets = [ { id = "", label = "MANUAL AIM" } ], target = "", openEnabled = False, decoyEnabled = False, handled = 0 }


view : Model -> Html Msg
view model =
    let
        r : Reading
        r =
            Maybe.withDefault before model.reading
    in
    div [ class "gun-panel" ]
        [ div [ class "gun-control" ]
            [ div [ class "section-heading" ] [ text "DECK GUN ", span [ id "gun-ammo" ] [ text r.ammo ] ]
            , p [] [ text "Surface, open Gun, aim with a drag and hold FIRE. Aim at the waterline to cause flooding. Every fifth round is a tracer." ]
            , label [ for "gun-target" ] [ text "VISUAL TARGET" ]
            , Keyed.node "select"
                [ id "gun-target", attribute "aria-label" "Deck gun visual target", on "change" (Decode.map Choose targetValue) ]
                (List.map (\t -> ( t.id, option [ value t.id, selected (t.id == r.target) ] [ text t.label ] )) r.targets)
            , button [ id "open-gun", disabled (not r.openEnabled), onClick OpenSight ] [ text "OPEN GUN SIGHT" ]
            ]
        , button [ id "decoy", class "text-button", disabled (not r.decoyEnabled), onClick Deploy ] [ text "DEPLOY NOISEMAKER ", span [ id "decoy-count" ] [ text r.decoys ] ]
        ]


main : Program () Model Msg
main =
    Browser.element
        { init = \_ -> ( { reading = Nothing, seq = 0, pending = Nothing }, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> gunReading Read
        }
