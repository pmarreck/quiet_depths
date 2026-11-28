module Sim.RestoreChecks exposing (check)

{-| The second half of restore's field checks, after the first half has
brought an older save up to date: every field a new patrol has must have
its type, then the boat, the sky, the systems and their repair limits, the
patrol record (an old fleet action's torpedo load migrated), the stores,
the mission's site, a route, the coastal traffic for an older save, the
contacts' sides and the blasts (an older save's ids, fuses and explosions
filled in). The records each decoder checks for itself are left to the
decoders.
-}

import Dict
import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission(..))
import Sim.Environment as Env
import Sim.Equipment as Equipment
import Sim.HunterReports as HunterReports
import Sim.Math as M
import Sim.PatrolCalendar as PatrolCalendar
import Sim.PatrolCreate as PatrolCreate
import Sim.SaveCodec exposing (optional)
import Sim.SaveFields as SaveFields exposing (Fields, absentOr, ensure, field, finite, integer, number, object, safeInteger, savedReport, time, truthy)
import Sim.SaveParts as SaveParts
import Sim.TrafficEncounters as TrafficEncounters
import Sim.WorldEncoder as WorldEncoder


type Shape
    = Number
    | Boolean
    | Array


shapeOf : D.Value -> Maybe Shape
shapeOf v =
    D.decodeValue (D.oneOf [ D.float |> D.map (\_ -> Just Number), D.bool |> D.map (\_ -> Just Boolean), D.list D.value |> D.map (\_ -> Just Array), D.succeed Nothing ]) v
        |> Result.withDefault Nothing


{-| Every number, switch and list a new patrol of the mission has, with the
same type here; a number must be finite.
-}
template : Mission -> Fields -> Bool
template m f =
    let
        fresh : Fields
        fresh =
            WorldEncoder.encodeWorld (PatrolCreate.createGame (PatrolMission.briefing m).id 19830604 { timeOfDay = Nothing, weather = Nothing, changing = Nothing, difficulty = E.null })
                |> object
                |> Maybe.withDefault Dict.empty
    in
    Dict.toList fresh
        |> List.all
            (\( key, v ) ->
                case shapeOf v of
                    Just Number ->
                        number key f /= Nothing

                    Just Boolean ->
                        field key D.bool f /= Nothing

                    Just Array ->
                        field key (D.list D.value) f /= Nothing

                    Nothing ->
                        True
            )


{-| The values the boat can never reach, the hulls, the plant's mode, the
phase and engine, the extraction point and the drone's mode.
-}
boat : Fields -> Bool
boat f =
    let
        t : Float
        t =
            time f

        inRange : String -> Float -> Float -> Bool
        inRange key low high =
            number key f |> Maybe.map (\v -> low <= v && v <= high) |> Maybe.withDefault False
    in
    -- Values the simulation can never reach: below zero for what counts down
    -- to zero or up from it, above 100 for what fills to 100 at most, and a
    -- fraction of a noisemaker.
    List.all (\key -> inRange key 0 (1 / 0)) [ "time", "pingAge", "pingCooldown", "photoCooldown", "shock", "flood" ]
        && List.all (\key -> inRange key 0 100) [ "battery", "oxygen", "fuel", "hull", "alert" ]
        && (number "decoys" f |> Maybe.map (\n -> integer n && 0 <= n) |> Maybe.withDefault False)
        && field "bottomed" D.bool f
        /= Nothing
        && inRange "outerHull" 0 100
        && inRange "criticalExposure" 0 (1 / 0)
        && List.member (number "pressureAlarm" f) [ Just 0, Just 1, Just 2 ]
        && (Dict.get "collisionHits" f |> Maybe.andThen object |> Maybe.map (Dict.values >> List.all (D.decodeValue finite >> Result.map (\v -> 0 <= v && v <= t) >> Result.withDefault False)) |> Maybe.withDefault False)
        && List.member (field "dieselMode" D.string f) [ Just "charge", Just "drive", Just "assist" ]
        && List.member (field "phase" D.string f) [ Just "objective", Just "extract" ]
        && List.member (field "engine" D.string f) [ Just "electric", Just "diesel" ]
        && field "home" (D.map2 (\_ _ -> ()) (D.field "x" finite) (D.field "y" finite)) f
        == Just ()
        && (Dict.get "drone" f |> Maybe.map truthy |> Maybe.withDefault False)
        && List.member (field "drone" (D.field "mode" D.string) f) [ Just "stowed", Just "remote", Just "return", Just "lost" ]


