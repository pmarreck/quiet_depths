module Sim.Acoustics exposing
    ( Event(..)
    , Heard
    , Kind(..)
    , Listener
    , Perceived
    , Source
    , airWaterPath
    , kindName
    , kinds
    , perceivedSound
    , propagationTime
    , spatialPan
    , update
    )

{-| Sound in the water and the air: when a sound reaches the listener, from
where, and how loud. Constant speeds over a flat air/water interface; not a
full ocean acoustic model. Typical speeds: NOAA,
<https://oceanservice.noaa.gov/facts/sound.html>.

Optional numbers follow the TypeScript's `value || default`, so a missing,
zero or NaN power counts as 1 and a missing, zero or NaN depth as 0.

-}

import Sim.Math as M exposing (exp, hypot2)


airSoundSpeed : Float
airSoundSpeed =
    340


waterSoundSpeed : Float
waterSoundSpeed =
    1500


type Kind
    = Launch
    | Detonation
    | Seeker
    | Sweep
    | Splashdown
    | Gunfire
    | Creak
    | Collapse
    | Settling
    | Thunder
    | Blast


kinds : List Kind
kinds =
    [ Launch, Detonation, Seeker, Sweep, Splashdown, Gunfire, Creak, Collapse, Settling, Thunder, Blast ]


kindName : Kind -> String
kindName kind =
    case kind of
        Launch ->
            "launch"

        Detonation ->
            "detonation"

        Seeker ->
            "seeker"

        Sweep ->
            "sweep"

        Splashdown ->
            "splashdown"

        Gunfire ->
            "gunfire"

        Creak ->
            "creak"

        Collapse ->
            "collapse"

        Settling ->
            "settling"

        Thunder ->
            "thunder"

        Blast ->
            "blast"


{-| Thunder and gunfire start in the air; everything else starts underwater.
-}
airborne : Kind -> Bool
airborne kind =
    case kind of
        Thunder ->
            True

        Gunfire ->
            True

        _ ->
            False


type alias Listener =
    { x : Float, y : Float, depth : Maybe Float, heading : Maybe Float }


type alias Source a =
    { a | kind : Kind, x : Float, y : Float, depth : Maybe Float, altitude : Maybe Float, power : Maybe Float }


type alias Perceived =
    { distance : Float, delay : Float, pan : Float, gain : Float, cutoff : Float }


{-| JavaScript's `value || fallback` for an optional number.
-}
or : Float -> Maybe Float -> Float
or fallback value =
    case value of
        Just v ->
            if M.isZero v || isNaN v then
                fallback

            else
                v

        Nothing ->
            fallback


{-| Fermat's principle: the fastest path from air to water over a flat
interface, found by bisection.
-}
airWaterPath : Float -> Float -> Float -> Float
airWaterPath horizontal airHeight waterDepth =
    let
        r : Float
        r =
            M.abs horizontal

        h : Float
        h =
            M.max 0 airHeight

        d : Float
        d =
            M.max 0 waterDepth
    in
    if M.isZero d then
        hypot2 r h / airSoundSpeed

    else if M.isZero h then
        hypot2 r d / waterSoundSpeed

    else
        let
            bisect : Int -> Float -> Float -> ( Float, Float )
            bisect i lo hi =
                if i == 48 then
                    ( lo, hi )

                else
                    let
                        x : Float
                        x =
                            (lo + hi) / 2

                        derivative : Float
                        derivative =
                            x / (airSoundSpeed * hypot2 x h) - (r - x) / (waterSoundSpeed * hypot2 (r - x) d)
                    in
                    if derivative > 0 then
                        bisect (i + 1) lo x

                    else
                        bisect (i + 1) x hi

            ( low, high ) =
                bisect 0 0 r

            crossing : Float
            crossing =
                (low + high) / 2
        in
        hypot2 crossing h / airSoundSpeed + hypot2 (r - crossing) d / waterSoundSpeed


