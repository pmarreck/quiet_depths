port module EngineTelegraph exposing (main)

import Browser
import Html exposing (button, div, text)
import Html.Attributes exposing (class, type_)
import Html.Events exposing (onClick)


type Order
    = AheadFull
    | AheadSilent
    | AllStop
    | AsternFull


type alias Command =
    { lever : Float, quiet : Maybe Bool }


settings : Order -> ( String, Command )
settings order =
    case order of
        AheadFull ->
            ( "Ahead Full", { lever = 17, quiet = Just False } )

        AheadSilent ->
            ( "Ahead Silent", { lever = 3, quiet = Just True } )

        AllStop ->
            ( "All Stop", { lever = 0, quiet = Nothing } )

        AsternFull ->
            ( "Astern Full", { lever = -4, quiet = Just False } )


port ringTelegraph : Command -> Cmd msg


main : Program () () Order
main =
    Browser.element
        { init = \_ -> ( (), Cmd.none )
        , subscriptions = \_ -> Sub.none
        , update = \order _ -> ( (), ringTelegraph (Tuple.second (settings order)) )
        , view = \_ ->
            div [ class "telegraph-buttons" ]
                (List.map
                    (\order ->
                        button [ type_ "button", onClick order ] [ text (Tuple.first (settings order)) ]
                    )
                    [ AheadFull, AheadSilent, AllStop, AsternFull ]
                )
        }
