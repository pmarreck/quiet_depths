module Sim.Ordnance exposing (Aloft, Blast, BlastKind(..), GunOwner(..), Round, blastKindName, blastKinds, gunOwnerName, gunOwners)

{-| Ordnance in flight or sinking: depth bombs and depth charges falling to
their fuse depth, and gun rounds, the boat's or an aircraft's.
-}


type alias Aloft =
    { x : Float, y : Float, altitude : Float }


{-| What dropped a blast: an aircraft's depth bomb or a ship's depth charge.
-}
type BlastKind
    = Bomb
    | Charge


blastKindName : BlastKind -> String
blastKindName kind =
    case kind of
        Bomb ->
            "bomb"

        Charge ->
            "charge"


{-| Every blast kind, built so that a new one cannot be left out: the `case`
in `after` stops compiling until it is given a successor.
-}
blastKinds : List BlastKind
blastKinds =
    let
        after : BlastKind -> Maybe BlastKind
        after kind =
            case kind of
                Bomb ->
                    Just Charge

                Charge ->
                    Nothing

        from : BlastKind -> List BlastKind
        from kind =
            kind :: (Maybe.map from (after kind) |> Maybe.withDefault [])
    in
    from Bomb


{-| A bomb or charge sinking toward its fuse depth. A bomb also records how
long it falls through the air, and from what height.
-}
type alias Blast =
    { id : Int
    , x : Float
    , y : Float
    , depth : Float
    , delay : Float
    , totalDelay : Float
    , airTime : Maybe Float
    , airHeight : Maybe Float
    , age : Float
    , exploded : Bool
    , kind : BlastKind
    , splashed : Maybe Bool
    , explodedAt : Maybe Float
    , convoyCharge : Maybe Bool
    }


type GunOwner
    = PlayerGun
    | AircraftGun


gunOwnerName : GunOwner -> String
gunOwnerName owner =
    case owner of
        PlayerGun ->
            "player"

        AircraftGun ->
            "aircraft"


{-| Every gun owner, built as `blastKinds` is.
-}
gunOwners : List GunOwner
gunOwners =
    let
        after : GunOwner -> Maybe GunOwner
        after owner =
            case owner of
                PlayerGun ->
                    Just AircraftGun

                AircraftGun ->
                    Nothing

        from : GunOwner -> List GunOwner
        from owner =
            owner :: (Maybe.map from (after owner) |> Maybe.withDefault [])
    in
    from PlayerGun


type alias Round =
    { id : Int
    , owner : GunOwner
    , x : Float
    , y : Float
    , altitude : Float
    , vx : Float
    , vy : Float
    , vz : Float
    , age : Float
    , tracer : Bool
    , previous : Maybe Aloft
    }