{-| The sky: its sailing day, filled for an older save, a chart seed if it
has one, its weather, starting hour, seed and whether it changes.
-}
sky : Fields -> Maybe Fields
sky f =
    case Dict.get "environment" f |> Maybe.andThen object of
        Just env0 ->
            let
                env : Fields
                env =
                    case Dict.get "startDay" env0 |> Maybe.map (D.decodeValue (D.null ())) of
                        Just (Err _) ->
                            env0

                        _ ->
                            Dict.insert "startDay" (number "seed" env0 |> Maybe.map (PatrolCalendar.sailingDay >> toFloat >> E.float) |> Maybe.withDefault (E.float (0 / 0))) env0

                integerIn : Float -> Float -> Float -> Bool
                integerIn low high v =
                    integer v && low <= v && v <= high
            in
            ensure
                ((number "startDay" env |> Maybe.map (integerIn 0 365) |> Maybe.withDefault False)
                    && absentOr "chartSeed" (integerIn 0 4294967295) env
                    && (field "startWeather" D.string env |> Maybe.map (\name -> List.any (\id -> Env.weatherIdName id == name) Env.weatherIds) |> Maybe.withDefault False)
                    && number "startHour" env
                    /= Nothing
                    && number "seed" env
                    /= Nothing
                    && field "changing" D.bool env
                    /= Nothing
                )
                (Dict.insert "environment" (E.dict identity identity env) f)

        Nothing ->
            Nothing


{-| `readLimits`: each part's condition and saved limit from 0 to 100, a
destroyed part's limit zero, and every limit 100 if none were saved.
-}
readLimits : List String -> Fields -> Maybe D.Value -> Maybe E.Value
readLimits keys parts saved =
    let
        valid : Maybe Float -> Maybe Float
        valid v =
            v
                |> Maybe.andThen
                    (\n ->
                        if 0 <= n && n <= 100 then
                            Just n

                        else
                            Nothing
                    )

        limitsOf : Maybe Fields
        limitsOf =
            case saved of
                Just v ->
                    object v

                Nothing ->
                    Just (Dict.fromList (List.map (\k -> ( k, E.float 100 )) keys))
    in
    limitsOf
        |> Maybe.andThen
            (\limits ->
                List.foldr
                    (\key acc ->
                        Maybe.map3
                            (\part limit rest ->
                                ( key
                                , E.float
                                    (if M.isZero part then
                                        0

                                     else
                                        limit
                                    )
                                )
                                    :: rest
                            )
                            (valid (number key parts))
                            (valid (number key limits))
                            acc
                    )
                    (Just [])
                    keys
            )
        |> Maybe.map E.object


{-| The systems' conditions and both sets of repair limits.
-}
systems : Fields -> Maybe Fields
systems f =
    let
        boatParts : Maybe Fields
        boatParts =
            Dict.get "systems" f |> Maybe.andThen object
    in
    case ( boatParts, Dict.get "drone" f |> Maybe.andThen object ) of
        ( Just parts, Just droneFields ) ->
            let
                systemKeys : List String
                systemKeys =
                    List.map Equipment.systemKey Equipment.systems
            in
            if List.all (\k -> number k parts |> Maybe.map (\v -> 0 <= v && v <= 100) |> Maybe.withDefault False) systemKeys then
                Maybe.map2
                    (\boatLimits droneLimits ->
                        f
                            |> Dict.insert "repairLimits" boatLimits
                            |> Dict.insert "drone" (E.dict identity identity (Dict.insert "repairLimits" droneLimits droneFields))
                    )
                    (readLimits ("hull" :: systemKeys) (Maybe.withDefault parts (Maybe.map (\h -> Dict.insert "hull" h parts) (Dict.get "hull" f))) (Dict.get "repairLimits" f))
                    (readLimits [ "hull", "mobility", "buoyancy", "camera" ] droneFields (Dict.get "repairLimits" droneFields))

            else
                Nothing

        _ ->
            Nothing


