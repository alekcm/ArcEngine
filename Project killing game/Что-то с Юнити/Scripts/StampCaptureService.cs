using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// «Сохранить выделение как штамп»: вырезает содержимое прямоугольника
    /// клеток (основная сетка) в StampData с локальными координатами.
    /// Ничего не удаляет из мира — только копирует.
    /// </summary>
    public class StampCaptureService
    {
        private readonly GridBuildingSystem grid;
        private readonly WallSystem walls;
        private readonly PathSystem paths;
        private float floorYOffset;

        public StampCaptureService(GridBuildingSystem grid, WallSystem walls, PathSystem paths)
        {
            this.grid = grid;
            this.walls = walls;
            this.paths = paths;
        }

        /// <summary>
        /// rectMin/rectMax — включительные границы выделения в клетках
        /// ОСНОВНОЙ сетки (Furniture). Захватываются:
        ///  - grid-объекты, чья origin-клетка попадает в прямоугольник
        ///    (в клетках их собственного слоя);
        ///  - free-объекты, чья позиция попадает в мировой прямоугольник;
        ///  - стены, чьи рёбра лежат внутри/на границе;
        ///  - дорожки, у которых ВСЕ контрольные точки внутри.
        /// </summary>
        public StampData Capture(Vector2Int rectMin, Vector2Int rectMax, string stampName, float floorYOffset = 0f)
        {
            this.floorYOffset = floorYOffset;
            Vector2Int min = Vector2Int.Min(rectMin, rectMax);
            Vector2Int max = Vector2Int.Max(rectMin, rectMax);

            float cellSize = grid.CellSize;
            Vector3 origin = grid.GridOrigin;
            // Мировой угол штампа (юго-западный угол min-клетки).
            Vector3 cornerWorld = new Vector3(origin.x + min.x * cellSize, origin.y, origin.z + min.y * cellSize);
            Vector3 cornerMaxWorld = new Vector3(origin.x + (max.x + 1) * cellSize, origin.y, origin.z + (max.y + 1) * cellSize);

            StampData stamp = new StampData
            {
                name = stampName,
                footprintW = max.x - min.x + 1,
                footprintL = max.y - min.y + 1,
            };

            CaptureObjects(stamp, min, max, cornerWorld, cornerMaxWorld);
            CaptureWalls(stamp, min, max);
            CapturePaths(stamp, cornerWorld, cornerMaxWorld);

            return stamp;
        }

        private void CaptureObjects(StampData stamp, Vector2Int min, Vector2Int max, Vector3 cornerWorld, Vector3 cornerMaxWorld)
        {
            foreach (PlacedObject obj in grid.PlacedObjects)
            {
                if (obj == null || obj.Definition == null) continue;

                // Только объекты активного этажа.
                float relY = obj.BaseY - grid.GridOrigin.y - floorYOffset;
                if (relY < -0.01f || relY >= FloorContext.FloorHeight - 0.01f) continue;

                if (obj.UsesGridPlacement)
                {
                    // Origin-клетка объекта в клетках ЕГО слоя → переводим
                    // прямоугольник выделения в клетки этого слоя.
                    float layerCell = grid.GetCellSize(obj.Layer);
                    float ratio = grid.CellSize / layerCell; // 1 для Furniture, 5 для Decor(0.2) и т.п.
                    int loX = Mathf.RoundToInt(min.x * ratio);
                    int loY = Mathf.RoundToInt(min.y * ratio);
                    int hiX = Mathf.RoundToInt((max.x + 1) * ratio) - 1;
                    int hiY = Mathf.RoundToInt((max.y + 1) * ratio) - 1;

                    Vector2Int c = obj.OriginCell;
                    if (c.x < loX || c.x > hiX || c.y < loY || c.y > hiY) continue;

                    stamp.content.placedObjects.Add(new StampPlacedObject
                    {
                        definitionId = obj.Definition.id,
                        useGridPlacement = true,
                        cellX = c.x - loX,
                        cellY = c.y - loY,
                        rotationSteps = obj.RotationSteps,
                        rotationY = obj.RotationY,
                        baseY = obj.BaseY - grid.GridOrigin.y - floorYOffset,
                    });
                }
                else
                {
                    Vector3 p = obj.transform.position;
                    if (p.x < cornerWorld.x || p.x >= cornerMaxWorld.x || p.z < cornerWorld.z || p.z >= cornerMaxWorld.z) continue;

                    stamp.content.placedObjects.Add(new StampPlacedObject
                    {
                        definitionId = obj.Definition.id,
                        useGridPlacement = false,
                        rotationSteps = obj.RotationSteps,
                        rotationY = obj.RotationY,
                        baseY = obj.BaseY - grid.GridOrigin.y - floorYOffset,
                        localPosition = new SerializableVector3(p - cornerWorld - Vector3.up * floorYOffset),
                    });
                }
            }
        }

        private void CaptureWalls(StampData stamp, Vector2Int min, Vector2Int max)
        {
            if (walls == null) return;

            int activeLevel = Mathf.RoundToInt(floorYOffset / Mathf.Max(0.01f, FloorContext.FloorHeight));
            foreach (WallSegment seg in walls.Segments)
            {
                if (seg == null) continue;
                WallEdge e = seg.Edge;
                if (e.level != activeLevel) continue;

                // Ребро принадлежит выделению, если прилегает к его клеткам
                // (включая внешний контур: рёбра max+1 тоже входят).
                bool inside = e.orientation == WallOrientation.Vertical
                    ? (e.x >= min.x && e.x <= max.x + 1 && e.y >= min.y && e.y <= max.y)
                    : (e.x >= min.x && e.x <= max.x && e.y >= min.y && e.y <= max.y + 1);
                if (!inside) continue;

                stamp.content.walls.Add(new StampWall
                {
                    x = e.x - min.x,
                    y = e.y - min.y,
                    orientation = (int)e.orientation,
                    wallDefinitionId = seg.WallDefinition != null ? seg.WallDefinition.id : null,
                    openingDefinitionId = seg.OpeningDefinition != null ? seg.OpeningDefinition.id : null,
                });
            }
        }

        private void CapturePaths(StampData stamp, Vector3 cornerWorld, Vector3 cornerMaxWorld)
        {
            if (paths == null) return;

            foreach (PathStroke stroke in paths.Strokes)
            {
                if (stroke == null || stroke.Definition == null || stroke.ControlPoints.Count == 0) continue;

                bool allInside = true;
                foreach (Vector3 p in stroke.ControlPoints)
                {
                    if (p.x < cornerWorld.x || p.x >= cornerMaxWorld.x || p.z < cornerWorld.z || p.z >= cornerMaxWorld.z)
                    {
                        allInside = false;
                        break;
                    }
                }
                if (!allInside) continue;

                StampPath sp = new StampPath
                {
                    definitionId = stroke.Definition.id,
                    width = stroke.Width,
                };
                foreach (Vector3 p in stroke.ControlPoints)
                {
                    sp.localPoints.Add(new SerializableVector3(p - cornerWorld));
                }
                stamp.content.pathStrokes.Add(sp);
            }
        }
    }
}
