using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    [Serializable]
    public class MapGenerationGridConnectivityOptions
    {
        public bool ValidateDoors = true;
        public bool ValidatePublicAreaConnectivity = true;
        public bool ValidateVerticalConnectors = true;
        public bool TreatWholeFloorAsPublicWhenNoCorridors = true;
        public bool DoorOutsideMustBePublic = true;
    }

    /// <summary>
    /// Grid-level sanity validator for the generated layout.
    ///
    /// MapGenerationValidator checks the logical graph (room A connects to corridor,
    /// stairs connect floors, elevator connects courtroom, etc.). This class checks
    /// the lower-level geometry that graph edges rely on:
    /// - door edges have a cell inside the room and a reachable cell outside;
    /// - corridor/public cells are connected per floor;
    /// - stairs/elevator/path connector endpoints are placed on or near walkable cells.
    ///
    /// It is intentionally independent from Unity physics/NavMesh and runs only on
    /// GeneratedMapLayout data.
    /// </summary>
    public class MapGenerationGridConnectivityValidator
    {
        public MapGenerationValidationResult Validate(GeneratedMapLayout layout, MapGenerationGridConnectivityOptions options = null)
        {
            MapGenerationValidationResult result = new MapGenerationValidationResult();
            options = options ?? new MapGenerationGridConnectivityOptions();

            if (layout == null)
            {
                result.Add(MapGenerationIssueSeverity.Error, "grid.layout_null", "Layout is null.");
                return result;
            }

            Dictionary<int, GeneratedFloorPlan> floorsByLevel = BuildFloorIndex(layout, result);

            if (options.ValidatePublicAreaConnectivity)
            {
                ValidatePublicAreaConnectivity(layout, floorsByLevel, options, result);
            }

            if (options.ValidateDoors)
            {
                ValidateDoors(layout, floorsByLevel, options, result);
            }

            if (options.ValidateVerticalConnectors)
            {
                ValidateConnectorEndpoints(layout, floorsByLevel, options, result);
            }

            return result;
        }

        private static Dictionary<int, GeneratedFloorPlan> BuildFloorIndex(GeneratedMapLayout layout, MapGenerationValidationResult result)
        {
            Dictionary<int, GeneratedFloorPlan> index = new Dictionary<int, GeneratedFloorPlan>();
            for (int i = 0; i < layout.Floors.Count; i++)
            {
                GeneratedFloorPlan floor = layout.Floors[i];
                if (floor == null)
                {
                    continue;
                }

                if (index.ContainsKey(floor.Level))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "grid.floor_duplicate", "Duplicate floor level in layout.", floor.Level.ToString());
                    continue;
                }

                index.Add(floor.Level, floor);
            }

            return index;
        }

        private static void ValidatePublicAreaConnectivity(GeneratedMapLayout layout, Dictionary<int, GeneratedFloorPlan> floorsByLevel, MapGenerationGridConnectivityOptions options, MapGenerationValidationResult result)
        {
            foreach (KeyValuePair<int, GeneratedFloorPlan> pair in floorsByLevel)
            {
                GeneratedFloorPlan floor = pair.Value;
                HashSet<Vector2Int> publicCells = BuildExplicitPublicCellSet(floor);

                if (publicCells.Count <= 1)
                {
                    continue;
                }

                HashSet<Vector2Int> visited = FloodFill(publicCells);
                if (visited.Count != publicCells.Count)
                {
                    result.Add(
                        MapGenerationIssueSeverity.Error,
                        "grid.public_area_disconnected",
                        $"Public/corridor cells on floor {floor.Level} are disconnected: reached {visited.Count} of {publicCells.Count}.",
                        "floor:" + floor.Level);
                }
            }
        }

        private static void ValidateDoors(GeneratedMapLayout layout, Dictionary<int, GeneratedFloorPlan> floorsByLevel, MapGenerationGridConnectivityOptions options, MapGenerationValidationResult result)
        {
            for (int floorIndex = 0; floorIndex < layout.Floors.Count; floorIndex++)
            {
                GeneratedFloorPlan floor = layout.Floors[floorIndex];
                if (floor == null)
                {
                    continue;
                }

                for (int roomIndex = 0; roomIndex < floor.Rooms.Count; roomIndex++)
                {
                    GeneratedRoomPlan room = floor.Rooms[roomIndex];
                    if (room == null || room.Placement != GeneratedLocationPlacement.Indoor)
                    {
                        continue;
                    }

                    for (int doorIndex = 0; doorIndex < room.DoorEdges.Count; doorIndex++)
                    {
                        WallEdge door = room.DoorEdges[doorIndex];
                        Vector2Int a;
                        Vector2Int b;
                        GetAdjacentCells(door, out a, out b);

                        bool aInside = room.Rect.Contains(a);
                        bool bInside = room.Rect.Contains(b);

                        if (aInside == bInside)
                        {
                            result.Add(
                                MapGenerationIssueSeverity.Error,
                                "grid.door_not_on_room_boundary",
                                "Door edge does not separate the room from an outside cell.",
                                room.RoomId);
                            continue;
                        }

                        Vector2Int outside = aInside ? b : a;
                        if (options.DoorOutsideMustBePublic && !IsCellPublicOrValidOutside(floor, outside, room, options))
                        {
                            result.Add(
                                MapGenerationIssueSeverity.Error,
                                "grid.door_outside_unreachable",
                                $"Door outside cell {outside} is not public/walkable.",
                                room.RoomId);
                        }
                    }
                }
            }
        }

        private static void ValidateConnectorEndpoints(GeneratedMapLayout layout, Dictionary<int, GeneratedFloorPlan> floorsByLevel, MapGenerationGridConnectivityOptions options, MapGenerationValidationResult result)
        {
            for (int i = 0; i < layout.Connectors.Count; i++)
            {
                GeneratedConnectorPlan connector = layout.Connectors[i];
                if (connector == null)
                {
                    continue;
                }

                if (connector.Kind != GeneratedConnectorKind.Stairs && connector.Kind != GeneratedConnectorKind.Elevator && connector.Kind != GeneratedConnectorKind.OutdoorPath)
                {
                    continue;
                }

                if (!IsConnectorEndpointReachable(layout, floorsByLevel, connector.FromFloor, connector.FromCell, options))
                {
                    result.Add(
                        MapGenerationIssueSeverity.Error,
                        "grid.connector_from_unreachable",
                        $"Connector from-cell {connector.FromCell} on floor {connector.FromFloor} is not on or near walkable layout cells.",
                        connector.ConnectorId);
                }

                if (connector.Kind != GeneratedConnectorKind.OutdoorPath && !IsConnectorEndpointReachable(layout, floorsByLevel, connector.ToFloor, connector.ToCell, options))
                {
                    result.Add(
                        MapGenerationIssueSeverity.Error,
                        "grid.connector_to_unreachable",
                        $"Connector to-cell {connector.ToCell} on floor {connector.ToFloor} is not on or near walkable layout cells.",
                        connector.ConnectorId);
                }
            }
        }

        private static bool IsConnectorEndpointReachable(GeneratedMapLayout layout, Dictionary<int, GeneratedFloorPlan> floorsByLevel, int floorLevel, Vector2Int cell, MapGenerationGridConnectivityOptions options)
        {
            GeneratedFloorPlan floor;
            if (!floorsByLevel.TryGetValue(floorLevel, out floor) || floor == null)
            {
                return false;
            }

            if (IsCellPublicOrInsideAnyRoom(floor, cell, options))
            {
                return true;
            }

            Vector2Int[] neighbours =
            {
                new Vector2Int(cell.x + 1, cell.y),
                new Vector2Int(cell.x - 1, cell.y),
                new Vector2Int(cell.x, cell.y + 1),
                new Vector2Int(cell.x, cell.y - 1)
            };

            for (int i = 0; i < neighbours.Length; i++)
            {
                if (IsCellPublicOrInsideAnyRoom(floor, neighbours[i], options))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool IsCellPublicOrValidOutside(GeneratedFloorPlan floor, Vector2Int cell, GeneratedRoomPlan currentRoom, MapGenerationGridConnectivityOptions options)
        {
            if (floor == null)
            {
                return false;
            }

            HashSet<Vector2Int> explicitPublic = BuildExplicitPublicCellSet(floor);
            if (explicitPublic.Contains(cell))
            {
                return true;
            }

            // Courtrooms/basements may currently have an open floor area around the room
            // instead of an explicit corridor list. In that case floor bounds are the
            // public circulation area.
            if (options.TreatWholeFloorAsPublicWhenNoCorridors && explicitPublic.Count == 0 && floor.Bounds.Contains(cell) && !currentRoom.Rect.Contains(cell))
            {
                return true;
            }

            // Door between two adjacent rooms is acceptable, though current mansion
            // mostly uses room -> corridor doors.
            for (int i = 0; i < floor.Rooms.Count; i++)
            {
                GeneratedRoomPlan other = floor.Rooms[i];
                if (other == null || other == currentRoom)
                {
                    continue;
                }

                if (other.Rect.Contains(cell))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool IsCellPublicOrInsideAnyRoom(GeneratedFloorPlan floor, Vector2Int cell, MapGenerationGridConnectivityOptions options)
        {
            if (floor == null)
            {
                return false;
            }

            HashSet<Vector2Int> explicitPublic = BuildExplicitPublicCellSet(floor);
            if (explicitPublic.Contains(cell))
            {
                return true;
            }

            if (options.TreatWholeFloorAsPublicWhenNoCorridors && explicitPublic.Count == 0 && floor.Bounds.Contains(cell))
            {
                return true;
            }

            for (int i = 0; i < floor.Rooms.Count; i++)
            {
                GeneratedRoomPlan room = floor.Rooms[i];
                if (room != null && room.Rect.Contains(cell))
                {
                    return true;
                }
            }

            return false;
        }

        private static HashSet<Vector2Int> BuildExplicitPublicCellSet(GeneratedFloorPlan floor)
        {
            HashSet<Vector2Int> set = new HashSet<Vector2Int>();
            if (floor == null)
            {
                return set;
            }

            AddRange(set, floor.CorridorCells);
            AddRange(set, floor.HallCells);
            AddRange(set, floor.ShaftCells);
            return set;
        }

        private static void AddRange(HashSet<Vector2Int> set, List<Vector2Int> cells)
        {
            if (set == null || cells == null)
            {
                return;
            }

            for (int i = 0; i < cells.Count; i++)
            {
                set.Add(cells[i]);
            }
        }

        private static HashSet<Vector2Int> FloodFill(HashSet<Vector2Int> cells)
        {
            HashSet<Vector2Int> visited = new HashSet<Vector2Int>();
            if (cells == null || cells.Count == 0)
            {
                return visited;
            }

            Queue<Vector2Int> queue = new Queue<Vector2Int>();
            foreach (Vector2Int start in cells)
            {
                visited.Add(start);
                queue.Enqueue(start);
                break;
            }

            while (queue.Count > 0)
            {
                Vector2Int current = queue.Dequeue();
                TryVisit(new Vector2Int(current.x + 1, current.y), cells, visited, queue);
                TryVisit(new Vector2Int(current.x - 1, current.y), cells, visited, queue);
                TryVisit(new Vector2Int(current.x, current.y + 1), cells, visited, queue);
                TryVisit(new Vector2Int(current.x, current.y - 1), cells, visited, queue);
            }

            return visited;
        }

        private static void TryVisit(Vector2Int next, HashSet<Vector2Int> cells, HashSet<Vector2Int> visited, Queue<Vector2Int> queue)
        {
            if (!cells.Contains(next) || visited.Contains(next))
            {
                return;
            }

            visited.Add(next);
            queue.Enqueue(next);
        }

        private static void GetAdjacentCells(WallEdge edge, out Vector2Int a, out Vector2Int b)
        {
            if (edge.orientation == WallOrientation.Vertical)
            {
                a = new Vector2Int(edge.x - 1, edge.y);
                b = new Vector2Int(edge.x, edge.y);
                return;
            }

            a = new Vector2Int(edge.x, edge.y - 1);
            b = new Vector2Int(edge.x, edge.y);
        }
    }
}
