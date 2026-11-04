using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// «Виртуальный штамповщик» для генератора.
    ///
    /// Принимает StampData + позицию (originCell в основной сетке) + поворот
    /// (0/90/180/270) + этаж и ДОПИСЫВАЕТ его содержимое (placedObjects,
    /// walls, pathStrokes) в WorldState через MapGenerationWorldStateBuilder.
    ///
    /// В отличие от StampPlacementService, он НЕ трогает сцену
    /// (никаких grid.Place / walls.PlaceWall) — только наполняет данные.
    /// Это и есть принцип «генератор — виртуальный строитель»:
    /// результат неотличим от карты, собранной руками, и проходит тем же
    /// путём MapSaveSystem / репликации.
    ///
    /// Геометрия поворотов берётся из StampTransform — общего с
    /// StampPlacementService источника формул, поэтому сгенерированный штамп
    /// встаёт идентично штампу, вставленному руками.
    /// </summary>
    public class StampWorldStateEmitter
    {
        private readonly MapGenerationWorldStateBuilder builder;
        private readonly BuildCatalog buildCatalog;
        private readonly WallCatalog wallCatalog;
        private readonly PathCatalog pathCatalog;
        private readonly float mainCellSize;
        private readonly float decorCellSize;
        private readonly Vector3 gridOrigin;

        /// <summary>Результат одной эмиссии (для подсчёта/логов/тестов).</summary>
        public struct EmitResult
        {
            public int Objects;
            public int Walls;
            public int Paths;
            public int SkippedUnknownDefinition;

            public int Total => Objects + Walls + Paths;
            public override string ToString() =>
                $"obj={Objects}, walls={Walls}, paths={Paths}, skipped={SkippedUnknownDefinition}";
        }

        /// <param name="buildCatalog">для footprint/слоя объектов и проверки definitionId</param>
        /// <param name="wallCatalog">для проверки wall/opening id (необязателен)</param>
        /// <param name="pathCatalog">для проверки path id (необязателен)</param>
        /// <param name="mainCellSize">размер основной клетки (Furniture)</param>
        /// <param name="decorCellSize">размер клетки слоя Decor</param>
        /// <param name="gridOrigin">origin сетки (как у builder)</param>
        public StampWorldStateEmitter(
            MapGenerationWorldStateBuilder builder,
            BuildCatalog buildCatalog,
            WallCatalog wallCatalog,
            PathCatalog pathCatalog,
            float mainCellSize = 1f,
            float decorCellSize = 0.2f,
            Vector3? gridOrigin = null)
        {
            this.builder = builder;
            this.buildCatalog = buildCatalog;
            this.wallCatalog = wallCatalog;
            this.pathCatalog = pathCatalog;
            this.mainCellSize = Mathf.Max(0.01f, mainCellSize);
            this.decorCellSize = Mathf.Max(0.01f, decorCellSize);
            this.gridOrigin = gridOrigin ?? Vector3.zero;
        }

        /// <summary>
        /// Эмитировать штамп в WorldState.
        /// originCell — юго-западная клетка штампа В ОСНОВНОЙ СЕТКЕ ПОСЛЕ
        /// поворота (т.е. та клетка, куда генератор хочет «поставить» штамп).
        /// rotationSteps — 0/1/2/3 (×90° CCW).
        /// floor — этаж (как у builder: высота = FloorContext.FloorY(floor)).
        /// extraBaseYOffset — дополнительная высота (например, штамп на
        /// поверхности другого штампа); обычно 0.
        /// </summary>
        public EmitResult Emit(StampData stamp, Vector2Int originCell, int rotationSteps, int floor, float extraBaseYOffset = 0f)
        {
            EmitResult result = default;
            if (stamp == null || stamp.content == null)
            {
                return result;
            }

            int steps = StampTransform.NormalizeSteps(rotationSteps);
            float floorBaseY = gridOrigin.y + FloorContext.FloorY(floor);

            // Мировой угол штампа (юго-западный угол originCell в основной сетке).
            Vector3 cornerWorld = new Vector3(
                gridOrigin.x + originCell.x * mainCellSize,
                floorBaseY,
                gridOrigin.z + originCell.y * mainCellSize);

            EmitObjects(stamp, originCell, steps, floor, floorBaseY, extraBaseYOffset, cornerWorld, ref result);
            EmitWalls(stamp, originCell, steps, floor, ref result);
            EmitPaths(stamp, steps, cornerWorld, extraBaseYOffset, ref result);

            return result;
        }

        // ------------------------------------------------------------------

        private void EmitObjects(StampData stamp, Vector2Int originCell, int steps, int floor,
            float floorBaseY, float extraBaseYOffset, Vector3 cornerWorld, ref EmitResult result)
        {
            foreach (StampPlacedObject o in stamp.content.placedObjects)
            {
                if (o == null || string.IsNullOrWhiteSpace(o.definitionId))
                {
                    continue;
                }

                BuildingDefinition def = buildCatalog != null ? buildCatalog.FindById(o.definitionId) : null;
                if (def == null)
                {
                    // Неизвестный definitionId — пропускаем, не валим всю карту.
                    result.SkippedUnknownDefinition++;
                    Debug.LogWarning($"[StampEmitter] '{stamp.id}': неизвестный definitionId '{o.definitionId}', объект пропущен.");
                    continue;
                }

                int rot = StampTransform.NormalizeSteps(o.rotationSteps + steps);
                // Высота объекта: этаж + сохранённая локальная высота штампа + доп.смещение.
                float baseY = floorBaseY + o.baseY + extraBaseYOffset;

                if (o.useGridPlacement)
                {
                    float layerCellSize = LayerCellSize(def.layer);
                    Vector2Int cell = StampTransform.TransformObjectCell(
                        o, def.Footprint, stamp.footprintW, stamp.footprintL,
                        originCell, steps, mainCellSize, layerCellSize);

                    // ВАЖНО: WorldStateApplyService для grid-объектов вызывает
                    // grid.Place(def, OriginCell, RotationSteps, BaseY, ...) и
                    // САМ пересчитывает мировую позицию (центр-оффсет, worldOffset,
                    // размер клетки слоя). Поэтому здесь НЕЛЬЗЯ заранее
                    // прибавлять center/worldOffset — достаточно отдать
                    // OriginCell (в клетках слоя объекта) + BaseY + поворот.
                    Vector3 cornerForMeta = LayerCellToWorld(cell, def.layer, baseY);
                    PlacedObjectState state = builder.AddPlacedGridObject(
                        o.definitionId, cell, baseY, rot, StampTransform.NormalizedYaw(rot), cornerForMeta);
                    if (state != null)
                    {
                        result.Objects++;
                    }
                }
                else
                {
                    Vector3 local = o.localPosition.ToVector3();
                    Vector3 world = cornerWorld
                                    + StampTransform.RotateLocalPosition(local, stamp.footprintW, stamp.footprintL, steps, mainCellSize)
                                    + Vector3.up * extraBaseYOffset;

                    PlacedObjectState state = builder.AddFreeObject(
                        o.definitionId, world, rot, o.rotationY + steps * 90f);
                    if (state != null)
                    {
                        result.Objects++;
                    }
                }
            }
        }

        private void EmitWalls(StampData stamp, Vector2Int originCell, int steps, int floor, ref EmitResult result)
        {
            foreach (StampWall w in stamp.content.walls)
            {
                if (w == null || string.IsNullOrWhiteSpace(w.wallDefinitionId))
                {
                    continue;
                }

                if (wallCatalog != null && wallCatalog.FindWallById(w.wallDefinitionId) == null)
                {
                    result.SkippedUnknownDefinition++;
                    Debug.LogWarning($"[StampEmitter] '{stamp.id}': неизвестный wallDefinitionId '{w.wallDefinitionId}', стена пропущена.");
                    continue;
                }

                WallEdge edge = StampTransform.TransformWallEdge(
                    w, stamp.footprintW, stamp.footprintL, originCell, steps, floor);

                string opening = w.openingDefinitionId;
                if (!string.IsNullOrEmpty(opening) && wallCatalog != null && wallCatalog.FindOpeningById(opening) == null)
                {
                    Debug.LogWarning($"[StampEmitter] '{stamp.id}': неизвестный openingDefinitionId '{opening}', проём опущен.");
                    opening = null;
                }

                WallSegmentState state = builder.AddWall(w.wallDefinitionId, edge, opening);
                if (state != null)
                {
                    result.Walls++;
                }
            }
        }

        private void EmitPaths(StampData stamp, int steps, Vector3 cornerWorld, float extraBaseYOffset, ref EmitResult result)
        {
            foreach (StampPath p in stamp.content.pathStrokes)
            {
                if (p == null || string.IsNullOrWhiteSpace(p.definitionId) || p.localPoints == null || p.localPoints.Count < 2)
                {
                    continue;
                }

                if (pathCatalog != null && pathCatalog.FindById(p.definitionId) == null)
                {
                    result.SkippedUnknownDefinition++;
                    Debug.LogWarning($"[StampEmitter] '{stamp.id}': неизвестный path definitionId '{p.definitionId}', дорожка пропущена.");
                    continue;
                }

                List<Vector3> points = new List<Vector3>(p.localPoints.Count);
                foreach (SerializableVector3 sp in p.localPoints)
                {
                    Vector3 local = sp.ToVector3();
                    points.Add(cornerWorld
                               + StampTransform.RotateLocalPosition(local, stamp.footprintW, stamp.footprintL, steps, mainCellSize)
                               + Vector3.up * extraBaseYOffset);
                }

                PathStrokeState state = builder.AddPath(p.definitionId, points, p.width);
                if (state != null)
                {
                    result.Paths++;
                }
            }
        }

        // ------------------------------------------------------------------
        // Локальные хелперы по слоям (повторяют логику GridBuildingSystem,
        // но без обращения к сцене — генератор виртуален).
        // ------------------------------------------------------------------

        private float LayerCellSize(BuildLayer layer)
        {
            return layer == BuildLayer.Decor ? decorCellSize : mainCellSize;
        }

        private Vector3 LayerCellToWorld(Vector2Int cell, BuildLayer layer, float baseY)
        {
            float cs = LayerCellSize(layer);
            return new Vector3(gridOrigin.x + cell.x * cs, baseY, gridOrigin.z + cell.y * cs);
        }
    }

    /// <summary>
    /// Расширения MapGenerationWorldStateBuilder, нужные эмиттеру штампов.
    /// Вынесены в extension, чтобы не править сам builder
    /// (минимум диффов в существующих файлах).
    /// </summary>
    public static class MapGenerationWorldStateBuilderStampExtensions
    {
        /// <summary>
        /// Добавить grid-объект с ЯВНЫМИ OriginCell (в клетках слоя объекта),
        /// BaseY и поворотом. В отличие от штатного AddGridObject(floor, ...),
        /// который сам считает BaseY от этажа и работает только в основной сетке,
        /// этот метод нужен для содержимого штампов: объекты могут быть в слое
        /// Decor (мелкая сетка) и на нестандартной высоте (поверхность стола).
        ///
        /// WorldStateApplyService для grid-объектов всё равно пересчитает
        /// мировую позицию из OriginCell+BaseY, поэтому worldPositionMeta —
        /// только справочное значение для инструментов/превью.
        /// </summary>
        public static PlacedObjectState AddPlacedGridObject(
            this MapGenerationWorldStateBuilder builder,
            string definitionId, Vector2Int originCell, float baseY,
            int rotationSteps, float rotationY, Vector3 worldPositionMeta)
        {
            if (builder == null || string.IsNullOrWhiteSpace(definitionId))
            {
                return null;
            }

            PlacedObjectState item = new PlacedObjectState
            {
                ObjectId = $"gen_stamp_{Sanitize(definitionId)}_{builder.State.Build.PlacedObjects.Count:000000}",
                DefinitionId = definitionId,
                OriginCell = originCell,
                RotationSteps = ((rotationSteps % 4) + 4) % 4,
                RotationY = rotationY,
                UsesGridPlacement = true,
                BaseY = baseY,
                WorldPosition = worldPositionMeta
            };

            builder.State.Build.PlacedObjects.Add(item);
            return item;
        }

        private static string Sanitize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "item";
            char[] chars = value.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (!char.IsLetterOrDigit(c) && c != '_' && c != '-') chars[i] = '_';
            }
            return new string(chars);
        }
    }
}
