module Sim.HullGeometry exposing (Body, Contact, hullContact, is, keelLimit, nan, orZero, pushOffShoal, weight)

{-| The shapes hulls collide as: rounded hulls and a separate sail, where two
meet deepest, how readily each gives way, the seabed under a keel, and the
nudge off a shoal. Part of the TypeScript's hull-contacts.ts.
-}

import Sim.Carrier exposing (carrierSize)
import Sim.Coast as Coast exposing (Coastline)
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.SurfaceMotion exposing (Offset, Point, boatPoint)


{-| Anything with a hull: kinds are the TypeScript's strings, `Nothing` for
the player's boat, so each rule reads as the original does.
-}
type alias Body =
    { x : Float
    , y : Float
    , depth : Maybe Float
    , heading : Float
    , pitch : Maybe Float
    , roll : Maybe Float
    , speed : Float
    , verticalSpeed : Maybe Float
    , kind : Maybe String
    , id : Maybe String
    , name : Maybe String
    , hull : Maybe Float
    , military : Maybe Bool
    , fixedWreck : Bool
    , directHits : Maybe Float
    }


type alias Contact =
    { point : Point, nx : Float, ny : Float, nd : Float, overlap : Float, lateralGap : Float }


type alias Part =
    { a : Point, b : Point, r : Float }


nan : Float
nan =
    0 / 0


pointOn : Body -> Offset -> Point
pointOn body =
    boatPoint { x = body.x, y = body.y, heading = body.heading, depth = Maybe.withDefault nan body.depth, pitch = Maybe.withDefault nan body.pitch, roll = Maybe.withDefault nan body.roll }


along : Float -> Offset
along forward =
    { side = 0, forward = forward, down = 0 }


is : String -> Body -> Bool
is kind body =
    body.kind == Just kind


{-| Rounded hulls and a separate sail, in the visible boat's coordinates.
-}
hullParts : Body -> List Part
hullParts body =
    let
        pose : Body
        pose =
            { body | depth = Just (Maybe.withDefault 3 body.depth) }

        part : Offset -> Offset -> Float -> Part
        part a b r =
            { a = pointOn pose a, b = pointOn pose b, r = r }
    in
    if is "carrier" body then
        let
            end : Float
            end =
                carrierSize.halfLength - carrierSize.halfBeam
        in
        [ part (along (negate end)) (along end) carrierSize.halfBeam ]

    else
        let
            sub : Bool
            sub =
                is "sub" body || is "wreck" body || body.kind == Nothing
        in
        if sub then
            [ part (along -27.5) (along 27.5) 5, part { side = 0, forward = 5, down = -4 } { side = 0, forward = 5, down = -11 } 2.1 ]

        else
            let
                size : Float
                size =
                    if is "fishing" body || is "surface" body then
                        0.38

                    else if is "escort" body then
                        0.78

                    else
                        1
            in
            [ part (along (-52 * size)) (along (52 * size)) (12 * size) ]


type alias V3 =
    { x : Float, y : Float, z : Float }


vector : Point -> Point -> V3
vector a b =
    { x = a.x - b.x, y = a.y - b.y, z = a.depth - b.depth }


dot : V3 -> V3 -> Float
dot a b =
    a.x * b.x + a.y * b.y + a.z * b.z


closestContact : Part -> Part -> Float -> Maybe Contact
closestContact a b heading =
    let
        u : V3
        u =
            vector a.b a.a

        v : V3
        v =
            vector b.b b.a

        w : V3
        w =
            vector a.a b.a

        uu : Float
        uu =
            dot u u

        vv : Float
        vv =
            dot v v

        uv : Float
        uv =
            dot u v

        uw : Float
        uw =
            dot u w

        vw : Float
        vw =
            dot v w

        det : Float
        det =
            uu * vv - uv * uv

        t0 : Float
        t0 =
            if det > 1.0e-8 then
                M.clamp 0 1 ((uv * vw - vv * uw) / det)

            else
                0

        k : Float
        k =
            M.clamp 0 1 ((uv * t0 + vw) / vv)

        t : Float
        t =
            M.clamp 0 1 ((uv * k - uw) / uu)

        dx : Float
        dx =
            w.x + t * u.x - k * v.x

        dy : Float
        dy =
            w.y + t * u.y - k * v.y

        dz : Float
        dz =
            w.z + t * u.z - k * v.z

        d : Float
        d =
            M.hypot3 dx dy dz

        overlap : Float
        overlap =
            a.r + b.r - d

        toward : Float -> Float
        toward n =
            if M.truthy d then
                n / d

            else
                0
    in
    if overlap <= 0 then
        Nothing

    else
        let
            lateralGap : Float
            lateralGap =
                sqrt (M.max 0 ((a.r + b.r) ^ 2 - dz * dz)) - M.hypot2 dx dy

            point : Point
            point =
                { x = a.a.x + t * u.x - toward dx * a.r, y = a.a.y + t * u.y - toward dy * a.r, depth = a.a.depth + t * u.z - toward dz * a.r }
        in
        if d > 1.0e-4 then
            Just { point = point, nx = dx / d, ny = dy / d, nd = dz / d, overlap = overlap, lateralGap = lateralGap }

        else
            Just { point = point, nx = cos (Mechanics.rad heading), ny = negate (sin (Mechanics.rad heading)), nd = 0, overlap = overlap, lateralGap = lateralGap }


