port module BoatCondition exposing (main)

{-| The condition part of the boat panel: pressure hull strength and limits,
the one-line damage status with the damage-control order, and the subsystem
and buoyancy details. JavaScript measures and formats the figures each frame;
this view decides which fault the status line names, how it is colored, and
which subsystems read as damaged.
-}

import Browser
import Html exposing (Html, b, button, details, div, i, p, span, summary, text)
import Html.Attributes exposing (class, disabled, id, style, title)
import Html.Events exposing (onClick)


type alias Subsystem =
    { name : String, condition : Float, label : String }


type alias Reading =
    { hull : Float
    , hullText : String
    , hullLimits : String
    , outerHull : Float
    , flood : Float
    , floodText : String
    , waterText : String
    , fuelFire : Bool
    , fuelLeak : Bool
    , repair : Float
    , systemConditions : List Float
    , subsystems : List Subsystem
    , ballast : Float
    , ballastText : String
    , verticalText : String
    , rpmText : String
    , cavitation : Float
    , repairEnabled : Bool
    }


port boatReading : (Reading -> msg) -> Sub msg


port boatOrder : String -> Cmd msg


type Msg
    = Read Reading
    | OrderDamageControl


{-| The status line names the most urgent fault first.
-}
type Status
    = FuelFire
    | FuelLeak
    | Repairing
    | Flooding
    | PressureHullDamaged
    | OuterHullDamaged
    | SubsystemDamage
    | Nominal


status : Reading -> Status
status r =
    if r.fuelFire then
        FuelFire

    else if r.fuelLeak then
        FuelLeak

    else if r.repair > 0 then
        Repairing

    else if r.flood > 0 then
        Flooding

    else if r.hull < 99.9 then
        PressureHullDamaged

    else if r.outerHull < 99.9 then
        OuterHullDamaged

    else if List.any (\v -> v < 100) r.systemConditions then
        SubsystemDamage

    else
        Nominal


statusText : Reading -> Status -> String
statusText r s =
    case s of
        FuelFire ->
            "FUEL FIRE"

        FuelLeak ->
            "FUEL TANK LEAK"

        Repairing ->
            "DAMAGE CONTROL WORKING"

        Flooding ->
            "FLOODING · " ++ r.floodText ++ " T/MIN · " ++ r.waterText ++ " T ABOARD"

        PressureHullDamaged ->
            "PRESSURE HULL DAMAGED"

        OuterHullDamaged ->
            "OUTER HULL DAMAGED"

        SubsystemDamage ->
            "SUBSYSTEM DAMAGE"

        Nominal ->
            "ALL SYSTEMS NOMINAL"


{-| The color follows the water and the outer hull, not the named fault: a fuel
fire with a sound hull reads green, as it always has.
-}
statusColor : Reading -> String
statusColor r =
    if r.flood > 0 then
        "var(--red)"

    else if r.outerHull < 99.9 then
        "var(--gold)"

    else
        "var(--green)"


buoyancy : Reading -> String
buoyancy r =
    "BALLAST "
        ++ (if r.ballast > 0 then
                "FLOODING"

            else
                "BLOWING"
           )
        ++ " "
        ++ r.ballastText
        ++ "% · VERTICAL "
        ++ r.verticalText
        ++ " M/S · "
        ++ r.rpmText
        ++ " RPM"
        ++ (if r.cavitation > 0.05 then
                " · CAVITATING"

            else
                ""
           )


subsystemRow : Subsystem -> Html Msg
subsystemRow sub =
    div []
        [ span [] [ text sub.name ]
        , b
            [ class
                (if sub.condition < 60 then
                    "damaged"

                 else
                    ""
                )
            ]
            [ text sub.label ]
        ]


{-| Until the first reading the panel shows the page's original figures: a
full hull, the green status dot, and no limits or details.
-}
view : Maybe Reading -> Html Msg
view reading =
    div [ class "boat-condition" ]
        [ div [ class "hull-title" ] [ span [] [ text "PRESSURE HULL" ], b [ id "hull-value" ] [ text (field .hullText "100" reading), span [] [ text "%" ] ] ]
        , p [ id "hull-limits" ] [ text (field .hullLimits "" reading) ]
        , div [ class "bar hull-bar" ] [ i (id "hull-bar" :: (reading |> Maybe.map barStyle |> Maybe.withDefault [])) [] ]
        , div [ class "systems" ]
            [ case reading of
                Just r ->
                    span [ id "system-status", style "color" (statusColor r) ] [ i [] [], text (" " ++ statusText r (status r)) ]

                Nothing ->
                    span [ id "system-status" ] [ i [] [], text " ALL SYSTEMS NOMINAL" ]
            , button
                [ id "repair"
                , title "Seal leaks, reinforce pressure bulkheads and pump bilge water using battery power"
                , disabled (not (reading |> Maybe.map .repairEnabled |> Maybe.withDefault True))
                , onClick OrderDamageControl
                ]
                [ text "DAMAGE CONTROL" ]
            ]
        , details [ class "system-detail" ]
            [ summary [] [ text "SUBSYSTEM CONDITION" ]
            , div [ id "subsystems" ] (reading |> Maybe.map (.subsystems >> List.map subsystemRow) |> Maybe.withDefault [])
            , p [ id "buoyancy-readout" ] (reading |> Maybe.map (buoyancy >> text >> List.singleton) |> Maybe.withDefault [])
            ]
        ]


field : (Reading -> String) -> String -> Maybe Reading -> String
field get fallback =
    Maybe.map get >> Maybe.withDefault fallback


barStyle : Reading -> List (Html.Attribute Msg)
barStyle r =
    [ style "width" (String.fromFloat r.hull ++ "%")
    , style "background"
        (if r.hull < 45 then
            "var(--red)"

         else
            "var(--green)"
        )
    ]


update : Msg -> Maybe Reading -> ( Maybe Reading, Cmd Msg )
update msg reading =
    case msg of
        Read next ->
            ( Just next, Cmd.none )

        OrderDamageControl ->
            ( reading, boatOrder "repair" )


main : Program () (Maybe Reading) Msg
main =
    Browser.element
        { init = \() -> ( Nothing, Cmd.none )
        , update = update
        , view = view
        , subscriptions = \_ -> boatReading Read
        }
