module Sim.TorpedoSaves exposing (Restoring, restoreTorpedo)

{-| A saved torpedo, as untrusted JSON. Saves from before a field existed gain
it: the longest run, the distance its age implies, the boat as owner, its lock
as its intended target, the boat's depth (6 m at most), a fresh run's orders,
a wake starting where it is, and an id from the weapon sequence. Every field
is then checked. A field that is present keeps its value, even null, and is
checked as it stands. A player's torpedo has no launcher or aim: a damaged save
that gives one those fields loses them here, where the TypeScript keeps them
unread.
-}

import Json.Decode as D
import Sim.Math as M
import Sim.Torpedo as Torpedo exposing (DecoyTarget, Owner(..), Torpedo, Trace)


{-| The patrol fields restoring a torpedo reads and writes.
-}
type alias Restoring s p =
    { s | time : Float, depth : Float, weaponSequence : Int, patrol : { p | seed : Float } }


{-| A field as saved: missing, or present with some value, null included.
-}
type Saved
    = Missing
    | Present D.Value


saved : D.Value -> String -> Saved
saved value key =
    case D.decodeValue (D.field key D.value) value of
        Ok v ->
            Present v

        Err _ ->
            Missing


{-| A saved field decoded, or the default when it is missing; `Nothing` when
it is present but not what the decoder accepts.
-}
orDefault : D.Value -> String -> D.Decoder a -> a -> Maybe a
orDefault value key decoder default =
    case saved value key of
        Missing ->
            Just default

        Present v ->
            D.decodeValue decoder v |> Result.toMaybe


number : D.Value -> String -> Maybe Float
number value key =
    D.decodeValue (D.field key finiteFloat) value |> Result.toMaybe


safeInteger : Float -> Bool
safeInteger v =
    toFloat (floor v) == v && M.abs v <= 9007199254740991


andThen : Maybe a -> (a -> Maybe b) -> Maybe b
andThen m f =
    Maybe.andThen f m


restoreTorpedo : D.Value -> Restoring s p -> ( Maybe Torpedo, Restoring s p )
restoreTorpedo value s =
    case ( ( number value "x", number value "y" ), ( number value "heading", number value "age" ) ) of
        ( ( Just x, Just y ), ( Just heading, Just age ) ) ->
            let
                ( id, s1 ) =
                    case saved value "id" of
                        Missing ->
                            ( Just s.weaponSequence, { s | weaponSequence = s.weaponSequence + 1 } )

                        Present v ->
                            ( D.decodeValue finiteFloat v
                                |> Result.toMaybe
                                |> Maybe.andThen
                                    (\n ->
                                        if safeInteger n then
                                            Just (floor n)

                                        else
                                            Nothing
                                    )
                            , s
                            )
            in
            ( andThen id (\i -> checked value s1 i x y heading age), s1 )

        _ ->
            ( Nothing, s )


nullableString : D.Decoder (Maybe String)
nullableString =
    D.nullable D.string


