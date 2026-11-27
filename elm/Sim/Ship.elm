module Sim.Ship exposing (Order, Parley, Pursuit, Report, Ship, decoder, encode)

{-| One vessel at sea, as saves hold it. The record mirrors the TypeScript
field for field while both implementations change together: the fields a
save must have are plain and every other is a `Maybe`, so a save
round-trips exactly. See docs/plan\_context/ship-and-contact-records.md.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.PatrolReports exposing (WreckMark)
import Sim.SignalLamp exposing (LampFix)
import Sim.Suspicion exposing (Clue)
import Sim.Vessel as Vessel exposing (Kind, Side)


{-| Whether a hunter holds the player: absent and `null` both mean not.
-}
type Pursuit
    = Tracking
    | Searching
    | Decoy


type Order
    = Watch
    | Approach
    | Stop
    | Warn
    | Fight
    | Retreat


{-| A cold-watch ship's stand toward another.
-}
type alias Parley =
    { against : String, level : Float, order : Order, range : Float, next : Float, cruise : Float, origin : Maybe { x : Float, y : Float, time : Float } }


{-| Where a hunter last placed the player, and why.
-}
type alias Report =
    { x : Float, y : Float, depth : Float, heading : Float, speed : Float, time : Float, reason : Maybe String }


type alias Ship =
    { id : String
    , name : String
    , kind : Kind
    , x : Float
    , y : Float
    , heading : Float
    , speed : Float
    , hull : Float
    , alert : Float
    , attack : Float
    , military : Maybe Bool
    , side : Maybe Side
    , depth : Maybe Float
    , sinkDepth : Maybe Float
    , flood : Maybe Float
    , disabled : Maybe Bool
    , playerDamaged : Maybe Bool
    , neutralHitAt : Maybe Float
    , wreckMark : Maybe WreckMark
    , lampFix : Maybe LampFix
    , nextSweep : Maybe Float
    , incidental : Maybe Bool
    , roll : Maybe Float
    , verticalSpeed : Maybe Float
    , fixedWreck : Maybe Bool
    , groundedAt : Maybe Float
    , clue : Maybe Clue
    , nextInquiry : Maybe Float
    , report : Maybe Report
    , tracking : Maybe Pursuit
    , patrolSpeed : Maybe Float
    , lastAttackAt : Maybe Float
    , parley : Maybe Parley
    , lights : Maybe Bool
    , blackout : Maybe Bool
    , pitch : Maybe Float
    , noise : Maybe Float
    , torpedoDecoys : Maybe Int
    , lastTubeSide : Maybe Float
    , lastHitLog : Maybe Float
    , directHits : Maybe Float
    , settled : Maybe Bool
    , sunkAt : Maybe Float
    , nextCreak : Maybe Float
    , collapsed : Maybe Bool
    , collapsedAt : Maybe Float
    , fighterCount : Maybe Float
    }



-- DECODING


andMap : D.Decoder a -> D.Decoder (a -> b) -> D.Decoder b
andMap =
    D.map2 (|>)


{-| An absent field is `Nothing`; a present one must decode.
-}
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


{-| A time or timer: finite and not negative.
-}
timer : D.Decoder Float
timer =
    check "a time at or after zero" (\n -> n >= 0) finite


{-| A moment between the patrol's start and now.
-}
moment : Float -> D.Decoder Float
moment now =
    check "a time no later than now" (\t -> t <= now) timer


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


pursuits : List Pursuit
pursuits =
    [ Tracking, Searching, Decoy ]


pursuitName : Pursuit -> String
pursuitName p =
    case p of
        Tracking ->
            "tracking"

        Searching ->
            "searching"

        Decoy ->
            "decoy"


orders : List Order
orders =
    [ Watch, Approach, Stop, Warn, Fight, Retreat ]


orderName : Order -> String
orderName o =
    case o of
        Watch ->
            "watch"

        Approach ->
            "approach"

        Stop ->
            "stop"

        Warn ->
            "warn"

        Fight ->
            "fight"

        Retreat ->
            "retreat"


clue : Float -> D.Decoder Clue
clue now =
    D.map3 Clue (D.field "x" finite) (D.field "y" finite) (D.field "time" (moment now))


report : Float -> D.Decoder Report
report now =
    D.map7 Report
        (D.field "x" finite)
        (D.field "y" finite)
        (D.field "depth" finite)
        (D.field "heading" finite)
        (D.field "speed" finite)
        (D.field "time" (moment now))
        (optional "reason" D.string)


parley : D.Decoder Parley
parley =
    D.map7 Parley
        (D.field "against" D.string)
        (D.field "level" D.float)
        (D.field "order" (named "order" orders orderName))
        (D.field "range" D.float)
        (D.field "next" D.float)
        (D.field "cruise" D.float)
        (optional "origin" (D.map3 (\x y time -> { x = x, y = y, time = time }) (D.field "x" D.float) (D.field "y" D.float) (D.field "time" D.float)))


lampFix : D.Decoder LampFix
lampFix =
    D.succeed LampFix
        |> andMap (D.field "text" D.string)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "radius" D.float)
        |> andMap (D.field "sender" D.string)
        |> andMap (D.field "number" D.float)
        |> andMap (D.field "target" D.string)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "course" D.float)
        |> andMap (D.field "speed" D.float)


