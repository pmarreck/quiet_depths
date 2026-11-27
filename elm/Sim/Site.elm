module Sim.Site exposing (Kind(..))

{-| What lies at a mission's site: a ship in distress on the surface, a wreck
to survey, or a submarine down on the seabed.
-}


type Kind
    = SurfaceCasualty
    | SurveyWreck
    | DownedSubmarine
