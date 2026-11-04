using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Чистая математика поворотов содержимого штампа (без сцены и без
    /// GridBuildingSystem). Вынесена сюда, чтобы один и тот же код
    /// использовали:
    ///  - StampPlacementService (вставка штампа в ЖИВУЮ сцену);
    ///  - StampWorldStateEmitter (виртуальная эмиссия в WorldState при генерации).
    ///
    /// Это устраняет риск, что два места разойдутся в формулах поворота и
    /// сгенерированная карта перестанет совпадать с картой, собранной руками.
    ///
    /// Соглашения совпадают с MapSaveData/StampData:
    ///  - клетка (0,0) штампа — юго-западный угол footprint;
    ///  - поворот вокруг вертикали против часовой, шагами по 90°;
    ///  - после поворота результат снова приводится к юго-западному углу.
    ///
    /// Эти формулы 1:1 повторяют то, что раньше жило приватными методами
    /// внутри StampPlacementService (RotateLocalRect / RotateCellRect /
    /// TransformWallEdge / RotateLocal). Поведение не меняется — меняется
    /// только место, где они лежат.
    /// </summary>
    public static class StampTransform
    {
        public static int NormalizeSteps(int rotationSteps)
        {
            return ((rotationSteps % 4) + 4) % 4;
        }

        public static float NormalizedYaw(int rotationSteps)
        {
            return NormalizeSteps(rotationSteps) * 90f;
        }

        /// <summary>
        /// Поворот локального прямоугольника внутри области areaW×areaL
        /// на rotationSteps CCW. Прямоугольник может выходить за пределы
        /// области (clearance перед дверцей) — формула аффинна и корректна.
        /// </summary>
        public static RectInt RotateLocalRect(RectInt rect, int areaW, int areaL, int rotationSteps)
        {
            int steps = NormalizeSteps(rotationSteps);
            int x = rect.xMin, y = rect.yMin, w = rect.width, l = rect.height;
            int aw = areaW, al = areaL;

            for (int i = 0; i < steps; i++)
            {
                int nx = y;
                int ny = aw - x - w;
                x = nx; y = ny;

                int t = w; w = l; l = t;
                t = aw; aw = al; al = t;
            }

            return new RectInt(x, y, w, l);
        }

        /// <summary>
        /// Поворот origin-клетки прямоугольника fp внутри области w×l
        /// (в клетках слоя объекта) на rotationSteps CCW.
        /// </summary>
        public static Vector2Int RotateCellRect(Vector2Int cell, Vector2Int fp, int w, int l, int rotationSteps)
        {
            int steps = NormalizeSteps(rotationSteps);
            int x = cell.x, y = cell.y;
            int fpx = fp.x, fpy = fp.y;

            for (int i = 0; i < steps; i++)
            {
                int nx = y;
                int ny = w - x - fpx;
                x = nx; y = ny;

                int t = w; w = l; l = t;
                t = fpx; fpx = fpy; fpy = t;
            }

            return new Vector2Int(x, y);
        }

        /// <summary>
        /// Поворот ребра стены штампа (локальные координаты) на rotationSteps
        /// CCW. footprintW/L — РОДНОЙ (неповёрнутый) footprint штампа.
        /// originCell — юго-западная клетка штампа в основной сетке.
        /// level — этаж результирующего ребра.
        /// </summary>
        public static WallEdge TransformWallEdge(StampWall w, int footprintW, int footprintL,
            Vector2Int originCell, int rotationSteps, int level)
        {
            int steps = NormalizeSteps(rotationSteps);
            int x = w.x, y = w.y;
            WallOrientation orient = (WallOrientation)w.orientation;
            int fw = footprintW, fl = footprintL;

            for (int i = 0; i < steps; i++)
            {
                if (orient == WallOrientation.Vertical)
                {
                    int nx = y;
                    int ny = fw - x;
                    x = nx; y = ny;
                    orient = WallOrientation.Horizontal;
                }
                else
                {
                    int nx = y;
                    int ny = fw - 1 - x;
                    x = nx; y = ny;
                    orient = WallOrientation.Vertical;
                }
                int t = fw; fw = fl; fl = t;
            }

            return new WallEdge(originCell.x + x, originCell.y + y, orient, level);
        }

        /// <summary>
        /// Поворот локальной мировой позиции (free-объекты, контрольные точки
        /// дорожек) относительно юго-западного угла штампа.
        /// footprintW/L — РОДНОЙ footprint, cellSize — размер основной клетки.
        /// </summary>
        public static Vector3 RotateLocalPosition(Vector3 local, int footprintW, int footprintL,
            int rotationSteps, float cellSize)
        {
            int steps = NormalizeSteps(rotationSteps);
            float w = footprintW * cellSize;
            float l = footprintL * cellSize;
            float x = local.x, z = local.z;

            for (int i = 0; i < steps; i++)
            {
                float nx = z;
                float nz = w - x;
                x = nx; z = nz;
                float t = w; w = l; l = t;
            }

            return new Vector3(x, local.y, z);
        }

        /// <summary>
        /// Целевая клетка grid-объекта в слое объекта (с учётом ratio между
        /// основной клеткой и клеткой слоя def), как в
        /// StampPlacementService.TransformObjectCell, но БЕЗ обращения к сцене.
        ///
        /// mainCellSize — размер основной клетки (Furniture);
        /// layerCellSize — размер клетки слоя объекта (Decor мельче);
        /// defFootprint — НЕповёрнутый footprint объекта (в клетках его слоя).
        /// </summary>
        public static Vector2Int TransformObjectCell(StampPlacedObject o, Vector2Int defFootprint,
            int footprintW, int footprintL, Vector2Int originCell, int rotationSteps,
            float mainCellSize, float layerCellSize)
        {
            float ratio = mainCellSize / Mathf.Max(0.0001f, layerCellSize); // клеток слоя на одну основную
            int w = Mathf.RoundToInt(footprintW * ratio);
            int l = Mathf.RoundToInt(footprintL * ratio);

            Vector2Int fp = GridBuildingSystem.RotateFootprint(defFootprint, o.rotationSteps);
            Vector2Int local = RotateCellRect(new Vector2Int(o.cellX, o.cellY), fp, w, l, rotationSteps);

            int baseX = Mathf.RoundToInt(originCell.x * ratio);
            int baseY = Mathf.RoundToInt(originCell.y * ratio);
            return new Vector2Int(baseX + local.x, baseY + local.y);
        }
    }
}
