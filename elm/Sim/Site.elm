module Sim.Site exposing (Kind(..), Site, body, decoder, encode, withBody)

{-| What lies at a mission's site: a ship in distress on the surface, a wreck
to survey, or a submarine down on the seabed. Each rescue or survey mission
makes one, and it never moves under its own power: hull contacts may push it
and wear its hull, but its speed stays zero, so a site has no speed to hold.
-}

import Json.Decode as D exposing (Decoder)
import Json.Encode as E
import Sim.HullGeometry exposing (Body)
import Sim.Math as M


type Kind
    = SurfaceCasualty
    | SurveyWreck
    | DownedSubmarine


type alias Site =
    { x : Float
    , y : Float
    , depth : Float
    , heading : Float
    , hull : Float
    , kind : Kind
    , name : String
    }


{-| The name a save writes for each kind.
-}
kindName : Kind -> String
kindName kind =
    case kind of
        SurfaceCasualty ->
            "surface"

        SurveyWreck ->
            "wreck"

        DownedSubmarine ->
            "sub"


{-| Every kind, each naming the next, so a new kind must be placed in the
chain before the decoder can read it.
-}
kinds : List Kind
kinds =
    let
        after : Kind -> Maybe Kind
        after kind =
            case kind of
                SurfaceCasualty ->
                    Just SurveyWreck

                SurveyWreck ->
                    Just DownedSubmarine

                DownedSubmarine ->
                    Nothing

        from : Kind -> List Kind
        from kind =
            kind :: (after kind |> Maybe.map from |> Maybe.withDefault [])
    in
    from SurfaceCasualty


kindNamed : String -> Decoder Kind
kindNamed name =
    case List.filter (\kind -> kindName kind == name) kinds of
        kind :: _ ->
            D.succeed kind

        [] ->
            D.fail ("no site is a " ++ name)


{-| A saved site, as restore accepts it: a hull that is absent or null reads
as whole, one present lies between 0 and 100, and the speed is zero.
-}
decoder : Decoder Site
decoder =
    D.map7 Site
        (D.field "x" D.float)
        (D.field "y" D.float)
        (D.field "depth" D.float)
        (D.field "heading" D.float)
        hull
        (D.field "kind" (D.string |> D.andThen kindNamed))
        (D.field "name" D.string)
        |> D.andThen
            (\site ->
                D.field "speed" D.float
                    |> D.andThen
                        (\speed ->
                            if M.isZero speed then
                                D.succeed site

                            else
                                D.fail "a site never moves under its own power"
                        )
            )


hull : Decoder Float
hull =
    D.maybe (D.field "hull" D.value)
        |> D.andThen
            (\present ->
                case present of
                    Nothing ->
                        D.succeed 100

                    Just _ ->
                        D.field "hull" (D.nullable D.float)
                            |> D.andThen
                                (\value ->
                                    case value of
                                        Nothing ->
                                            D.succeed 100

                                        Just v ->
                                            if 0 <= v && v <= 100 then
                                                D.succeed v

                                            else
                                                D.fail "a site's hull lies between 0 and 100"
                                )
            )


encode : Site -> E.Value
encode site =
    E.object
        [ ( "x", E.float site.x )
        , ( "y", E.float site.y )
        , ( "hull", E.float site.hull )
        , ( "depth", E.float site.depth )
        , ( "heading", E.float site.heading )
        , ( "kind", E.string (kindName site.kind) )
        , ( "name", E.string site.name )
        , ( "speed", E.float 0 )
        ]


{-| The site as a hull among hulls: still, unnamed in collision keys, and
with neither pitch, roll nor a military side.
-}
body : Site -> Body
body site =
    { x = site.x
    , y = site.y
    , depth = Just site.depth
    , heading = site.heading
    , pitch = Nothing
    , roll = Nothing
    , speed = 0
    , verticalSpeed = Nothing
    , kind = Just (kindName site.kind)
    , id = Nothing
    , name = Just site.name
    , hull = Just site.hull
    , military = Nothing
    , fixedWreck = False
    , directHits = Nothing
    }


{-| What a hull contact leaves of the site: its place and its hull.
-}
withBody : Body -> Site -> Site
withBody b site =
    { site | x = b.x, y = b.y, depth = Maybe.withDefault site.depth b.depth, hull = Maybe.withDefault site.hull b.hull }
