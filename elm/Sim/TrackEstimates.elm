module Sim.TrackEstimates exposing (ChartContact(..), ExactPosition, Observation, Packet, Track, applyReconPacket, chartContacts, designation, estimate, fixContact)

{-| Timestamped observations of contacts, independent of live vessel state:
fixing a contact from an observation, folding a reconnaissance packet into
the contact list, and the omniscient chart's view. Distances are meters,
velocity is east and north in m/s.
-}

import Sim.Contact as Contact exposing (Contact, SavedFix, Sighting(..))
import Sim.ContactReadings as Readings
import Sim.Math as M
import Sim.Ship exposing (Ship)
import Sim.Vessel exposing (Kind(..), Side(..))


designation : Float -> String
designation =
    Contact.designation


finite : Float -> Bool
finite n =
    not (isNaN n || isInfinite n)


{-| What an observation may say; unsaid velocities and uncertainties take
the defaults.
-}
type alias Observation =
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


{-| The contact with the observation as its fix, or `Nothing` when the
observation is not finite, has a negative uncertainty, or is older than the
fix the contact already holds.
-}
fixContact : Observation -> { c | fix : Maybe SavedFix } -> Maybe { c | fix : Maybe SavedFix }
fixContact o contact =
    if not (finite o.x && finite o.y && finite o.time) || o.time < 0 then
        Nothing

    else
        let
            vx : Float
            vx =
                Maybe.withDefault 0 o.vx

            vy : Float
            vy =
                Maybe.withDefault 0 o.vy

            positionSigma : Float
            positionSigma =
                Maybe.withDefault 0 o.positionSigma

            velocitySigma : Float
            velocitySigma =
                Maybe.withDefault 0.25 o.velocitySigma

            maneuverSigma : Float
            maneuverSigma =
                Maybe.withDefault 0.008 o.maneuverSigma

            sigmas : List Float
            sigmas =
                [ positionSigma, velocitySigma, maneuverSigma ]

            older : Bool
            older =
                case contact.fix of
                    Just held ->
                        finite held.time && o.time < held.time

                    Nothing ->
                        False
        in
        if not (List.all finite (vx :: vy :: sigmas)) || List.any (\n -> n < 0) sigmas || older then
            Nothing

        else
            Just
                { contact
                    | fix =
                        Just
                            { x = o.x
                            , y = o.y
                            , time = o.time
                            , vx = Just vx
                            , vy = Just vy
                            , positionSigma = Just positionSigma
                            , velocitySigma = Just velocitySigma
                            , maneuverSigma = Just maneuverSigma
                            , source =
                                Just
                                    (case o.source of
                                        Just source ->
                                            if String.isEmpty source then
                                                "observation"

                                            else
                                                source

                                        Nothing ->
                                            "observation"
                                    )
                            }
                }


{-| A saved fix as the contact readings take it; an older fix without its
velocities or uncertainties cannot be projected.
-}
readingFix : SavedFix -> Maybe Readings.Fix
readingFix f =
    Maybe.map5 (\vx vy p v m -> Readings.Fix f.x f.y f.time vx vy p v m) f.vx f.vy f.positionSigma f.velocitySigma f.maneuverSigma


estimate : Contact -> Float -> Maybe Readings.Estimate
estimate c time =
    Readings.estimateAt (Just { x = c.x, y = c.y, range = c.range, bearing = c.bearing, confidence = c.confidence, age = c.age, fix = Maybe.andThen readingFix c.fix }) time


{-| One satellite track. A track's name, side, kind and flag are trusted only
when they have the right type, as the TypeScript's `typeof` checks do.
-}
type alias Track =
    { id : String
    , x : Float
    , y : Float
    , time : Maybe Float
    , vx : Maybe Float
    , vy : Maybe Float
    , positionSigma : Maybe Float
    , velocitySigma : Maybe Float
    , maneuverSigma : Maybe Float
    , identified : Bool
    , name : Maybe String
    , side : Maybe Side
    , kind : Maybe Kind
    , military : Maybe Bool
    }


type alias Packet =
    { tracks : List Track, capturedAt : Float, receivedAt : Float }


observation : Float -> Track -> Observation
observation capturedAt t =
    { x = t.x
    , y = t.y
    , time = Maybe.withDefault capturedAt t.time
    , vx = Just (Maybe.withDefault 0 t.vx)
    , vy = Just (Maybe.withDefault 0 t.vy)
    , positionSigma = Just (Maybe.withDefault 0 t.positionSigma)
    , velocitySigma = Just (Maybe.withDefault 0.25 t.velocitySigma)
    , maneuverSigma = Just (Maybe.withDefault 0.008 t.maneuverSigma)
    , source = Just "satellite"
    }


safeInteger : Float -> Bool
safeInteger n =
    finite n && toFloat (floor n) == n && M.abs n <= 9007199254740991


unique : List String -> Bool
unique ids =
    case ids of
        [] ->
            True

        id :: rest ->
            not (List.member id rest) && unique rest


{-| Folds a reconnaissance packet into the contacts: each track fixes its
contact, or a new satellite contact, and an identified track names it. A
packet from the future, with more than 256 tracks, repeated ids or any track
that cannot fix a contact changes nothing.
-}
applyReconPacket : Packet -> { s | time : Float, x : Float, y : Float, contacts : List Contact, nextId : Float } -> Maybe { s | time : Float, x : Float, y : Float, contacts : List Contact, nextId : Float }
applyReconPacket packet s =
    let
        observations : List ( Track, Observation )
        observations =
            List.map (\t -> ( t, observation packet.capturedAt t )) packet.tracks

        sound : ( Track, Observation ) -> Bool
        sound ( _, o ) =
            M.notLess packet.capturedAt o.time && fixContact o { fix = Nothing } /= Nothing
    in
    if
        not (finite s.time && finite s.x && finite s.y && finite packet.capturedAt && finite packet.receivedAt)
            || (List.length packet.tracks > 256)
            || (s.time < packet.receivedAt)
            || (packet.receivedAt < packet.capturedAt)
            || not (unique (List.map .id packet.tracks))
            || not (List.all sound observations)
    then
        Nothing

    else
        Just
            (List.foldl (apply s)
                { s
                    | nextId =
                        if safeInteger s.nextId && s.nextId >= 1 then
                            s.nextId

                        else
                            1
                }
                observations
            )


