module Sim.ReplayEvents exposing (Kind(..), Marked, ReplayEvent, at, kindName, mark)

{-| Moments worth an instant replay. The TypeScript announces each to a
listener found by the patrol object's identity, stamped with the patrol's
time; the Elm patrol keeps them, stamped the same way, in an outbox the game
drains each frame. The TypeScript also announces torpedoes, near misses,
collapses and sinkings; those kinds arrive with the modules that announce
them.
-}

import Sim.SurfaceMotion exposing (Point)


type Kind
    = Ground
    | Collision
    | Blast
    | Torpedo
    | Sinking
    | Collapse


kindName : Kind -> String
kindName kind =
    case kind of
        Ground ->
            "ground"

        Collision ->
            "collision"

        Blast ->
            "blast"

        Torpedo ->
            "torpedo"

        Sinking ->
            "sinking"

        Collapse ->
            "collapse"


type alias ReplayEvent =
    { kind : Kind
    , point : Point
    , heading : Maybe Float
    , target : Maybe String
    , shot : Maybe Float
    , enemy : Maybe Bool
    }


{-| An event with only a kind and a place, as most announcements are.
-}
at : Kind -> Point -> ReplayEvent
at kind point =
    { kind = kind, point = point, heading = Nothing, target = Nothing, shot = Nothing, enemy = Nothing }


type alias Marked =
    { time : Float, event : ReplayEvent }


{-| Announces an event at the patrol's current time.
-}
mark : ReplayEvent -> { w | time : Float, replay : List Marked } -> { w | time : Float, replay : List Marked }
mark event s =
    { s | replay = s.replay ++ [ { time = s.time, event = event } ] }