{-| A saved ship at patrol time `now`, rejected where restore rejects it.
Checks that need the rest of the patrol stay with the modules owning them.
-}
decoder : Float -> D.Decoder Ship
decoder now =
    D.succeed Ship
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "name" D.string)
        |> andMap (D.field "kind" (named "kind" Vessel.kinds Vessel.kindName))
        |> andMap (D.field "x" finite)
        |> andMap (D.field "y" finite)
        |> andMap (D.field "heading" finite)
        |> andMap (D.field "speed" finite)
        |> andMap (D.field "hull" finite)
        |> andMap (D.field "alert" finite)
        |> andMap (D.field "attack" finite)
        |> andMap (optional "military" D.bool)
        |> andMap (optional "side" (named "side" Vessel.sides Vessel.sideName))
        |> andMap (optional "depth" D.float)
        |> andMap (optional "sinkDepth" timer)
        |> andMap (optional "flood" D.float)
        |> andMap (optional "disabled" D.bool)
        |> andMap (optional "playerDamaged" D.bool)
        |> andMap (optional "neutralHitAt" timer)
        |> andMap (optional "wreckMark" (D.map3 WreckMark (D.field "x" finite) (D.field "y" finite) (D.field "observed" D.bool)))
        |> andMap (optional "lampFix" lampFix)
        |> andMap (optional "nextSweep" timer)
        |> andMap (optional "incidental" D.bool)
        |> andMap (optional "roll" D.float)
        |> andMap (optional "verticalSpeed" D.float)
        |> andMap (optional "fixedWreck" D.bool)
        |> andMap (optional "groundedAt" D.float)
        |> andMap (optional "clue" (clue now))
        |> andMap (optional "nextInquiry" timer)
        |> andMap (optional "report" (report now))
        |> andMap (optional "tracking" (D.nullable (named "pursuit" pursuits pursuitName)) |> D.map (Maybe.andThen identity))
        |> andMap (optional "patrolSpeed" D.float)
        |> andMap (optional "lastAttackAt" D.float)
        |> andMap (optional "parley" parley)
        |> andMap (optional "lights" D.bool)
        |> andMap (optional "blackout" D.bool)
        |> andMap (optional "pitch" D.float)
        |> andMap (optional "noise" D.float)
        |> andMap (optional "torpedoDecoys" (check "zero to two decoys" (\n -> 0 <= n && n <= 2) D.int))
        |> andMap (optional "lastTubeSide" D.float)
        |> andMap (optional "lastHitLog" D.float)
        |> andMap (optional "directHits" D.float)
        |> andMap (optional "settled" D.bool)
        |> andMap (optional "sunkAt" timer)
        |> andMap (optional "nextCreak" timer)
        |> andMap (optional "collapsed" D.bool)
        |> andMap (optional "collapsedAt" timer)
        |> andMap (optional "fighterCount" D.float)



-- ENCODING


