module Sim.Boat exposing (Boat, Limits, Parts, Systems, condition, decoder, encode, setCondition)

{-| The player's boat as current saves hold it: motion, hull, plant, stores,
alarms, the periscope, the fourteen systems and fifteen repair limits as
records (a missing system fails to compile), and the drone (`Sim.Drone`).
Restore also migrates older saves in eight ways before checking them; those
are counted as remaining work (docs/plan_context/ship-and-contact-records.md).
-}

import Dict exposing (Dict)
import Json.Decode as D
import Json.Encode as E
import Sim.Drone as Drone exposing (Drone)
import Sim.Equipment exposing (System(..))
import Sim.PowerPlant as Plant exposing (DieselMode, EngineMode)


type alias Systems =
    { diesel : Float, fuelTank : Float, batteryBank : Float, tubes : Float, engine : Float, propeller : Float, oxygen : Float, ballast : Float, planes : Float, rudder : Float, sonar : Float, periscope : Float, deckgun : Float, crew : Float }


type alias Limits =
    { hull : Float, diesel : Float, fuelTank : Float, batteryBank : Float, tubes : Float, engine : Float, propeller : Float, oxygen : Float, ballast : Float, planes : Float, rudder : Float, sonar : Float, periscope : Float, deckgun : Float, crew : Float }


{-| Anything holding a value per system: the conditions, or the limits. -}
type alias Parts a =
    { a | diesel : Float, fuelTank : Float, batteryBank : Float, tubes : Float, engine : Float, propeller : Float, oxygen : Float, ballast : Float, planes : Float, rudder : Float, sonar : Float, periscope : Float, deckgun : Float, crew : Float }


condition : System -> Parts a -> Float
condition system p =
    case system of
        Diesel ->
            p.diesel

        FuelTank ->
            p.fuelTank

        BatteryBank ->
            p.batteryBank

        Tubes ->
            p.tubes

        Engine ->
            p.engine

        Propeller ->
            p.propeller

        Oxygen ->
            p.oxygen

        Ballast ->
            p.ballast

        Planes ->
            p.planes

        Rudder ->
            p.rudder

        Sonar ->
            p.sonar

        Periscope ->
            p.periscope

        Deckgun ->
            p.deckgun

        Crew ->
            p.crew


setCondition : System -> Float -> Parts a -> Parts a
setCondition system v p =
    case system of
        Diesel ->
            { p | diesel = v }

        FuelTank ->
            { p | fuelTank = v }

        BatteryBank ->
            { p | batteryBank = v }

        Tubes ->
            { p | tubes = v }

        Engine ->
            { p | engine = v }

        Propeller ->
            { p | propeller = v }

        Oxygen ->
            { p | oxygen = v }

        Ballast ->
            { p | ballast = v }

        Planes ->
            { p | planes = v }

        Rudder ->
            { p | rudder = v }

        Sonar ->
            { p | sonar = v }

        Periscope ->
            { p | periscope = v }

        Deckgun ->
            { p | deckgun = v }

        Crew ->
            { p | crew = v }


type alias Boat =
    { x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , pitch : Float
    , roll : Maybe Float
    , speed : Float
    , targetSpeed : Float
    , targetHeading : Float
    , targetDepth : Float
    , verticalSpeed : Float
    , hull : Float
    , outerHull : Float
    , flood : Float
    , shock : Float
    , fuel : Float
    , fuelLeak : Float
    , fuelFire : Float
    , battery : Float
    , oxygen : Float
    , water : Float
    , ballast : Float
    , planes : Float
    , rudder : Float
    , propAngle : Float
    , cavitation : Float
    , propRpm : Float
    , noise : Float
    , silent : Bool
    , gunLoudUntil : Maybe Float
    , unpoweredSince : Maybe Float
    , repair : Float
    , floodAlarm : Bool
    , collisionCooldown : Float
    , collisionHits : Dict String Float
    , bottomed : Bool
    , torps : Int
    , cookoff : Bool
    , engine : EngineMode
    , dieselMode : DieselMode
    , pressureAlarm : Int
    , criticalExposure : Float
    , imploded : Bool
    , scope : Bool
    , scopeTravel : Maybe Float
    , systems : Systems
    , repairLimits : Limits
    , drone : Drone
    }



-- DECODING


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


check : String -> (a -> Bool) -> D.Decoder a -> D.Decoder a
check problem ok =
    D.andThen
        (\v ->
            if ok v then
                D.succeed v

            else
                D.fail problem
        )


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key valueDecoder =
    D.oneOf [ D.field key D.value |> D.map (\_ -> True), D.succeed False ]
        |> D.andThen
            (\present ->
                if present then
                    D.map Just (D.field key valueDecoder)

                else
                    D.succeed Nothing
            )


finite : D.Decoder Float
finite =
    check "a finite number" (\n -> not (isNaN n || isInfinite n)) D.float


