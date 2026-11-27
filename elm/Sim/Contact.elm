module Sim.Contact exposing (Contact, SavedFix, Sighting(..), SweepArea, decoder, designation, encode, encodeFix, savedFix)

{-| A sonar or visual contact, as saves hold it. Like `Sim.Ship` it mirrors
the TypeScript field for field while both implementations change together;
see docs/plan\_context/ship-and-contact-records.md.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Math as M
import Sim.Vessel as Vessel exposing (Kind, Side)


{-| How the contact was gained.
-}
type Sighting
    = Visual
    | Passive
    | Active
    | Lights
    | Lamp
    | Satellite


sightings : List Sighting
sightings =
    let
        from : Sighting -> List Sighting
        from s =
            s
                :: (case s of
                        Visual ->
                            from Passive

                        Passive ->
                            from Active

                        Active ->
                            from Lights

                        Lights ->
                            from Lamp

                        Lamp ->
                            from Satellite

                        Satellite ->
                            []
                   )
    in
    from Visual


sightingName : Sighting -> String
sightingName s =
    case s of
        Visual ->
            "visual"

        Passive ->
            "passive"

        Active ->
            "active"

        Lights ->
            "lights"

        Lamp ->
            "lamp"

        Satellite ->
            "satellite"


{-| A fix as saved. Restore accepts an older fix without its velocities and
uncertainties and keeps it as it is; it then counts as a fix that cannot be
projected.
-}
type alias SavedFix =
    { x : Float
    , y : Float
    , time : Float
    , vx : Maybe Float
    , vy : Maybe Float
    , positionSigma : Maybe Float
    , velocitySigma : Maybe Float
    , maneuverSigma : Maybe Float
    , source : Maybe String
    }


{-| The area a hunter swept for this contact.
-}
type alias SweepArea =
    { x : Float, y : Float, size : Float, time : Float }


type alias Contact =
    { id : String
    , label : String
    , x : Float
    , y : Float
    , range : Float
    , bearing : Float
    , confidence : Float
    , age : Float
    , identified : Maybe Bool
    , name : Maybe String
    , side : Maybe Side
    , probableSide : Maybe Side
    , kind : Maybe Kind
    , military : Maybe Bool
    , method : Maybe Sighting
    , fix : Maybe SavedFix
    , lastSweep : Maybe Float
    , sweepArea : Maybe SweepArea
    , passiveAt : Maybe Float
    , passiveBearing : Maybe Float
    , passiveX : Maybe Float
    , passiveY : Maybe Float
    , depthEstimate : Maybe Float
    , courseEstimated : Maybe Bool
    }


{-| Contact labels: A1 to A9, then B1, and after Z9, AA1, for any positive
safe integer. The arithmetic stays in floats: Elm's `//` truncates through
32 bits.
-}
designation : Float -> String
designation index =
    let
        letters : Float -> String -> String
        letters column acc =
            if column <= 0 then
                acc

            else
                letters (toFloat (floor ((column - 1) / 26))) (String.fromChar (Char.fromCode (65 + round (M.remainder (column - 1) 26))) ++ acc)
    in
    letters (toFloat (floor ((index - 1) / 9)) + 1) "" ++ String.fromFloat (M.remainder (index - 1) 9 + 1)



-- DECODING


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


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


check : String -> (a -> Bool) -> D.Decoder a -> D.Decoder a
check problem ok =
    D.andThen
        (\v ->
            if ok v then
                D.succeed v

            else
                D.fail problem
        )


finite : D.Decoder Float
finite =
    check "a finite number" (\n -> not (isNaN n || isInfinite n)) D.float


{-| A moment between the patrol's start and now.
-}
moment : Float -> D.Decoder Float
moment now =
    check "a time between the start and now" (\t -> t >= 0 && t <= now) finite


named : String -> List a -> (a -> String) -> D.Decoder a
named what values name =
    D.string
        |> D.andThen
            (\given ->
                case List.filter (\v -> name v == given) values of
                    v :: _ ->
                        D.succeed v

                    [] ->
                        D.fail ("unknown " ++ what ++ " " ++ given)
            )


{-| Restore reads a missing or null velocity or uncertainty as its default
(`??`), so either decodes as `Nothing`; an uncertainty may not be negative.
-}
defaulted : String -> D.Decoder (Maybe Float)
defaulted key =
    optional key (D.nullable finite) |> D.map (Maybe.andThen identity)


savedFix : D.Decoder SavedFix
savedFix =
    let
        sigma : String -> D.Decoder (Maybe Float)
        sigma key =
            defaulted key |> check "an uncertainty at or above zero" (Maybe.withDefault 0 >> (\n -> n >= 0))
    in
    D.succeed SavedFix
        |> andMap (D.field "x" finite)
        |> andMap (D.field "y" finite)
        |> andMap (D.field "time" (check "a time at or after zero" (\t -> t >= 0) finite))
        |> andMap (defaulted "vx")
        |> andMap (defaulted "vy")
        |> andMap (sigma "positionSigma")
        |> andMap (sigma "velocitySigma")
        |> andMap (sigma "maneuverSigma")
        |> andMap (optional "source" D.string)


{-| Labels from before the lettered designations, `Sierra 12`, take the
designation of their number, as restore rewrites them.
-}
migratedLabel : D.Decoder String
migratedLabel =
    D.string
        |> D.andThen
            (\label ->
                case String.split " " label of
                    [ "Sierra", digits ] ->
                        case ( String.all Char.isDigit digits && not (String.isEmpty digits), String.toFloat digits ) of
                            ( True, Just n ) ->
                                if n >= 1 && n <= 9007199254740991 then
                                    D.succeed (designation n)

                                else
                                    D.fail "no designation for that number"

                            _ ->
                                D.succeed label

                    _ ->
                        D.succeed label
            )


{-| A saved contact at patrol time `now`, rejected where restore rejects it.
Whether a contact may carry a side at all depends on the mission and the
traffic, and stays with the patrol's decoder.
-}
decoder : Float -> D.Decoder Contact
decoder now =
    D.succeed Contact
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "label" migratedLabel)
        |> andMap (D.field "x" finite)
        |> andMap (D.field "y" finite)
        |> andMap (D.field "range" finite)
        |> andMap (D.field "bearing" finite)
        |> andMap (D.field "confidence" finite)
        |> andMap (D.field "age" finite)
        |> andMap (optional "identified" D.bool)
        |> andMap (optional "name" D.string)
        |> andMap (optional "side" (named "side" Vessel.sides Vessel.sideName))
        |> andMap (optional "probableSide" (named "side" Vessel.sides Vessel.sideName))
        |> andMap (optional "kind" (named "kind" Vessel.kinds Vessel.kindName))
        |> andMap (optional "military" D.bool)
        |> andMap (optional "method" (named "method" sightings sightingName))
        |> andMap (optional "fix" savedFix)
        |> andMap (optional "lastSweep" (moment now))
        |> andMap
            (optional "sweepArea"
                (D.map4 SweepArea (D.field "x" finite) (D.field "y" finite) (D.field "size" (check "a 900 m sweep" (\n -> n == 900) finite)) (D.field "time" (check "a time no later than now" (\t -> t <= now) finite)))
            )
        |> andMap (optional "passiveAt" (moment now))
        |> andMap (optional "passiveBearing" D.float)
        |> andMap (optional "passiveX" D.float)
        |> andMap (optional "passiveY" D.float)
        |> andMap (optional "depthEstimate" finite)
        |> andMap (optional "courseEstimated" D.bool)
        |> check "a passive bearing with its position" passiveComplete


