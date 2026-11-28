module Sim.Torpedo exposing (DecoyTarget, Launching, Orders, Owner(..), Torpedo, Trace, armingTime, enemyDecoySupply, maxPitch, putTorpedoInWater, surfaceRunDepth, torpedoLife, torpedoOrders, torpedoSpeed)

{-| A torpedo in the water and how one is put there. Fictional combat tuning;
positions are meters. The run itself is `Sim.TorpedoCourse` and
`Sim.TorpedoRun`.
-}

import Sim.SurfaceMotion exposing (hash01)


maxRun : Float
maxRun =
    4320


torpedoSpeed : Float
torpedoSpeed =
    24


torpedoLife : Float
torpedoLife =
    180


armingTime : Float
armingTime =
    4


maxPitch : Float
maxPitch =
    pi / 4


surfaceRunDepth : Float
surfaceRunDepth =
    3


enemyDecoySupply : Int
enemyDecoySupply =
    2


{-| Whose torpedo: the boat's, or an enemy's, which knows only where it was
aimed and who fired it (a mine's run may have no launcher).
-}
type Owner
    = PlayerTorpedo
    | EnemyTorpedo { launcher : Maybe String, aim : Maybe { x : Float, y : Float } }


{-| A submarine's decoy that a torpedo has turned toward, until it expires.
-}
type alias DecoyTarget =
    { x : Float, y : Float, depth : Float, expiresAt : Float }


{-| A point of the torpedo's wake, for drawing its track.
-}
type alias Trace =
    { x : Float, y : Float, depth : Float, time : Float }


{-| A torpedo in the water. Restore fills in every field a legacy save lacks
except the time its last decoy check saw a noisemaker. `tubeSide` is -1, 0
or 1 and `searchDirection` -1 or 1, as restore checks.
-}
type alias Torpedo =
    { id : Int
    , owner : Owner
    , runLimit : Float
    , traveled : Float
    , x : Float
    , y : Float
    , depth : Float
    , age : Float
    , intended : Maybe String
    , lock : Maybe String
    , pingAge : Float
    , orderedHeading : Float
    , orderedDepth : Float
    , pitch : Float
    , tubeSide : Float
    , searchAge : Float
    , runOut : Float
    , searchDirection : Float
    , decoysChecked : List String
    , decoyTarget : Maybe DecoyTarget
    , diverted : Bool
    , heading : Float
    , path : List Trace
    , decoyCheckedAt : Maybe Float
    }


{-| A fresh run's orders: the ordered course and depth, no exit pitch or tube,
and a seeded direction to turn when it starts searching.
-}
type alias Orders =
    { orderedHeading : Float
    , orderedDepth : Float
    , pitch : Float
    , tubeSide : Float
    , searchAge : Float
    , runOut : Float
    , searchDirection : Float
    , decoysChecked : List String
    , decoyTarget : Maybe DecoyTarget
    , diverted : Bool
    }


torpedoOrders : Float -> Int -> Float -> Float -> Orders
torpedoOrders seed id heading depth =
    { orderedHeading = heading
    , orderedDepth = depth
    , pitch = 0
    , tubeSide = 0
    , searchAge = 0
    , runOut = 0
    , searchDirection =
        if hash01 seed (toFloat (id + 673)) < 0.5 then
            -1

        else
            1
    , decoysChecked = []
    , decoyTarget = Nothing
    , diverted = False
    }


{-| The patrol fields launching a torpedo reads and writes.
-}
type alias Launching s p =
    { s | time : Float, patrol : { p | seed : Float }, weaponSequence : Int, runSetting : Float, projectiles : List Torpedo }


{-| A torpedo enters the water at `origin` on the ordered course and depth.
The boat's runs stop at the run setting, others at the longest run. `launch`
sets what the launcher knows beyond the orders: the boat's tube, exit pitch
and intended target; an enemy's aim and course.
-}
putTorpedoInWater : Owner -> { x : Float, y : Float, depth : Float } -> Float -> Float -> (Torpedo -> Torpedo) -> Launching s p -> ( Torpedo, Launching s p )
putTorpedoInWater owner origin heading depth launch s =
    let
        id : Int
        id =
            s.weaponSequence

        orders : Orders
        orders =
            torpedoOrders s.patrol.seed id heading depth

        launched : Torpedo
        launched =
            launch
                { id = id
                , owner = owner
                , runLimit =
                    if owner == PlayerTorpedo then
                        s.runSetting

                    else
                        maxRun
                , traveled = 0
                , x = origin.x
                , y = origin.y
                , depth = origin.depth
                , age = 0
                , intended = Nothing
                , lock = Nothing
                , pingAge = 99
                , orderedHeading = orders.orderedHeading
                , orderedDepth = orders.orderedDepth
                , pitch = orders.pitch
                , tubeSide = orders.tubeSide
                , searchAge = orders.searchAge
                , runOut = orders.runOut
                , searchDirection = orders.searchDirection
                , decoysChecked = orders.decoysChecked
                , decoyTarget = orders.decoyTarget
                , diverted = orders.diverted
                , heading = heading
                , path = []
                , decoyCheckedAt = Nothing
                }

        shot : Torpedo
        shot =
            { launched | path = [ { x = origin.x, y = origin.y, depth = origin.depth, time = s.time } ] }
    in
    ( shot, { s | weaponSequence = id + 1, projectiles = s.projectiles ++ [ shot ] } )
