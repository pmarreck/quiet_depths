port module SimWorker exposing (main)

{-| The patrol simulation as a worker the page drives through one port pair.
It holds the world; each command brings the page's orders, which the world
takes first, and each reply carries the world in the save's shape for the
page to mirror, with what the command announced. Commands:

  - `create`: a new patrol for a mission, seed and options.
  - `restore`: a saved patrol (without the page's photo archive and captain),
    or `world: null` when the save is refused.
  - `step`: a frame of play, answered tick by tick.
  - `act`: one of the page's actions, answered with its result.
  - `orderFields`: the names of the fields the page sends as orders.

-}

import Json.Decode as D
import Json.Encode as E
import Sim.Patrol as Patrol
import Sim.PatrolCommand as PatrolCommand
import Sim.PatrolCreate as PatrolCreate
import Sim.PatrolOrders as PatrolOrders
import Sim.PatrolRestore as PatrolRestore
import Sim.SaveCodec exposing (optional)
import Sim.World exposing (World)
import Sim.WorldEncoder as WorldEncoder


port commands : (D.Value -> msg) -> Sub msg


port replies : E.Value -> Cmd msg


main : Program () (Maybe World) D.Value
main =
    Platform.worker
        { init = \_ -> ( Nothing, Cmd.none )
        , update = update
        , subscriptions = \_ -> commands identity
        }


update : D.Value -> Maybe World -> ( Maybe World, Cmd D.Value )
update value model =
    case D.decodeValue (command model) value of
        Ok ( next, reply ) ->
            ( next, replies reply )

        Err problem ->
            ( model, replies (E.object [ ( "error", E.string (D.errorToString problem) ) ]) )


{-| The world as this command finds it, with the page's orders in place.
-}
ordered : Maybe World -> D.Decoder World
ordered model =
    case model of
        Just s ->
            D.field "orders" PatrolOrders.decoder |> D.map (\o -> PatrolOrders.apply o s)

        Nothing ->
            D.fail "no patrol: create or restore one first"


command : Maybe World -> D.Decoder ( Maybe World, E.Value )
command model =
    D.field "kind" D.string
        |> D.andThen
            (\kind ->
                case kind of
                    "create" ->
                        D.map3
                            (\mission seed given ->
                                let
                                    s : World
                                    s =
                                        PatrolCreate.createGame mission seed given
                                in
                                ( Just s, E.object [ ( "world", WorldEncoder.encodeWorld s ) ] )
                            )
                            (D.field "mission" D.string)
                            (D.field "seed" D.float)
                            (D.oneOf [ D.field "options" options, D.succeed { timeOfDay = Nothing, weather = Nothing, changing = Nothing, difficulty = E.null } ])

                    "restore" ->
                        D.field "save" D.value
                            |> D.map
                                (\saved ->
                                    case PatrolRestore.restore saved of
                                        Just s ->
                                            ( Just s, E.object [ ( "world", WorldEncoder.encodeWorld s ) ] )

                                        Nothing ->
                                            ( model, E.object [ ( "world", E.null ) ] )
                                )

                    "step" ->
                        D.map3
                            (\s dt input ->
                                let
                                    ticks : List Patrol.Tick
                                    ticks =
                                        Patrol.step dt input s
                                in
                                ( Just (List.foldl (\t _ -> t.world) s ticks), E.object [ ( "ticks", E.list PatrolCommand.encodeTick ticks ) ] )
                            )
                            (ordered model)
                            (D.field "dt" D.float)
                            (D.field "input" PatrolCommand.input)

                    "act" ->
                        D.map2
                            (\s action ->
                                let
                                    done : Patrol.Done
                                    done =
                                        Patrol.act action s
                                in
                                ( Just done.world, PatrolCommand.encodeDone done )
                            )
                            (ordered model)
                            (D.field "action" PatrolCommand.action)

                    "orderFields" ->
                        D.succeed
                            ( model
                            , E.object
                                [ ( "boat", E.list E.string PatrolOrders.fields.boat )
                                , ( "gun", E.list E.string PatrolOrders.fields.gun )
                                , ( "drone", E.list E.string PatrolOrders.fields.drone )
                                ]
                            )

                    _ ->
                        D.fail ("no such command: " ++ kind)
            )


options : D.Decoder PatrolCreate.Options
options =
    D.map4 (\timeOfDay weather changing difficulty -> { timeOfDay = timeOfDay, weather = weather, changing = changing, difficulty = Maybe.withDefault E.null difficulty })
        (optional "timeOfDay" D.string)
        (optional "weather" D.string)
        (optional "changing" D.bool)
        (optional "difficulty" D.value)