{-| The patrol record, and an old fleet action's torpedo load: patrols that
left port with three keep the rounds already spent.
-}
patrolRecord : Mission -> Fields -> Maybe Fields
patrolRecord m f =
    case Dict.get "patrol" f |> Maybe.andThen object of
        Just record ->
            if List.all (\k -> number k record /= Nothing) [ "seed", "photoGoal", "trackGoal", "variant" ] && (field "scopeSteerBearing" (D.nullable finite) f /= Nothing) then
                let
                    migrated : Fields
                    migrated =
                        if Dict.member "startingTorpedoes" record then
                            f

                        else
                            let
                                torps : Float
                                torps =
                                    number "torps" f |> Maybe.withDefault (0 / 0)

                                load : Float
                                load =
                                    toFloat PatrolMission.startingTorpedoes

                                patrol : Bool
                                patrol =
                                    field "status" D.string f == Just "patrol"

                                oldFleetLoad : Bool
                                oldFleetLoad =
                                    m == Tiebreaker && torps <= 3
                            in
                            f
                                |> Dict.insert "patrol"
                                    (E.dict identity
                                        identity
                                        (Dict.insert "startingTorpedoes"
                                            (E.float
                                                (if oldFleetLoad && not patrol then
                                                    3

                                                 else
                                                    load
                                                )
                                            )
                                            record
                                        )
                                    )
                                |> (\g ->
                                        if oldFleetLoad && patrol then
                                            Dict.insert "torps" (E.float (torps + load - 3)) g

                                        else
                                            g
                                   )
                in
                ensure (field "patrol" (D.field "startingTorpedoes" finite) migrated |> Maybe.map (\n -> safeInteger n && 0 <= n) |> Maybe.withDefault False) migrated

            else
                Nothing

        Nothing ->
            Nothing


{-| The torpedo run setting, reports, the air support's timing and last
report of the boat, and the route.
-}
stores : Fields -> Bool
stores f =
    let
        t : Float
        t =
            time f

        report : D.Decoder Bool
        report =
            D.map3 (\_ _ at -> at <= t) (D.field "id" D.string) (D.field "text" D.string) (D.field "time" finite)

        timing : String -> D.Decoder Bool
        timing key =
            D.field key (D.nullable finite) |> D.map (\_ -> True)

        lastKnown : D.Decoder Bool
        lastKnown =
            D.oneOf
                [ D.field "lastKnown" D.value
                    |> D.andThen
                        (\v ->
                            if truthy v then
                                D.map (HunterReports.validReport t True) (D.field "lastKnown" (savedReport True))

                            else
                                D.succeed True
                        )
                , D.succeed True
                ]

        support : D.Decoder Bool
        support =
            D.map5 (\status _ a b c -> List.member status [ "idle", "arming", "airborne", "spent" ] && a && b && c)
                (D.field "status" D.string)
                (D.field "base" (D.map2 Tuple.pair (D.field "x" finite) (D.field "y" finite)))
                (timing "requestedAt")
                (timing "launchAt")
                lastKnown

        route : Bool
        route =
            case Dict.get "route" f of
                Just v ->
                    D.decodeValue (D.oneOf [ D.null True, D.map3 (\_ _ radius -> Maybe.map (\r -> 0 < r) radius |> Maybe.withDefault True) (D.field "x" finite) (D.field "y" finite) (optional "radius" finite) ]) v
                        |> Result.withDefault False

                Nothing ->
                    True
    in
    (number "runSetting" f |> Maybe.map (\v -> 100 <= v && v <= 4320) |> Maybe.withDefault False)
        && (field "reports" (D.list (D.oneOf [ report, D.succeed False ])) f |> Maybe.map (List.all identity) |> Maybe.withDefault False)
        && field "airSupport" support f
        == Just True
        && route


{-| Rescues and the survey have a site of their mission's kind and an
operation; every other mission has neither.
-}
site : Mission -> Fields -> Bool
site m f =
    let
        kind : Maybe String
        kind =
            case m of
                UnderseaRescue ->
                    Just "sub"

                SurfaceRescue ->
                    Just "surface"

                Survey ->
                    Just "wreck"

                _ ->
                    Nothing

        given : String -> Bool
        given key =
            Dict.get key f |> Maybe.map truthy |> Maybe.withDefault False

        isNull : String -> Bool
        isNull key =
            field key (D.null ()) f == Just ()
    in
    case kind of
        Just k ->
            given "operation" && field "site" (D.field "kind" D.string) f == Just k

        Nothing ->
            isNull "site" && isNull "operation"