apply : { a | time : Float, x : Float, y : Float } -> ( Track, Observation ) -> { s | contacts : List Contact, nextId : Float } -> { s | contacts : List Contact, nextId : Float }
apply at ( track, o ) s =
    let
        ( existing, withContact, nextId ) =
            case List.filter (\c -> c.id == track.id) s.contacts of
                c :: _ ->
                    ( c, s.contacts, s.nextId )

                [] ->
                    let
                        fresh : Contact
                        fresh =
                            { id = track.id
                            , label = designation s.nextId
                            , x = track.x
                            , y = track.y
                            , range = 0
                            , bearing = 0
                            , confidence = 0
                            , age = 0
                            , identified = Just False
                            , name = Nothing
                            , side = Nothing
                            , probableSide = Nothing
                            , kind = Nothing
                            , military = Nothing
                            , method = Just Satellite
                            , fix = Nothing
                            , lastSweep = Nothing
                            , sweepArea = Nothing
                            , passiveAt = Nothing
                            , passiveBearing = Nothing
                            , passiveX = Nothing
                            , passiveY = Nothing
                            , depthEstimate = Nothing
                            , courseEstimated = Nothing
                            }
                    in
                    ( fresh, s.contacts ++ [ fresh ], s.nextId + 1 )

        fixed : Contact
        fixed =
            case fixContact o existing of
                Just c ->
                    case estimate c at.time of
                        Just e ->
                            { c
                                | x = o.x
                                , y = o.y
                                , range = M.hypot2 (e.x - at.x) (e.y - at.y)
                                , bearing = M.remainder (atan2 (e.x - at.x) (e.y - at.y) * 180 / pi + 360) 360
                                , confidence =
                                    case o.positionSigma of
                                        Just sigma ->
                                            if M.isZero sigma then
                                                1

                                            else
                                                M.clamp 0.2 0.95 (1 - sigma / 1200)

                                        Nothing ->
                                            1
                                , age = e.age
                                , method = Just Satellite
                            }

                        Nothing ->
                            c

                Nothing ->
                    existing

        named : Contact
        named =
            case ( track.identified, track.name ) of
                ( True, Just name ) ->
                    { fixed
                        | identified = Just True
                        , name = Just name
                        , side = orKeep track.side fixed.side
                        , kind = orKeep track.kind fixed.kind
                        , military = orKeep track.military fixed.military
                    }

                _ ->
                    fixed
    in
    { s | contacts = replaceFirst track.id named withContact, nextId = nextId }


{-| Only the first contact with the id, as `find` returns it.
-}
replaceFirst : String -> Contact -> List Contact -> List Contact
replaceFirst id replacement contacts =
    case contacts of
        [] ->
            []

        c :: rest ->
            if c.id == id then
                replacement :: rest

            else
                c :: replaceFirst id replacement rest


orKeep : Maybe a -> Maybe a -> Maybe a
orKeep new old =
    case new of
        Just _ ->
            new

        Nothing ->
            old


{-| A chart entry: an observed contact or, on the omniscient chart, a
hostile warship's exact position and motion.
-}
type ChartContact
    = Observed Contact
    | Exact ExactPosition


type alias ExactPosition =
    { id : String, name : String, kind : Kind, military : Maybe Bool, side : Maybe Side, x : Float, y : Float, depthEstimate : Maybe Float, time : Float, vx : Float, vy : Float }


{-| The omniscient chart replaces each hostile warship's contact with its
exact position; on a long patrol's search, only for warships already
identified (or submarines already fixed).
-}
chartContacts : { s | omniscientChart : Bool, searching : Bool, contacts : List Contact, ships : List Ship, time : Float } -> List ChartContact
chartContacts s =
    if not s.omniscientChart then
        List.map Observed s.contacts

    else
        let
            identified : List String
            identified =
                List.filter (\c -> c.identified == Just True || c.kind == Just Submarine && c.fix /= Nothing) s.contacts |> List.map .id

            hostile : Ship -> Bool
            hostile ship =
                ship.military == Just True && ship.side /= Just Friendly && (not s.searching || List.member ship.id identified)

            hostileIds : List String
            hostileIds =
                List.filter hostile s.ships |> List.map .id

            exact : Ship -> ExactPosition
            exact ship =
                let
                    angle : Float
                    angle =
                        ship.heading * pi / 180
                in
                { id = ship.id
                , name = ship.name
                , kind = ship.kind
                , military = ship.military
                , side = ship.side
                , x = ship.x
                , y = ship.y
                , depthEstimate =
                    if ship.kind == Submarine then
                        ship.depth

                    else
                        Nothing
                , time = s.time
                , vx = sin angle * ship.speed * 0.514444
                , vy = cos angle * ship.speed * 0.514444
                }
        in
        List.filterMap
            (\c ->
                if List.member c.id hostileIds then
                    Nothing

                else
                    Just (Observed c)
            )
            s.contacts
            ++ List.filterMap
                (\ship ->
                    if List.member ship.id hostileIds && ship.hull > 0 then
                        Just (Exact (exact ship))

                    else
                        Nothing
                )
                s.ships
