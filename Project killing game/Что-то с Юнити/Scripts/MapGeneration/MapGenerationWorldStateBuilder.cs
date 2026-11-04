using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Небольшой builder для экспорта результата генерации в обычный WorldState.
    ///
    /// Он не инстанцирует префабы и не трогает сцену. Поэтому генератор может
    /// работать как «виртуальный строитель»: сначала собрать WorldState, затем
    /// применить его существующим MapSaveSystem/WorldStateApplyService.
    /// </summary>
    public class MapGenerationWorldStateBuilder
    {
        private readonly WorldState state;
        private readonly float cellSize;
        private readonly Vector3 gridOrigin;
        private int nextObjectId;
        private int nextWallId;
        private int nextPathId;

        public WorldState State => state;

        public MapGenerationWorldStateBuilder(string worldId, int buildVersion, float cellSize = 1f, Vector3? gridOrigin = null)
        {
            this.cellSize = Mathf.Max(0.01f, cellSize);
            this.gridOrigin = gridOrigin ?? Vector3.zero;

            state = new WorldState
            {
                WorldId = string.IsNullOrWhiteSpace(worldId) ? Guid.NewGuid().ToString("N") : worldId
            };

            state.Versions.BuildVersion = buildVersion;
            state.Versions.RuntimeVersion = 0;
        }

        public PlacedObjectState AddGridObject(string definitionId, Vector2Int originCell, int floor, int rotationSteps = 0, float rotationY = 0f, string objectId = null)
        {
            if (string.IsNullOrWhiteSpace(definitionId))
            {
                return null;
            }

            float baseY = gridOrigin.y + FloorContext.FloorY(floor);
            PlacedObjectState item = new PlacedObjectState
            {
                ObjectId = string.IsNullOrWhiteSpace(objectId) ? NextObjectId(definitionId) : objectId,
                DefinitionId = definitionId,
                OriginCell = originCell,
                RotationSteps = NormalizeRotationSteps(rotationSteps),
                RotationY = rotationY,
                UsesGridPlacement = true,
                BaseY = baseY,
                WorldPosition = CellToWorld(originCell, floor)
            };

            state.Build.PlacedObjects.Add(item);
            return item;
        }

        public PlacedObjectState AddFreeObject(string definitionId, Vector3 worldPosition, int rotationSteps = 0, float rotationY = 0f, string objectId = null)
        {
            if (string.IsNullOrWhiteSpace(definitionId))
            {
                return null;
            }

            PlacedObjectState item = new PlacedObjectState
            {
                ObjectId = string.IsNullOrWhiteSpace(objectId) ? NextObjectId(definitionId) : objectId,
                DefinitionId = definitionId,
                OriginCell = WorldToCell(worldPosition),
                RotationSteps = NormalizeRotationSteps(rotationSteps),
                RotationY = rotationY,
                UsesGridPlacement = false,
                BaseY = worldPosition.y,
                WorldPosition = worldPosition
            };

            state.Build.PlacedObjects.Add(item);
            return item;
        }

        public WallSegmentState AddWall(string wallDefinitionId, WallEdge edge, string openingDefinitionId = null, string segmentId = null)
        {
            if (string.IsNullOrWhiteSpace(wallDefinitionId))
            {
                return null;
            }

            WallSegmentState item = new WallSegmentState
            {
                SegmentId = string.IsNullOrWhiteSpace(segmentId) ? NextWallId(edge) : segmentId,
                Edge = edge,
                WallDefinitionId = wallDefinitionId,
                OpeningDefinitionId = openingDefinitionId
            };

            state.Build.Walls.Add(item);
            return item;
        }

        public PathStrokeState AddPath(string pathDefinitionId, IReadOnlyList<Vector3> controlPoints, float width, string strokeId = null)
        {
            if (string.IsNullOrWhiteSpace(pathDefinitionId) || controlPoints == null || controlPoints.Count < 2)
            {
                return null;
            }

            PathStrokeState item = new PathStrokeState
            {
                StrokeId = string.IsNullOrWhiteSpace(strokeId) ? NextPathId(pathDefinitionId) : strokeId,
                DefinitionId = pathDefinitionId,
                Width = Mathf.Max(0.01f, width)
            };

            for (int i = 0; i < controlPoints.Count; i++)
            {
                item.ControlPoints.Add(controlPoints[i]);
            }

            state.Build.PathStrokes.Add(item);
            return item;
        }

        public Vector3 CellToWorld(Vector2Int cell, int floor)
        {
            return new Vector3(
                gridOrigin.x + cell.x * cellSize,
                gridOrigin.y + FloorContext.FloorY(floor),
                gridOrigin.z + cell.y * cellSize);
        }

        public Vector2Int WorldToCell(Vector3 worldPosition)
        {
            Vector3 local = worldPosition - gridOrigin;
            return new Vector2Int(Mathf.FloorToInt(local.x / cellSize), Mathf.FloorToInt(local.z / cellSize));
        }

        public void SetExplorerSpawn(Vector3 position, float yaw)
        {
            state.Runtime.ExplorerPosition = position;
            state.Runtime.ExplorerYaw = yaw;
        }

        private string NextObjectId(string definitionId)
        {
            return $"gen_obj_{Sanitize(definitionId)}_{nextObjectId++:000000}";
        }

        private string NextWallId(WallEdge edge)
        {
            return $"gen_wall_{edge.level}_{edge.x}_{edge.y}_{edge.orientation}_{nextWallId++:000000}";
        }

        private string NextPathId(string definitionId)
        {
            return $"gen_path_{Sanitize(definitionId)}_{nextPathId++:000000}";
        }

        private static int NormalizeRotationSteps(int rotationSteps)
        {
            return ((rotationSteps % 4) + 4) % 4;
        }

        private static string Sanitize(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "item";
            }

            char[] chars = value.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (!char.IsLetterOrDigit(c) && c != '_' && c != '-')
                {
                    chars[i] = '_';
                }
            }

            return new string(chars);
        }
    }
}