{-| A contact may carry a side only in the convoy defense, the fleet action,
or when it is an incidental ship.
-}
sides : Mission -> Fields -> Bool
sides m f =
    let
        incidental : List String
        incidental =
            field "ships"
                (D.list
                    (D.oneOf
                        [ D.map2
                            (\id i ->
                                if i then
                                    Just id

                                else
                                    Nothing
                            )
                            (D.field "id" D.string)
                            (D.oneOf [ D.field "incidental" D.bool, D.succeed False ])
                        , D.succeed Nothing
                        ]
                    )
                )
                f
                |> Maybe.withDefault []
                |> List.filterMap identity

        sided : Bool
        sided =
            Dict.member "convoy" f && (Dict.get "convoy" f |> Maybe.map truthy |> Maybe.withDefault False) || m == Tiebreaker

        contact : D.Decoder Bool
        contact =
            D.map3
                (\id side probable ->
                    List.all
                        (\s ->
                            case s of
                                Just name ->
                                    (sided || List.member id incidental) && (name == "friendly" || name == "hostile")

                                Nothing ->
                                    True
                        )
                        [ side, probable ]
                )
                (D.oneOf [ D.field "id" D.string, D.succeed "" ])
                (optional "side" D.string)
                (optional "probableSide" D.string)
    in
    field "contacts" (D.list (D.oneOf [ contact, D.succeed False ])) f |> Maybe.map (List.all identity) |> Maybe.withDefault False


{-| Every submarine has a depth.
-}
submarineDepths : Fields -> Bool
submarineDepths f =
    field "ships" (D.list (D.oneOf [ D.map2 (\kind depth -> kind /= "sub" || depth) (D.field "kind" D.string) (D.oneOf [ D.field "depth" D.value |> D.map (\_ -> True), D.succeed False ]), D.succeed True ])) f
        |> Maybe.map (List.all identity)
        |> Maybe.withDefault True


{-| An older save's coastal traffic, resumed at its clock.
-}
traffic : Fields -> Fields
traffic f =
    if Dict.member "traffic" f then
        f

    else
        Dict.insert "traffic" (SaveParts.encodeTraffic (TrafficEncounters.resumeTraffic (time f) (field "patrol" (D.field "seed" finite) f |> Maybe.withDefault 0))) f


{-| Blasts: an older save's ids from the sound sequence, total fuses at
least a second, and whether and when each exploded.
-}
blasts : Fields -> Maybe Fields
blasts f =
    let
        t : Float
        t =
            time f

        start : Maybe ( List E.Value, Float )
        start =
            number "soundSequence" f |> Maybe.map (Tuple.pair [])

        step : D.Value -> Maybe ( List E.Value, Float ) -> Maybe ( List E.Value, Float )
        step v acc =
            Maybe.andThen
                (\( done, sequence ) ->
                    case object v of
                        Just b0 ->
                            if List.all (\k -> number k b0 /= Nothing) [ "x", "y", "depth", "delay", "age" ] then
                                let
                                    age : Float
                                    age =
                                        number "age" b0 |> Maybe.withDefault 0

                                    ( b1, next ) =
                                        if Dict.member "id" b0 then
                                            ( b0, sequence )

                                        else
                                            ( Dict.insert "id" (E.float sequence) b0, sequence + 1 )

                                    b2 : Fields
                                    b2 =
                                        b1
                                            |> SaveFields.fill "totalDelay" (E.float (M.max 1 (number "delay" b1 |> Maybe.withDefault 0)))
                                            |> SaveFields.fill "exploded" (E.bool (0 < age))

                                    b3 : Fields
                                    b3 =
                                        if field "exploded" D.value b2 |> Maybe.map truthy |> Maybe.withDefault False then
                                            SaveFields.fill "explodedAt" (E.float (t - age)) b2

                                        else
                                            b2
                                in
                                Just ( E.dict identity identity b3 :: done, next )

                            else
                                Nothing

                        Nothing ->
                            Nothing
                )
                acc
    in
    field "blasts" (D.list D.value) f
        |> Maybe.andThen (List.foldl step start)
        |> Maybe.map (\( done, sequence ) -> f |> Dict.insert "blasts" (E.list identity (List.reverse done)) |> Dict.insert "soundSequence" (E.float sequence))


{-| Restore's field checks after the first half, or nothing when the save
is refused.
-}
check : Mission -> Fields -> Maybe Fields
check m f =
    ensure (template m f && boat f) f
        |> Maybe.andThen sky
        |> Maybe.andThen systems
        |> Maybe.andThen (patrolRecord m)
        |> Maybe.andThen (\g -> ensure (stores g && site m g && sides m g && submarineDepths g) g)
        |> Maybe.map traffic
        |> Maybe.andThen blasts