passiveComplete : Contact -> Bool
passiveComplete c =
    let
        isFinite : Float -> Bool
        isFinite n =
            not (isNaN n || isInfinite n)
    in
    case c.passiveAt of
        Nothing ->
            True

        Just _ ->
            List.all (Maybe.map isFinite >> Maybe.withDefault False) [ c.passiveBearing, c.passiveX, c.passiveY ]



-- ENCODING


{-| The contact as a save holds it; absent fields stay absent.
-}
encode : Contact -> E.Value
encode c =
    let
        field : String -> (a -> E.Value) -> Maybe a -> Maybe ( String, E.Value )
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    E.object
        ([ ( "id", E.string c.id )
         , ( "label", E.string c.label )
         , ( "x", E.float c.x )
         , ( "y", E.float c.y )
         , ( "range", E.float c.range )
         , ( "bearing", E.float c.bearing )
         , ( "confidence", E.float c.confidence )
         , ( "age", E.float c.age )
         ]
            ++ List.filterMap identity
                [ field "identified" E.bool c.identified
                , field "name" E.string c.name
                , field "side" (Vessel.sideName >> E.string) c.side
                , field "probableSide" (Vessel.sideName >> E.string) c.probableSide
                , field "kind" (Vessel.kindName >> E.string) c.kind
                , field "military" E.bool c.military
                , field "method" (sightingName >> E.string) c.method
                , field "fix" encodeFix c.fix
                , field "lastSweep" E.float c.lastSweep
                , field "sweepArea" (\a -> E.object [ ( "x", E.float a.x ), ( "y", E.float a.y ), ( "size", E.float a.size ), ( "time", E.float a.time ) ]) c.sweepArea
                , field "passiveAt" E.float c.passiveAt
                , field "passiveBearing" E.float c.passiveBearing
                , field "passiveX" E.float c.passiveX
                , field "passiveY" E.float c.passiveY
                , field "depthEstimate" E.float c.depthEstimate
                , field "courseEstimated" E.bool c.courseEstimated
                ]
        )


encodeFix : SavedFix -> E.Value
encodeFix f =
    let
        field : String -> (a -> E.Value) -> Maybe a -> Maybe ( String, E.Value )
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    E.object
        ([ ( "x", E.float f.x ), ( "y", E.float f.y ), ( "time", E.float f.time ) ]
            ++ List.filterMap identity
                [ field "vx" E.float f.vx
                , field "vy" E.float f.vy
                , field "positionSigma" E.float f.positionSigma
                , field "velocitySigma" E.float f.velocitySigma
                , field "maneuverSigma" E.float f.maneuverSigma
                , field "source" E.string f.source
                ]
        )
