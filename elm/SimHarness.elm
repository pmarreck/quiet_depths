port module SimHarness exposing (main)

{-| A test-only worker that runs the Elm simulation's functions on inputs
from Node, so each ported module can be compared with the TypeScript it
replaces. It is never part of the site. A request names a function and
carries a batch of argument lists; the reply carries one result per list,
in order.
-}

import Json.Decode as D
import Json.Encode as E
import Platform
import Sim.Equipment as Equipment


port calls : ({ id : Int, fn : String, batch : List D.Value } -> msg) -> Sub msg


port results : { id : Int, results : List E.Value, error : Maybe String } -> Cmd msg


type Msg
    = Call { id : Int, fn : String, batch : List D.Value }


arg : Int -> D.Decoder a -> D.Decoder a
arg =
    D.index


call1 : D.Decoder a -> (r -> E.Value) -> (a -> r) -> D.Decoder E.Value
call1 a encode f =
    D.map (f >> encode) (arg 0 a)


call2 : D.Decoder a -> D.Decoder b -> (r -> E.Value) -> (a -> b -> r) -> D.Decoder E.Value
call2 a b encode f =
    D.map2 (\x y -> encode (f x y)) (arg 0 a) (arg 1 b)


part : D.Decoder Equipment.Part
part =
    D.map2 Equipment.Part (D.field "condition" D.float) (D.field "limit" D.float)


encodePart : Equipment.Part -> E.Value
encodePart p =
    E.object [ ( "condition", E.float p.condition ), ( "limit", E.float p.limit ) ]


point : D.Decoder { x : Float, y : Float }
point =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)


boat : D.Decoder { x : Float, y : Float, heading : Float }
boat =
    D.map3 (\x y heading -> { x = x, y = y, heading = heading }) (D.field "x" D.float) (D.field "y" D.float) (D.field "heading" D.float)


section : D.Decoder Equipment.Section
section =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "bow" ->
                        D.succeed Equipment.Bow

                    "midships" ->
                        D.succeed Equipment.Midships

                    "stern" ->
                        D.succeed Equipment.Stern

                    _ ->
                        D.fail ("unknown section " ++ name)
            )


sectionName : Equipment.Section -> String
sectionName s =
    case s of
        Equipment.Bow ->
            "bow"

        Equipment.Midships ->
            "midships"

        Equipment.Stern ->
            "stern"


{-| Each function the tests may call, by the TypeScript name it replaces. -}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "equipment.systems" ->
            Just (D.succeed (E.list (Equipment.systemKey >> E.string) Equipment.systems))

        "equipment.systemName" ->
            Just (D.succeed (E.object (List.map (\s -> ( Equipment.systemKey s, E.string (Equipment.systemName s) )) Equipment.systems)))

        "equipment.compartment" ->
            Just (D.succeed (E.object (List.map (\s -> ( Equipment.systemKey s, E.string (sectionName (Equipment.compartment s)) )) Equipment.systems)))

        "equipment.operatingFraction" ->
            Just (call1 D.float E.float Equipment.operatingFraction)

        "equipment.damage" ->
            Just (call2 D.float part encodePart Equipment.damage)

        "equipment.repair" ->
            Just (call2 D.float part encodePart Equipment.repair)

        "equipment.conditionLabel" ->
            Just (call2 D.bool part E.string Equipment.conditionLabel)

        "equipment.hitSection" ->
            Just (call2 boat point (sectionName >> E.string) Equipment.hitSection)

        "equipment.hitSystem" ->
            Just (call2 (D.nullable section) D.float (Equipment.systemKey >> E.string) Equipment.hitSystem)

        _ ->
            Nothing


run : { id : Int, fn : String, batch : List D.Value } -> { id : Int, results : List E.Value, error : Maybe String }
run request =
    case function request.fn of
        Nothing ->
            { id = request.id, results = [], error = Just ("unknown function " ++ request.fn) }

        Just decoder ->
            let
                step value ( done, failure ) =
                    case failure of
                        Just _ ->
                            ( done, failure )

                        Nothing ->
                            case D.decodeValue decoder value of
                                Ok result ->
                                    ( result :: done, Nothing )

                                Err problem ->
                                    ( done, Just (D.errorToString problem) )

                ( reversed, error ) =
                    List.foldl step ( [], Nothing ) request.batch
            in
            { id = request.id, results = List.reverse reversed, error = error }


main : Program () () Msg
main =
    Platform.worker
        { init = \() -> ( (), Cmd.none )
        , update = \(Call request) () -> ( (), results (run request) )
        , subscriptions = \() -> calls Call
        }