between : Float -> Float -> D.Decoder Float
between low high =
    check "a number in range" (\n -> low <= n && n <= high) finite


percent : D.Decoder Float
percent =
    between 0 100


named : List ( String, a ) -> D.Decoder a
named choices =
    D.string
        |> D.andThen
            (\given ->
                case List.filter (\( name, _ ) -> name == given) choices of
                    ( _, v ) :: _ ->
                        D.succeed v

                    [] ->
                        D.fail ("unknown " ++ given)
            )


engineName : EngineMode -> String
engineName e =
    case e of
        Plant.Diesel ->
            "diesel"

        Plant.Electric ->
            "electric"


dieselModeName : DieselMode -> String
dieselModeName m =
    case m of
        Plant.Charge ->
            "charge"

        Plant.Drive ->
            "drive"

        Plant.Assist ->
            "assist"


systemsDecoder : D.Decoder Systems
systemsDecoder =
    D.succeed Systems
        |> andMap (D.field "diesel" percent)
        |> andMap (D.field "fuelTank" percent)
        |> andMap (D.field "batteryBank" percent)
        |> andMap (D.field "tubes" percent)
        |> andMap (D.field "engine" percent)
        |> andMap (D.field "propeller" percent)
        |> andMap (D.field "oxygen" percent)
        |> andMap (D.field "ballast" percent)
        |> andMap (D.field "planes" percent)
        |> andMap (D.field "rudder" percent)
        |> andMap (D.field "sonar" percent)
        |> andMap (D.field "periscope" percent)
        |> andMap (D.field "deckgun" percent)
        |> andMap (D.field "crew" percent)


{-| Limits between 0 and 100; a destroyed part's limit is 0, as restore's
`readLimits` makes it.
-}
limitsDecoder : Float -> Systems -> D.Decoder Limits
limitsDecoder hull s =
    let
        limit key part =
            D.field key percent
                |> D.map
                    (\v ->
                        if part <= 0 then
                            0

                        else
                            v
                    )
    in
    D.succeed Limits
        |> andMap (limit "hull" hull)
        |> andMap (limit "diesel" s.diesel)
        |> andMap (limit "fuelTank" s.fuelTank)
        |> andMap (limit "batteryBank" s.batteryBank)
        |> andMap (limit "tubes" s.tubes)
        |> andMap (limit "engine" s.engine)
        |> andMap (limit "propeller" s.propeller)
        |> andMap (limit "oxygen" s.oxygen)
        |> andMap (limit "ballast" s.ballast)
        |> andMap (limit "planes" s.planes)
        |> andMap (limit "rudder" s.rudder)
        |> andMap (limit "sonar" s.sonar)
        |> andMap (limit "periscope" s.periscope)
        |> andMap (limit "deckgun" s.deckgun)
        |> andMap (limit "crew" s.crew)


{-| The boat in a current save at patrol time `now`, rejected where restore
rejects a current save. Saves from before the plant version, or missing any
field restore would fill in, are refused here.
-}
decoder : Float -> D.Decoder Boat
decoder now =
    D.map3 (\_ hull systems -> ( hull, systems ))
        (D.field "plantVersion" (check "the current plant" (\v -> v == 1) D.float))
        (D.field "hull" (between 0 100))
        (D.field "systems" systemsDecoder)
        |> D.andThen
            (\( hull, systems ) ->
                D.succeed Boat
                    |> andMap (D.field "x" finite)
                    |> andMap (D.field "y" finite)
                    |> andMap (D.field "depth" finite)
                    |> andMap (D.field "heading" finite)
                    |> andMap (D.field "pitch" finite)
                    |> andMap (optional "roll" finite)
                    |> andMap (D.field "speed" finite)
                    |> andMap (D.field "targetSpeed" finite)
                    |> andMap (D.field "targetHeading" finite)
                    |> andMap (D.field "targetDepth" finite)
                    |> andMap (D.field "verticalSpeed" finite)
                    |> andMap (D.succeed hull)
                    |> andMap (D.field "outerHull" percent)
                    |> andMap (D.field "flood" finite)
                    |> andMap (D.field "shock" finite)
                    |> andMap (D.field "fuel" finite)
                    |> andMap (D.field "fuelLeak" (between 0 1))
                    |> andMap (D.field "fuelFire" (between 0 24))
                    |> andMap (D.field "battery" finite)
                    |> andMap (D.field "oxygen" finite)
                    |> andMap (D.field "water" finite)
                    |> andMap (D.field "ballast" finite)
                    |> andMap (D.field "planes" finite)
                    |> andMap (D.field "rudder" finite)
                    |> andMap (D.field "propAngle" finite)
                    |> andMap (D.field "cavitation" finite)
                    |> andMap (D.field "propRpm" finite)
                    |> andMap (D.field "noise" finite)
                    |> andMap (D.field "silent" D.bool)
                    |> andMap (optional "gunLoudUntil" finite)
                    |> andMap (optional "unpoweredSince" (between 0 now))
                    |> andMap (D.field "repair" finite)
                    |> andMap (D.field "floodAlarm" D.bool)
                    |> andMap (D.field "collisionCooldown" finite)
                    |> andMap (D.field "collisionHits" (D.dict (between 0 now)))
                    |> andMap (D.field "bottomed" D.bool)
                    |> andMap (D.field "torps" (check "whole torpedoes" (\n -> n >= 0) D.int))
                    |> andMap (D.field "cookoff" D.bool)
                    |> andMap (D.field "engine" (named [ ( "diesel", Plant.Diesel ), ( "electric", Plant.Electric ) ]))
                    |> andMap (D.field "dieselMode" (named [ ( "charge", Plant.Charge ), ( "drive", Plant.Drive ), ( "assist", Plant.Assist ) ]))
                    |> andMap (D.field "pressureAlarm" (check "alarm level 0, 1 or 2" (\n -> 0 <= n && n <= 2) D.int))
                    |> andMap (D.field "criticalExposure" (check "exposure at or above zero" (\n -> n >= 0) finite))
                    |> andMap (D.field "imploded" D.bool)
                    |> andMap (D.field "scope" D.bool)
                    |> andMap (optional "scopeTravel" (between 0 1))
                    |> andMap (D.succeed systems)
                    |> andMap (D.field "repairLimits" (limitsDecoder hull systems))
                    |> andMap (D.field "drone" Drone.decoder)
            )



