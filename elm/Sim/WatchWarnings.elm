module Sim.WatchWarnings exposing (Battery(..), Warnings, batteryCall, batteryWarning, bottomCall, bottomThreshold, warnings)

{-| The watch's standing warnings: too little water under the keel, and a low
or critical battery. A critical battery at exactly 10% stays critical until
the charge rises above it.
-}


type Battery
    = Charged
    | Low
    | Critical


type alias Warnings =
    { bottom : Bool, battery : Battery }


bottomThreshold : Float
bottomThreshold =
    20


batteryWarning : Float -> Battery -> Battery
batteryWarning charge previous =
    if charge < 10 || (charge == 10 && previous == Critical) then
        Critical

    else if charge < 20 then
        Low

    else
        Charged


warnings : Float -> Float -> Maybe Warnings -> Warnings
warnings clearance charge previous =
    { bottom = clearance < bottomThreshold
    , battery = batteryWarning charge (previous |> Maybe.map .battery |> Maybe.withDefault Charged)
    }


bottomCall : String
bottomCall =
    "Depth warning · Less than 20 m below the keel."


{-| What the watch calls out when the battery warning rises; a charged
battery calls nothing.
-}
batteryCall : Battery -> Maybe String
batteryCall level =
    case level of
        Critical ->
            Just "Critical battery · Reserve at or below 10%."

        Low ->
            Just "Low battery · Less than 20% charge."

        Charged ->
            Nothing
