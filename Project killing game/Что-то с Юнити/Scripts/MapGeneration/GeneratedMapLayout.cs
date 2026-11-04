using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public enum GeneratedLocationPlacement
    {
        Indoor,
        Outdoor,
        System
    }

    public enum GeneratedConnectorKind
    {
        Door,
        Stairs,
        Elevator,
        OutdoorPath,
        Teleport
    }

    public enum MapGenerationIssueSeverity
    {
        Info,
        Warning,
        Error
    }

    [Serializable]
    public class GeneratedMapLayout
    {
        public string TemplateId;
        public string WorldId;
        public int Seed;
        public int PlayerCount;

        public readonly List<GeneratedFloorPlan> Floors = new List<GeneratedFloorPlan>();
        public readonly List<GeneratedClusterPlan> Clusters = new List<GeneratedClusterPlan>();
        public readonly List<GeneratedOutdoorZonePlan> OutdoorZones = new List<GeneratedOutdoorZonePlan>();
        public readonly List<GeneratedConnectorPlan> Connectors = new List<GeneratedConnectorPlan>();

        public GeneratedFloorPlan GetOrCreateFloor(int level)
        {
            for (int i = 0; i < Floors.Count; i++)
            {
                if (Floors[i] != null && Floors[i].Level == level)
                {
                    return Floors[i];
                }
            }

            GeneratedFloorPlan floor = new GeneratedFloorPlan { Level = level };
            Floors.Add(floor);
            return floor;
        }

        public GeneratedRoomPlan FindRoom(string roomId)
        {
            if (string.IsNullOrWhiteSpace(roomId))
            {
                return null;
            }

            for (int floorIndex = 0; floorIndex < Floors.Count; floorIndex++)
            {
                GeneratedFloorPlan floor = Floors[floorIndex];
                if (floor == null)
                {
                    continue;
                }

                for (int roomIndex = 0; roomIndex < floor.Rooms.Count; roomIndex++)
                {
                    GeneratedRoomPlan room = floor.Rooms[roomIndex];
                    if (room != null && string.Equals(room.RoomId, roomId, StringComparison.OrdinalIgnoreCase))
                    {
                        return room;
                    }
                }
            }

            return null;
        }

        public GeneratedClusterPlan FindCluster(string clusterId)
        {
            if (string.IsNullOrWhiteSpace(clusterId))
            {
                return null;
            }

            for (int i = 0; i < Clusters.Count; i++)
            {
                GeneratedClusterPlan cluster = Clusters[i];
                if (cluster != null && string.Equals(cluster.ClusterId, clusterId, StringComparison.OrdinalIgnoreCase))
                {
                    return cluster;
                }
            }

            return null;
        }
    }

    [Serializable]
    public class GeneratedFloorPlan
    {
        public string BuildingKey = "main";
        public int Level;
        public RectInt Bounds;
        public readonly List<Vector2Int> CorridorCells = new List<Vector2Int>();
        public readonly List<Vector2Int> HallCells = new List<Vector2Int>();
        public readonly List<Vector2Int> ShaftCells = new List<Vector2Int>();
        public readonly List<GeneratedRoomPlan> Rooms = new List<GeneratedRoomPlan>();

        public bool ContainsRoom(string roomId)
        {
            if (string.IsNullOrWhiteSpace(roomId))
            {
                return false;
            }

            for (int i = 0; i < Rooms.Count; i++)
            {
                if (Rooms[i] != null && string.Equals(Rooms[i].RoomId, roomId, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }

    [Serializable]
    public class GeneratedClusterPlan
    {
        public string ClusterId;
        public string ParentClusterId;
        public string ClusterType;
        public string DisplayName;
        public GeneratedLocationPlacement Placement = GeneratedLocationPlacement.Indoor;
        public int Floor;
        public RectInt Bounds;
        public bool Required;
        public readonly List<string> Tags = new List<string>();
        public readonly List<string> ChildClusterIds = new List<string>();
        public readonly List<string> RoomIds = new List<string>();
        public readonly List<string> OutdoorZoneIds = new List<string>();

        public bool HasTag(string tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                return false;
            }

            for (int i = 0; i < Tags.Count; i++)
            {
                if (string.Equals(Tags[i], tag, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }

    [Serializable]
    public class GeneratedRoomPlan
    {
        public string RoomId;
        public string LocationId;
        public string ClusterId;
        public string DisplayName;
        public string OwnerPlayerId;
        public GeneratedLocationPlacement Placement = GeneratedLocationPlacement.Indoor;
        public int Floor;
        public RectInt Rect;
        public bool Required;
        public bool Windowless;
        public readonly List<string> Tags = new List<string>();
        public readonly List<WallEdge> DoorEdges = new List<WallEdge>();
        public readonly List<WallEdge> WindowEdges = new List<WallEdge>();

        public Vector2Int CenterCell => new Vector2Int(Rect.xMin + Rect.width / 2, Rect.yMin + Rect.height / 2);

        public bool HasTag(string tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                return false;
            }

            for (int i = 0; i < Tags.Count; i++)
            {
                if (string.Equals(Tags[i], tag, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }

    [Serializable]
    public class GeneratedOutdoorZonePlan
    {
        public string ZoneId;
        public string LocationId;
        public string ClusterId;
        public string DisplayName;
        public RectInt Bounds;
        public int TerraceLevel;
        public bool Required;
        public readonly List<string> Tags = new List<string>();
        public readonly List<Vector2Int> InterestPoints = new List<Vector2Int>();
    }

    [Serializable]
    public class GeneratedConnectorPlan
    {
        public string ConnectorId;
        public GeneratedConnectorKind Kind;
        public string FromId;
        public string ToId;
        public int FromFloor;
        public int ToFloor;
        public Vector2Int FromCell;
        public Vector2Int ToCell;
        public WallEdge Edge;
        public string DefinitionId;

        public bool IsVertical => FromFloor != ToFloor || Kind == GeneratedConnectorKind.Stairs || Kind == GeneratedConnectorKind.Elevator;
    }

    [Serializable]
    public class MapGenerationIssue
    {
        public MapGenerationIssueSeverity Severity;
        public string Code;
        public string Message;
        public string ContextId;

        public MapGenerationIssue(MapGenerationIssueSeverity severity, string code, string message, string contextId = null)
        {
            Severity = severity;
            Code = code;
            Message = message;
            ContextId = contextId;
        }

        public override string ToString()
        {
            return $"[{Severity}] {Code}: {Message}" + (string.IsNullOrWhiteSpace(ContextId) ? string.Empty : $" ({ContextId})");
        }
    }

    public class MapGenerationValidationResult
    {
        public readonly List<MapGenerationIssue> Issues = new List<MapGenerationIssue>();
        public bool IsValid => ErrorCount == 0;

        public int ErrorCount
        {
            get
            {
                int count = 0;
                for (int i = 0; i < Issues.Count; i++)
                {
                    if (Issues[i] != null && Issues[i].Severity == MapGenerationIssueSeverity.Error)
                    {
                        count++;
                    }
                }

                return count;
            }
        }

        public void Add(MapGenerationIssueSeverity severity, string code, string message, string contextId = null)
        {
            Issues.Add(new MapGenerationIssue(severity, code, message, contextId));
        }
    }
}