-- ENCODING


encodeParts : List ( String, Float ) -> E.Value
encodeParts =
    E.object << List.map (Tuple.mapSecond E.float)


systemFields : Parts a -> List ( String, Float )
systemFields p =
    [ ( "diesel", p.diesel ), ( "fuelTank", p.fuelTank ), ( "batteryBank", p.batteryBank ), ( "tubes", p.tubes ), ( "engine", p.engine ), ( "propeller", p.propeller ), ( "oxygen", p.oxygen )
    , ( "ballast", p.ballast ), ( "planes", p.planes ), ( "rudder", p.rudder ), ( "sonar", p.sonar ), ( "periscope", p.periscope ), ( "deckgun", p.deckgun ), ( "crew", p.crew )
    ]


{-| The boat's fields as a current save holds them, with the plant version. -}
encode : Boat -> List ( String, E.Value )
encode b =
    let
        field key enc =
            Maybe.map (\v -> ( key, enc v ))

        number ( key, v ) =
            ( key, E.float v )
    in
    List.map number
        [ ( "x", b.x ), ( "y", b.y ), ( "depth", b.depth ), ( "heading", b.heading ), ( "pitch", b.pitch ), ( "speed", b.speed ), ( "targetSpeed", b.targetSpeed )
        , ( "targetHeading", b.targetHeading ), ( "targetDepth", b.targetDepth ), ( "verticalSpeed", b.verticalSpeed ), ( "hull", b.hull ), ( "outerHull", b.outerHull )
        , ( "flood", b.flood ), ( "shock", b.shock ), ( "fuel", b.fuel ), ( "fuelLeak", b.fuelLeak ), ( "fuelFire", b.fuelFire ), ( "battery", b.battery ), ( "oxygen", b.oxygen )
        , ( "water", b.water ), ( "ballast", b.ballast ), ( "planes", b.planes ), ( "rudder", b.rudder ), ( "propAngle", b.propAngle ), ( "cavitation", b.cavitation )
        , ( "propRpm", b.propRpm ), ( "noise", b.noise ), ( "repair", b.repair ), ( "collisionCooldown", b.collisionCooldown ), ( "criticalExposure", b.criticalExposure )
        , ( "plantVersion", 1 )
        ]
        ++ [ ( "silent", E.bool b.silent ), ( "floodAlarm", E.bool b.floodAlarm ), ( "bottomed", E.bool b.bottomed ), ( "cookoff", E.bool b.cookoff ), ( "imploded", E.bool b.imploded )
           , ( "scope", E.bool b.scope ), ( "torps", E.int b.torps ), ( "pressureAlarm", E.int b.pressureAlarm ), ( "engine", E.string (engineName b.engine) )
           , ( "dieselMode", E.string (dieselModeName b.dieselMode) ), ( "collisionHits", E.dict identity E.float b.collisionHits )
           , ( "systems", encodeParts (systemFields b.systems) ), ( "repairLimits", encodeParts (( "hull", b.repairLimits.hull ) :: systemFields b.repairLimits) )
           , ( "drone", Drone.encode b.drone )
           ]
        ++ List.filterMap identity [ field "roll" E.float b.roll, field "gunLoudUntil" E.float b.gunLoudUntil, field "unpoweredSince" E.float b.unpoweredSince, field "scopeTravel" E.float b.scopeTravel ]