{-| The deepest meeting of two hulls, if they touch.
-}
hullContact : Body -> Body -> Maybe Contact
hullContact a b =
    let
        reach : Float
        reach =
            if is "carrier" a || is "carrier" b then
                225

            else
                145

        deepest : Maybe Contact -> Maybe Contact -> Maybe Contact
        deepest hit found =
            case ( hit, found ) of
                ( Just h, Just f ) ->
                    if f.overlap < h.overlap then
                        hit

                    else
                        found

                ( Just _, Nothing ) ->
                    hit

                _ ->
                    found
    in
    if reach < Mechanics.distance a b || M.abs (Maybe.withDefault 3 a.depth - Maybe.withDefault 3 b.depth) > 32 then
        Nothing

    else
        List.foldl (\part found -> List.foldl (\second f -> deepest (closestContact part second a.heading) f) found (hullParts b)) Nothing (hullParts a)


{-| How readily a hull gives way; a fixed wreck or a submerged site does not.
-}
weight : Body -> Bool -> Float
weight body isSite =
    if body.fixedWreck || isSite && not (is "surface" body) then
        0

    else if is "carrier" body then
        0.15

    else if is "merchant" body then
        0.28

    else if is "escort" body then
        0.55

    else if is "fishing" body || is "surface" body then
        1.6

    else
        1


{-| The seabed under a hull's bow, middle and stern, less its draft.
-}
keelLimit : Body -> Maybe Coastline -> Float
keelLimit body chart =
    let
        sub : Bool
        sub =
            body.kind == Nothing || is "sub" body

        scale : Float
        scale =
            if is "fishing" body then
                0.38

            else if is "escort" body then
                0.78

            else
                1

        half : Float
        half =
            if is "carrier" body then
                carrierSize.halfLength

            else if sub then
                27.5

            else
                52 * scale

        draft : Float
        draft =
            if sub then
                5

            else
                5 * scale

        floorAt : Float -> Float
        floorAt forward =
            let
                pose : Point
                pose =
                    pointOn body (along forward)
            in
            Coast.chartDepth chart pose.x pose.y - draft + forward * sin (orZero body.pitch)
    in
    List.foldl (\forward lowest -> M.min lowest (floorAt forward)) (1 / 0) [ negate half, 0, half ]


orZero : Maybe Float -> Float
orZero n =
    case n of
        Just v ->
            if M.truthy v then
                v

            else
                0

        Nothing ->
            0


{-| Nudges a grounded hull down the seabed's slope, at most 30 m.
-}
pushOffShoal : { b | x : Float, y : Float } -> Float -> Maybe Coastline -> { b | x : Float, y : Float }
pushOffShoal body overlap chart =
    let
        bottom : Float -> Float -> Float
        bottom x y =
            Coast.chartDepth chart x y

        dx : Float
        dx =
            (bottom (body.x + 1) body.y - bottom (body.x - 1) body.y) / 2

        dy : Float
        dy =
            (bottom body.x (body.y + 1) - bottom body.x (body.y - 1)) / 2

        slope : Float
        slope =
            dx * dx + dy * dy
    in
    if slope < 1.0e-8 then
        body

    else
        let
            scale : Float
            scale =
                M.min ((overlap + 0.01) / slope) (30 / sqrt slope)
        in
        { body | x = body.x + dx * scale, y = body.y + dy * scale }