checked : D.Value -> Restoring s p -> Int -> Float -> Float -> Float -> Float -> Maybe Torpedo
checked value s id x y heading age =
    andThen
        (case saved value "depth" of
            Missing ->
                let
                    -- `p.depth ?? min(s.depth, 6)`: a null depth is replaced for the defaults
                    -- below, though the saved null itself then fails the check.
                    defaultDepth : Float
                    defaultDepth =
                        M.min s.depth 6
                in
                Just ( defaultDepth, defaultDepth )

            Present v ->
                case D.decodeValue finiteFloat v of
                    Ok n ->
                        Just ( n, n )

                    Err _ ->
                        Nothing
        )
        (\( forDefaults, depth ) ->
            let
                orders : Torpedo.Orders
                orders =
                    Torpedo.torpedoOrders s.patrol.seed id heading forDefaults

                lockDefault : Maybe String
                lockDefault =
                    case saved value "lock" of
                        Present v ->
                            D.decodeValue nullableString v |> Result.withDefault Nothing

                        Missing ->
                            Nothing

                decoy : D.Decoder DecoyTarget
                decoy =
                    D.map4 DecoyTarget (D.field "x" finiteFloat) (D.field "y" finiteFloat) (D.field "depth" finiteFloat) (D.field "expiresAt" finiteFloat)

                trace : D.Decoder Trace
                trace =
                    D.map4 Trace (D.field "x" finiteFloat) (D.field "y" finiteFloat) (D.field "depth" finiteFloat) (D.field "time" finiteFloat)

                owner : Maybe Owner
                owner =
                    andThen (orDefault value "owner" D.string "player")
                        (\name ->
                            case name of
                                "player" ->
                                    Just PlayerTorpedo

                                "enemy" ->
                                    Maybe.map2 (\launcher aim -> EnemyTorpedo { launcher = launcher, aim = aim })
                                        (D.decodeValue (D.field "launcher" nullableString) value |> Result.toMaybe)
                                        (D.decodeValue (D.field "aim" (D.nullable (D.map2 (\px py -> { x = px, y = py }) (D.field "x" finiteFloat) (D.field "y" finiteFloat)))) value |> Result.toMaybe)

                                _ ->
                                    Nothing
                        )

                runLimit : Maybe Float
                runLimit =
                    orDefault value "runLimit" finiteFloat Torpedo.maxRun
                        |> Maybe.andThen
                            (\v ->
                                if 100 <= v && v <= Torpedo.maxRun then
                                    Just v

                                else
                                    Nothing
                            )
            in
            andThen runLimit <|
                \limit ->
                    andThen
                        (orDefault value "traveled" finiteFloat (M.min Torpedo.maxRun (age * Torpedo.torpedoSpeed))
                            |> Maybe.andThen
                                (\v ->
                                    if 0 <= v && v <= limit then
                                        Just v

                                    else
                                        Nothing
                                )
                        )
                    <|
                        \traveled ->
                            andThen
                                (orDefault value "runOut" finiteFloat orders.runOut
                                    |> Maybe.andThen
                                        (\v ->
                                            if 0 <= v then
                                                Just v

                                            else
                                                Nothing
                                        )
                                )
                            <|
                                \runOut ->
                                    andThen
                                        (orDefault value "searchDirection" finiteFloat orders.searchDirection
                                            |> Maybe.andThen
                                                (\v ->
                                                    if v == -1 || v == 1 then
                                                        Just v

                                                    else
                                                        Nothing
                                                )
                                        )
                                    <|
                                        \searchDirection ->
                                            andThen
                                                (orDefault value "tubeSide" finiteFloat orders.tubeSide
                                                    |> Maybe.andThen
                                                        (\v ->
                                                            if v == -1 || M.isZero v || v == 1 then
                                                                Just v

                                                            else
                                                                Nothing
                                                        )
                                                )
                                            <|
                                                \tubeSide ->
                                                    andThen (decoyCheckedAt value s.time) <|
                                                        \checkedAt ->
                                                            Maybe.map5
                                                                (\owned ( intended, lock ) ( pingAge, orderedHeading, orderedDepth ) ( pitch, searchAge ) ( decoysChecked, decoyTarget, ( diverted, path ) ) ->
                                                                    { id = id
                                                                    , owner = owned
                                                                    , runLimit = limit
                                                                    , traveled = traveled
                                                                    , x = x
                                                                    , y = y
                                                                    , depth = depth
                                                                    , age = age
                                                                    , intended = intended
                                                                    , lock = lock
                                                                    , pingAge = pingAge
                                                                    , orderedHeading = orderedHeading
                                                                    , orderedDepth = orderedDepth
                                                                    , pitch = pitch
                                                                    , tubeSide = tubeSide
                                                                    , searchAge = searchAge
                                                                    , runOut = runOut
                                                                    , searchDirection = searchDirection
                                                                    , decoysChecked = decoysChecked
                                                                    , decoyTarget = decoyTarget
                                                                    , diverted = diverted
                                                                    , heading = heading
                                                                    , path = path
                                                                    , decoyCheckedAt = checkedAt
                                                                    }
                                                                )
                                                                owner
                                                                (Maybe.map2 Tuple.pair (orDefault value "intended" nullableString lockDefault) (orDefault value "lock" nullableString Nothing))
                                                                (Maybe.map3 (\a b c -> ( a, b, c )) (orDefault value "pingAge" finiteFloat 99) (orDefault value "orderedHeading" finiteFloat orders.orderedHeading) (orDefault value "orderedDepth" finiteFloat orders.orderedDepth))
                                                                (Maybe.map2 Tuple.pair (orDefault value "pitch" finiteFloat orders.pitch) (orDefault value "searchAge" finiteFloat orders.searchAge))
                                                                (Maybe.map3 (\a b c -> ( a, b, c ))
                                                                    (orDefault value "decoysChecked" (D.list D.string) orders.decoysChecked)
                                                                    (orDefault value "decoyTarget" (D.nullable decoy) orders.decoyTarget)
                                                                    (Maybe.map2 Tuple.pair (orDefault value "diverted" D.bool orders.diverted) (orDefault value "path" (D.list trace) [ { x = x, y = y, depth = forDefaults, time = s.time } ]))
                                                                )
        )


{-| When the torpedo last checked a noisemaker: absent, or a time between the
patrol's start and now.
-}
decoyCheckedAt : D.Value -> Float -> Maybe (Maybe Float)
decoyCheckedAt value time =
    case saved value "decoyCheckedAt" of
        Missing ->
            Just Nothing

        Present v ->
            D.decodeValue finiteFloat v
                |> Result.toMaybe
                |> Maybe.andThen
                    (\t ->
                        if 0 <= t && t <= time then
                            Just (Just t)

                        else
                            Nothing
                    )


{-| A number that is finite, as `Number.isFinite` requires: JSON cannot carry
NaN or the infinities, but a value handed over from JavaScript can.
-}
finiteFloat : D.Decoder Float
finiteFloat =
    D.float
        |> D.andThen
            (\v ->
                if isNaN v || isInfinite v then
                    D.fail "not a finite number"

                else
                    D.succeed v
            )