propagationTime : Source a -> Listener -> Float
propagationTime source listener =
    let
        horizontal : Float
        horizontal =
            hypot2 (source.x - listener.x) (source.y - listener.y)

        depth : Float
        depth =
            M.max 0 (or 0 listener.depth)
    in
    if airborne source.kind then
        if depth <= 1 then
            hypot2 horizontal (M.max 0 (or 0 source.altitude - 3)) / airSoundSpeed

        else
            airWaterPath horizontal (or 0 source.altitude) depth

    else
        hypot2 horizontal (or 0 source.depth - depth) / waterSoundSpeed


spatialPan : { a | x : Float, y : Float } -> Listener -> Float
spatialPan source listener =
    let
        absolute : Float
        absolute =
            atan2 (source.x - listener.x) (source.y - listener.y)
    in
    sin (absolute - or 0 listener.heading * pi / 180)


perceivedSound : Source a -> Listener -> Perceived
perceivedSound source listener =
    let
        depth : Float
        depth =
            M.max 0 (or 0 listener.depth)

        horizontal : Float
        horizontal =
            hypot2 (source.x - listener.x) (source.y - listener.y)

        distance : Float
        distance =
            hypot2 horizontal (or 0 source.depth - depth)
    in
    if airborne source.kind then
        let
            under : Bool
            under =
                depth > 1
        in
        { distance = distance
        , delay = propagationTime source listener
        , pan = spatialPan source listener
        , gain =
            or 1 source.power
                / (1 + (hypot2 horizontal (or 0 source.altitude) / 3400) ^ 1.2)
                * (if under then
                    0.55 * exp (-depth / 170)

                   else
                    1
                  )
        , cutoff =
            if under then
                M.max 85 (950 / (1 + depth / 28))

            else
                3200
        }

    else
        { distance = distance
        , delay = propagationTime source listener
        , pan = spatialPan source listener
        , gain = M.clamp 0 1 (or 1 source.power / (1 + (distance / 220) ^ 1.25))
        , cutoff = M.max 130 (4200 / (1 + distance / 1200))
        }


{-| What the listener noticed this tick, in the order the sounds arrived in
the list: a sound loud enough to register, and a blast with its distance.
-}
type Event a
    = Received (Heard a)
    | BlastAt (Heard a) Float


type alias Heard a =
    Source { a | id : Int, time : Float, heard : Bool, heardAt : Maybe Float, perceived : Maybe Perceived }


{-| Marks each sound that has reached the listener by `now`, then keeps the
last two minutes of history, at most 96 sounds, so a resumed patrol does not
replay old sounds. Most ticks nothing is due and nothing is stale, and the
list comes back untouched after one check. Otherwise one pass from the newest
sound back keeps the newest 96 recent sounds and gathers the events in the
order they occur.
-}
update : Float -> Listener -> List (Heard a) -> ( List (Heard a), List (Event a) )
update now listener sounds =
    let
        listen : Heard a -> ( List (Heard a), Int, List (Event a) ) -> ( List (Heard a), Int, List (Event a) )
        listen source ( kept, count, events ) =
            let
                ( sound, arrived ) =
                    if source.heard || now - source.time < propagationTime source listener then
                        ( source, events )

                    else
                        let
                            perceived : Perceived
                            perceived =
                                perceivedSound source listener

                            heard : Heard a
                            heard =
                                { source | heard = True, heardAt = Just now, perceived = Just perceived }

                            blast : List (Event a)
                            blast =
                                if source.kind == Blast then
                                    BlastAt heard perceived.distance :: events

                                else
                                    events
                        in
                        ( heard
                        , if perceived.gain >= 0.002 then
                            Received heard :: blast

                          else
                            blast
                        )
            in
            if count < 96 && now - sound.time < 120 then
                ( sound :: kept, count + 1, arrived )

            else
                ( kept, count, arrived )

        settled : Int -> List (Heard a) -> Bool
        settled count list =
            case list of
                [] ->
                    count <= 96

                source :: rest ->
                    source.heard && now - source.time < 120 && settled (count + 1) rest
    in
    if settled 0 sounds then
        ( sounds, [] )

    else
        let
            ( recent, _, happened ) =
                List.foldr listen ( [], 0, [] ) sounds
        in
        ( recent, happened )