point3 : { a | x : Float, y : Float, time : Float } -> E.Value
point3 p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "time", E.float p.time ) ]


{-| The ship as a save holds it; absent fields stay absent.
-}
encode : Ship -> E.Value
encode s =
    let
        field : String -> (a -> E.Value) -> Maybe a -> Maybe ( String, E.Value )
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    E.object
        ([ ( "id", E.string s.id )
         , ( "name", E.string s.name )
         , ( "kind", E.string (Vessel.kindName s.kind) )
         , ( "x", E.float s.x )
         , ( "y", E.float s.y )
         , ( "heading", E.float s.heading )
         , ( "speed", E.float s.speed )
         , ( "hull", E.float s.hull )
         , ( "alert", E.float s.alert )
         , ( "attack", E.float s.attack )
         ]
            ++ List.filterMap identity
                [ field "military" E.bool s.military
                , field "side" (Vessel.sideName >> E.string) s.side
                , field "depth" E.float s.depth
                , field "sinkDepth" E.float s.sinkDepth
                , field "flood" E.float s.flood
                , field "disabled" E.bool s.disabled
                , field "playerDamaged" E.bool s.playerDamaged
                , field "neutralHitAt" E.float s.neutralHitAt
                , field "wreckMark" (\m -> E.object [ ( "x", E.float m.x ), ( "y", E.float m.y ), ( "observed", E.bool m.observed ) ]) s.wreckMark
                , field "lampFix"
                    (\f ->
                        E.object
                            [ ( "text", E.string f.text )
                            , ( "x", E.float f.x )
                            , ( "y", E.float f.y )
                            , ( "time", E.float f.time )
                            , ( "radius", E.float f.radius )
                            , ( "sender", E.string f.sender )
                            , ( "number", E.float f.number )
                            , ( "target", E.string f.target )
                            , ( "depth", E.float f.depth )
                            , ( "course", E.float f.course )
                            , ( "speed", E.float f.speed )
                            ]
                    )
                    s.lampFix
                , field "nextSweep" E.float s.nextSweep
                , field "incidental" E.bool s.incidental
                , field "roll" E.float s.roll
                , field "verticalSpeed" E.float s.verticalSpeed
                , field "fixedWreck" E.bool s.fixedWreck
                , field "groundedAt" E.float s.groundedAt
                , field "clue" point3 s.clue
                , field "nextInquiry" E.float s.nextInquiry
                , field "report"
                    (\r ->
                        E.object
                            ([ ( "x", E.float r.x ), ( "y", E.float r.y ), ( "depth", E.float r.depth ), ( "heading", E.float r.heading ), ( "speed", E.float r.speed ), ( "time", E.float r.time ) ]
                                ++ List.filterMap identity [ field "reason" E.string r.reason ]
                            )
                    )
                    s.report
                , field "tracking" (pursuitName >> E.string) s.tracking
                , field "patrolSpeed" E.float s.patrolSpeed
                , field "lastAttackAt" E.float s.lastAttackAt
                , field "parley"
                    (\p ->
                        E.object
                            ([ ( "against", E.string p.against )
                             , ( "level", E.float p.level )
                             , ( "order", E.string (orderName p.order) )
                             , ( "range", E.float p.range )
                             , ( "next", E.float p.next )
                             , ( "cruise", E.float p.cruise )
                             ]
                                ++ List.filterMap identity [ field "origin" point3 p.origin ]
                            )
                    )
                    s.parley
                , field "lights" E.bool s.lights
                , field "blackout" E.bool s.blackout
                , field "pitch" E.float s.pitch
                , field "noise" E.float s.noise
                , field "torpedoDecoys" E.int s.torpedoDecoys
                , field "lastTubeSide" E.float s.lastTubeSide
                , field "lastHitLog" E.float s.lastHitLog
                , field "directHits" E.float s.directHits
                , field "settled" E.bool s.settled
                , field "sunkAt" E.float s.sunkAt
                , field "nextCreak" E.float s.nextCreak
                , field "collapsed" E.bool s.collapsed
                , field "collapsedAt" E.float s.collapsedAt
                , field "fighterCount" E.float s.fighterCount
                ]
        )
