using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// «Виртуальный» аналог SocketFillerService для генератора.
    ///
    /// SocketFillerService заполняет сокеты в ЖИВОЙ сцене (grid.Place,
    /// host.GetTopY). Генератор виртуален, поэтому здесь заполнение идёт через
    /// StampWorldStateEmitter (только данные WorldState), а не через сцену.
    ///
    /// Что повторяется 1:1 со scene-версией:
    ///  - выбор клеток сокета: переиспользуем SocketFillerService.GetSocketWorldCells
    ///    (он static и scene-free);
    ///  - выбор кандидата по filterTags, count/probability, рекурсия с бюджетом.
    ///
    /// Отличие — Surface-сокеты. В сцене высота поверхности берётся из
    /// host.GetTopY() (bounds префаба). Без сцены точных bounds нет, поэтому
    /// Surface-объект ставится на host.baseY + surfaceHeightHint (приблизительно).
    /// При live-редактировании/повторной установке снаппинг на поверхность
    /// отработает точно — здесь же мы лишь даём разумную стартовую высоту.
    /// </summary>
    public class VirtualSocketFiller
    {
        private readonly StampWorldStateEmitter emitter;
        private readonly StampLibraryService library;
        private readonly System.Random rng;
        private readonly float surfaceHeightHint;

        public int MaxDepth = 4;
        public int Budget = 40;

        public VirtualSocketFiller(StampWorldStateEmitter emitter, StampLibraryService library,
            System.Random rng, float surfaceHeightHint = 0.8f)
        {
            this.emitter = emitter;
            this.library = library;
            this.rng = rng ?? new System.Random();
            this.surfaceHeightHint = surfaceHeightHint;
        }

        /// <summary>
        /// Заполнить сокеты штампа stamp, эмитированного в originCell с поворотом
        /// rotationSteps на этаже floor. baseYOffset — доп. высота родителя
        /// (для Surface-вложений). occupied — общие занятые клетки комнаты
        /// (чтобы Area-вложения не лезли на мебель). Возвращает число вставок.
        /// </summary>
        public int Fill(StampData stamp, Vector2Int originCell, int rotationSteps, int floor,
            HashSet<Vector2Int> occupied, int depth = 0, float baseYOffset = 0f)
        {
            if (stamp == null || stamp.sockets == null || stamp.sockets.Count == 0) return 0;
            if (depth >= MaxDepth || Budget <= 0) return 0;

            int placedCount = 0;

            foreach (StampSocket socket in stamp.sockets)
            {
                if (socket == null || socket.filterTags == null || socket.filterTags.Count == 0) continue;

                int want = socket.countMin + (socket.countMax > socket.countMin
                    ? rng.Next(socket.countMax - socket.countMin + 1)
                    : 0);
                if (want <= 0) continue;

                List<Vector2Int> cells = SocketFillerService.GetSocketWorldCells(stamp, socket, originCell, rotationSteps);
                Shuffle(cells, rng);

                int placedHere = 0;
                for (int i = 0; i < want; i++)
                {
                    if (Budget <= 0) break;
                    if (socket.probability < 1f && rng.NextDouble() > socket.probability && placedHere >= socket.countMin)
                    {
                        continue;
                    }

                    if (TryFillOne(socket, cells, floor, occupied, depth, baseYOffset))
                    {
                        placedHere++;
                        placedCount++;
                    }
                }

                if (socket.required && placedHere < socket.countMin)
                {
                    Debug.LogWarning($"[VirtualSocketFiller] '{stamp.id}' сокет '{socket.id}': " +
                                     $"встало {placedHere}/{socket.countMin}.");
                }
            }

            return placedCount;
        }

        private bool TryFillOne(StampSocket socket, List<Vector2Int> cells, int floor,
            HashSet<Vector2Int> occupied, int depth, float baseYOffset)
        {
            List<StampData> candidates = library.FindByTags(socket.filterTags);
            if (candidates == null || candidates.Count == 0) return false;
            Shuffle(candidates, rng);

            bool isSurface = string.Equals(socket.kind, "Surface", System.StringComparison.OrdinalIgnoreCase);

            foreach (StampData child in candidates)
            {
                foreach (Vector2Int cell in cells)
                {
                    // Area-вложение не должно лезть на занятые клетки.
                    // Surface-вложение стоит НА предмете — занятость пола игнорируем.
                    if (!isSurface && occupied != null && occupied.Contains(cell))
                    {
                        continue;
                    }

                    for (int rot = 0; rot < 4; rot++)
                    {
                        Vector2Int fp = StampPlacementService.RotatedFootprint(child, rot);

                        // Для Area проверяем, что весь footprint свободен.
                        if (!isSurface && !IsFree(cell, fp, occupied)) continue;

                        float extraY = isSurface ? baseYOffset + surfaceHeightHint : baseYOffset;

                        StampWorldStateEmitter.EmitResult r = emitter.Emit(child, cell, rot, floor, extraY);
                        if (r.Objects > 0 || r.Walls > 0 || r.Paths > 0)
                        {
                            Budget--;
                            if (!isSurface && occupied != null)
                            {
                                Mark(cell, fp, occupied);
                            }

                            // Рекурсия: сокеты вложенного штампа.
                            Fill(child, cell, rot, floor, occupied, depth + 1, extraY);
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        private static bool IsFree(Vector2Int origin, Vector2Int fp, HashSet<Vector2Int> occupied)
        {
            if (occupied == null) return true;
            for (int dx = 0; dx < fp.x; dx++)
            {
                for (int dy = 0; dy < fp.y; dy++)
                {
                    if (occupied.Contains(new Vector2Int(origin.x + dx, origin.y + dy))) return false;
                }
            }
            return true;
        }

        private static void Mark(Vector2Int origin, Vector2Int fp, HashSet<Vector2Int> occupied)
        {
            for (int dx = 0; dx < fp.x; dx++)
            {
                for (int dy = 0; dy < fp.y; dy++)
                {
                    occupied.Add(new Vector2Int(origin.x + dx, origin.y + dy));
                }
            }
        }

        private static void Shuffle<T>(List<T> list, System.Random rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }
    }
}
