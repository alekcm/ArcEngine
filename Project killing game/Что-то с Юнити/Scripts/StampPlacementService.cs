using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// «Вставить штамп»: проверка возможности и вставка содержимого StampData
    /// в мир с поворотом 0/90/180/270. Формирует WorldPatch-пару для
    /// undo/redo и мультиплеер-синхронизации (та же схема, что у
    /// TryPaintRoomBatch в BuildWorldCommandService).
    /// </summary>
    public class StampPlacementService
    {
        private readonly GridBuildingSystem grid;
        private readonly WallSystem walls;
        private readonly PathSystem paths;
        private readonly BuildCatalog buildCatalog;
        private readonly WallCatalog wallCatalog;
        private readonly PathCatalog pathCatalog;

        public StampPlacementService(
            GridBuildingSystem grid, WallSystem walls, PathSystem paths,
            BuildCatalog buildCatalog, WallCatalog wallCatalog, PathCatalog pathCatalog)
        {
            this.grid = grid;
            this.walls = walls;
            this.paths = paths;
            this.buildCatalog = buildCatalog;
            this.wallCatalog = wallCatalog;
            this.pathCatalog = pathCatalog;
        }

        /// <summary>Footprint штампа с учётом поворота.</summary>
        public static Vector2Int RotatedFootprint(StampData stamp, int rotationSteps)
        {
            return GridBuildingSystem.RotateFootprint(new Vector2Int(stamp.footprintW, stamp.footprintL), rotationSteps);
        }

        /// <summary>
        /// Поворот локального прямоугольника (например, clearance-зоны)
        /// внутри области areaW×areaL на rotationSteps CCW. Прямоугольник
        /// может выходить за пределы области — формула аффинная и работает.
        /// </summary>
        public static RectInt RotateLocalRect(RectInt rect, int areaW, int areaL, int rotationSteps)
        {
            // Делегируем общей математике, чтобы вставка руками и виртуальная
            // эмиссия генератора (StampWorldStateEmitter) не разошлись.
            return StampTransform.RotateLocalRect(rect, areaW, areaL, rotationSteps);
        }

        /// <summary>
        /// Можно ли вставить штамп так, чтобы ВСЕ его grid-объекты и стены
        /// встали без коллизий. originCell — юго-западная клетка штампа
        /// (основная сетка) после поворота.
        /// </summary>
        public bool CanPlace(StampData stamp, Vector2Int originCell, int rotationSteps, float baseYOffset = 0f)
        {
            foreach (StampPlacedObject o in stamp.content.placedObjects)
            {
                if (!o.useGridPlacement) continue; // free-объекты не конфликтуют по сетке
                BuildingDefinition def = buildCatalog.FindById(o.definitionId);
                if (def == null) return false;

                Vector2Int cell = TransformObjectCell(stamp, o, def, originCell, rotationSteps);
                int rot = o.rotationSteps + rotationSteps;
                if (!grid.CanPlace(def, cell, rot, grid.GridOrigin.y + o.baseY + baseYOffset)) return false;
            }

            foreach (StampWall w in stamp.content.walls)
            {
                WallDefinition def = wallCatalog.FindWallById(w.wallDefinitionId);
                if (def == null) return false;
                WallEdge edge = TransformWallEdge(stamp, w, originCell, rotationSteps, baseYOffset);
                // Существующая стена на том же ребре — не конфликт (пропустим её при вставке).
                if (walls.GetSegment(edge) == null && !walls.CanPlaceWall(def, edge)) return false;
            }

            return true;
        }

        /// <summary>
        /// Вставка. Возвращает forward/backward-патчи (без WorldId — его
        /// проставляет вызывающий). null = не удалось.
        /// </summary>
        public bool TryPlace(StampData stamp, Vector2Int originCell, int rotationSteps,
            out WorldPatch forward, out WorldPatch backward, float baseYOffset = 0f)
        {
            forward = new WorldPatch();
            backward = new WorldPatch();

            if (!CanPlace(stamp, originCell, rotationSteps, baseYOffset)) return false;

            float cellSize = grid.CellSize;
            Vector3 cornerWorld = grid.GridOrigin + new Vector3(originCell.x * cellSize, 0f, originCell.y * cellSize);

            // --- Объекты ---
            foreach (StampPlacedObject o in stamp.content.placedObjects)
            {
                BuildingDefinition def = buildCatalog.FindById(o.definitionId);
                if (def == null) continue;

                PlacedObject placed;
                if (o.useGridPlacement)
                {
                    Vector2Int cell = TransformObjectCell(stamp, o, def, originCell, rotationSteps);
                    int rot = o.rotationSteps + rotationSteps;
                    placed = grid.Place(def, cell, rot, grid.GridOrigin.y + o.baseY + baseYOffset, NormalizedYaw(rot));
                }
                else
                {
                    Vector3 local = o.localPosition.ToVector3();
                    Vector3 world = cornerWorld + RotateLocal(local, stamp, rotationSteps, cellSize) + Vector3.up * baseYOffset;
                    placed = grid.PlaceFree(def, world, o.rotationSteps + rotationSteps,
                        o.rotationY + rotationSteps * 90f);
                }

                if (placed != null)
                {
                    forward.UpsertPlacedObjects.Add(placed.GetState());
                    backward.DeletePlacedObjectIds.Add(placed.ObjectId);
                }
            }

            // --- Стены ---
            foreach (StampWall w in stamp.content.walls)
            {
                WallDefinition def = wallCatalog.FindWallById(w.wallDefinitionId);
                if (def == null) continue;
                WallEdge edge = TransformWallEdge(stamp, w, originCell, rotationSteps, baseYOffset);
                if (walls.GetSegment(edge) != null) continue; // уже есть — оставляем существующую

                WallSegment seg = walls.PlaceWall(def, edge);
                if (seg == null) continue;

                if (!string.IsNullOrEmpty(w.openingDefinitionId))
                {
                    WallOpeningDefinition opening = wallCatalog.FindOpeningById(w.openingDefinitionId);
                    if (opening != null) walls.PlaceOpening(opening, edge);
                }

                forward.UpsertWalls.Add(seg.GetState());
                backward.DeleteWallIds.Add(seg.SegmentId);
            }

            // --- Дорожки ---
            foreach (StampPath p in stamp.content.pathStrokes)
            {
                PathDefinition def = pathCatalog.FindById(p.definitionId);
                if (def == null) continue;

                List<Vector3> points = new List<Vector3>(p.localPoints.Count);
                foreach (SerializableVector3 sp in p.localPoints)
                {
                    points.Add(cornerWorld + RotateLocal(sp.ToVector3(), stamp, rotationSteps, cellSize));
                }

                PathStroke stroke = paths.CreateStroke(def, points, p.width);
                if (stroke != null)
                {
                    forward.UpsertPaths.Add(new PathStrokeState
                    {
                        StrokeId = stroke.StrokeId,
                        DefinitionId = def.id,
                        Width = stroke.Width,
                        ControlPoints = new List<Vector3>(stroke.ControlPoints),
                    });
                    backward.DeletePathIds.Add(stroke.StrokeId);
                }
            }

            return forward.HasAnyChanges;
        }

        // ------------------------------------------------------------------
        // Трансформации локальных координат при повороте штампа.
        // Поворот вокруг вертикальной оси, против часовой в шагах по 90°,
        // результат снова приводится к юго-западному углу.
        // ------------------------------------------------------------------

        /// <summary>Локальная клетка (в клетках слоя def) → мировая клетка слоя.</summary>
        private Vector2Int TransformObjectCell(StampData stamp, StampPlacedObject o, BuildingDefinition def,
            Vector2Int originCell, int rotationSteps)
        {
            float layerCell = grid.GetCellSize(def.layer);

            // Общая математика: повёрнутый footprint + поворот origin-клетки.
            return StampTransform.TransformObjectCell(
                o, def.Footprint, stamp.footprintW, stamp.footprintL,
                originCell, rotationSteps, grid.CellSize, layerCell);
        }

        private WallEdge TransformWallEdge(StampData stamp, StampWall w, Vector2Int originCell, int rotationSteps, float baseYOffset = 0f)
        {
            int level = UnityEngine.Mathf.RoundToInt(baseYOffset / UnityEngine.Mathf.Max(0.01f, FloorContext.FloorHeight));
            return StampTransform.TransformWallEdge(w, stamp.footprintW, stamp.footprintL, originCell, rotationSteps, level);
        }

        private static Vector3 RotateLocal(Vector3 local, StampData stamp, int rotationSteps, float cellSize)
        {
            return StampTransform.RotateLocalPosition(local, stamp.footprintW, stamp.footprintL, rotationSteps, cellSize);
        }

        private static float NormalizedYaw(int rotationSteps)
        {
            return StampTransform.NormalizedYaw(rotationSteps);
        }
    }
}
