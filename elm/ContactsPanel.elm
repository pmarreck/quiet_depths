port module ContactsPanel exposing (Contact, Model, Msg, Order, Reading, Track, main)

{-| The contacts panel: how many contacts the boat holds, each as a row the
captain can select (its symbol, its label and name, what is known of it and
its range, its bearing from the bow), a word while the list is empty, and
the enemy torpedoes heard in the water. JavaScript reads the patrol and
words each row; this view lays them out and sends the selection back.
-}

import Browser
import Html exposing (Html, br, button, div, section, small, span, strong, text)
import Html.Attributes exposing (attribute, class, classList, id)
import Html.Events exposing (onClick)
import Html.Keyed as Keyed


type alias Contact =
    { id : String, selected : Bool, icon : String, title : String, detail : String, bearing : String }


type alias Track =
    { id : String, text : String }


type alias Reading =
    { count : String, contacts : List Contact, tracks : List Track, handled : Int }


type alias Order =
    { id : String, seq : Int }


port contactsReading : (Reading -> msg) -> Sub msg


port contactOrder : Order -> Cmd msg


{-| A contact the player has selected is held until a reading reports that
order handled, so a reading sent before it cannot move the selection back.
-}
type alias Model =
    { reading : Maybe Reading, seq : Int, pending : Maybe String }


type Msg
    = Read Reading
    | Select String


choosing : String -> Reading -> Reading
choosing chosen reading =
    { reading | contacts = List.map (\c -> { c | selected = c.id == chosen }) reading.contacts }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Read reading ->
            case model.pending of
                Just chosen ->
                    if reading.handled >= model.seq then
                        ( { model | reading = Just reading, pending = Nothing }, Cmd.none )

                    else
                        ( { model | reading = Just (choosing chosen reading) }, Cmd.none )

                Nothing ->
                    ( { model | reading = Just reading }, Cmd.none )

        Select chosen ->
            ( { model | seq = model.seq + 1, pending = Just chosen, reading = Maybe.map (choosing chosen) model.reading }
            , contactOrder { id = chosen, seq = model.seq + 1 }
            )


row : Contact -> ( String, Html Msg )
row c =
    ( c.id
    , button
        [ class "contact-row"
        , classList [ ( "active", c.selected ) ]
        , attribute "data-contact" c.id
        , attribute "aria-pressed"
            (if c.selected then
                "true"

             else
                "false"
            )
        , onClick (Select c.id)
        ]
        [ span [ class "contact-icon" ] [ text c.icon ]
        , span [ class "contact-summary" ] [ strong [] [ text c.title ], small [] [ text c.detail ] ]
        , span [ class "contact-bearing" ] [ text c.bearing ]
        ]
    )


view : Model -> Html Msg
view model =
    let
        r : Reading
        r =
            Maybe.withDefault { count = "00", contacts = [], tracks = [], handled = 0 } model.reading
    in
    section [ class "contacts-panel" ]
        [ div [ class "section-heading" ] [ text "CONTACTS ", span [ id "contacts-count" ] [ text r.count ] ]
        , if List.isEmpty r.contacts then
            div [ id "contacts" ] [ div [ class "empty-contacts" ] [ text "Listening to the dark.", br [] [], text "Contacts will appear as you hear them." ] ]

          else
            Keyed.node "div" [ id "contacts" ] (List.map row r.contacts)
        , Keyed.node "div" [ id "torpedo-tracks" ] (List.map (\t -> ( t.id, div [] [ text t.text ] )) r.tracks)
        ]


main : Program () Model Msg
main =
    Browser.element
        { init = \_ -> ( { reading = Nothing, seq = 0, pending = Nothing }, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> contactsReading Read
        }
