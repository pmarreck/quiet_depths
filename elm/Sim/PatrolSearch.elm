module Sim.PatrolSearch exposing (Approach, Point, SearchArea, Traffic, advanceApproach, approachProgress, longPatrol, objectives, validSearch)

{-| The long patrol: the boat starts well away from its objective and must
find it within a search area, earning protected transit time on the way.
-}

import PatrolMission exposing (Mission(..))
import Set
import Sim.Math as M
import Sim.SurfaceMotion exposing (hash01)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


type alias Point =
    { x : Float, y : Float }


type alias Traffic a =
    { a | x : Float, y : Float, id : String, kind : Kind, military : Bool, incidental : Bool, side : Maybe Side }


type alias SearchArea =
    { x : Float
    , y : Float
    , radius : Float
    , targets : List String
    , recognized : List String
    , located : Bool
    , activeSeconds : Float
    , protectedTime : Float
    }


type alias Approach =
    { x : Float, y : Float, heading : Float, targetHeading : Float, search : SearchArea, home : Maybe Point }


{-| The ships a mission sends the boat to find. -}
objectives : Mission -> List (Traffic a) -> List (Traffic a)
objectives mission ships =
    let
        keep wanted =
            List.filter wanted ships
    in
    case mission of
        BigKahuna ->
            keep (\v -> v.kind == Surface Carrier)

        Intercept ->
            keep (\v -> v.id == "cobalt")

        SubHunt ->
            keep (\v -> v.kind == Submarine)

        Tiebreaker ->
            keep (\v -> v.side == Just Hostile)

        Henhouse ->
            keep (\v -> v.side == Just Friendly && v.id /= "plover")

        Convoy ->
            keep (\v -> v.military && v.kind == Surface Merchant)

        Recon ->
            keep (\v -> v.kind == Surface Merchant)

        Shadow ->
            keep (\v -> v.kind == Surface Merchant)

        _ ->
            ships


{-| A seeded search area around the site, or around the objective ships, and
an entry from open water south of all traffic, incidental fishing boats
included. Every mission but the covert transit also gets a pickup point.
-}
longPatrol : Mission -> Float -> Maybe Point -> List (Traffic a) -> Approach
longPatrol mission seed site ships =
    let
        goals =
            objectives mission ships

        points =
            case site of
                Just p ->
                    [ p ]

                Nothing ->
                    List.map (\v -> { x = v.x, y = v.y }) goals

        h n =
            hash01 seed (7100 + n)

        count =
            toFloat (List.length points)

        ( meanX, meanY ) =
            List.foldl (\p ( mx, my ) -> ( mx + p.x / count, my + p.y / count )) ( 0, 0 ) points

        angle =
            h 0 * pi * 2

        offset =
            350 + 800 * h 1

        x =
            meanX + cos angle * offset

        y =
            meanY + sin angle * offset

        margin =
            if mission == Tiebreaker then
                1200

            else
                600

        radius =
            margin + List.foldl (\p widest -> M.max widest (M.hypot2 (p.x - x) (p.y - y))) 1400 points

        startX =
            meanX + (h 2 - 0.5) * 5600

        startY =
            List.foldl (\v lowest -> M.min lowest v.y) meanY ships - 6600 - 1300 * h 3

        heading =
            M.remainder (atan2 (x - startX) (y - startY) * 180 / pi + 360) 360
    in
    { x = startX
    , y = startY
    , heading = heading
    , targetHeading = heading
    , search =
        { x = x
        , y = y
        , radius = radius
        , targets =
            if site == Nothing then
                List.map .id goals

            else
                []
        , recognized = []
        , located = False
        , activeSeconds = 0
        , protectedTime = 0
        }
    , home =
        if mission == Transit then
            Nothing

        else
            Just { x = startX + (h 4 - 0.5) * 1900, y = startY + 1900 + 2200 * h 5 }
    }


searchSeconds : Float
searchSeconds =
    toFloat PatrolMission.patrolTiming.searchSeconds


protectedTransit : Float
protectedTransit =
    toFloat PatrolMission.patrolTiming.protectedTransit


{-| Minutes of unpaused play, plus transit allowance for a boat cruising at
1x. Whether the approach advanced, and the area after it.
-}
advanceApproach : Float -> Float -> SearchArea -> ( Bool, SearchArea )
advanceApproach dt timeRate search =
    if search.activeSeconds >= searchSeconds && search.protectedTime >= protectedTransit then
        ( False, search )

    else
        let
            active =
                search.activeSeconds + dt / M.max 1 timeRate
        in
        ( True
        , { search
            | activeSeconds =
                if active > searchSeconds - 1.0e-8 then
                    searchSeconds

                else
                    active
            , protectedTime = search.protectedTime + dt
          }
        )


approachProgress : SearchArea -> Float
approachProgress a =
    M.min (M.min 1 (a.activeSeconds / searchSeconds)) (a.protectedTime / protectedTransit)


{-| A saved search area: finite and in range, naming exactly the objective
ships still in the patrol (incidental traffic aside), with no ship
recognized twice or outside them. Field types are the decoder's to check.
-}
validSearch : Mission -> Maybe Point -> List (Traffic a) -> Float -> SearchArea -> Bool
validSearch mission site ships time a =
    let
        expected =
            if site == Nothing then
                List.map .id (objectives mission (List.filter (not << .incidental) ships))

            else
                []

        finite v =
            not (isNaN v || isInfinite v)
    in
    List.all finite [ a.x, a.y, a.radius, a.activeSeconds, a.protectedTime ]
        && a.radius
        > 0
        && a.activeSeconds
        >= 0
        && a.activeSeconds
        <= searchSeconds
        && a.protectedTime
        >= 0
        && a.protectedTime
        <= time
        + 0.001
        && List.length a.targets
        == List.length expected
        && List.all (\id -> List.member id a.targets) expected
        && List.length a.recognized
        == Set.size (Set.fromList a.recognized)
        && List.all (\id -> List.member id expected) a.recognized
