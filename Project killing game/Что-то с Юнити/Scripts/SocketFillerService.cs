using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Заполнение сокетов вставленного штампа: для каждого сокета выбираются
    /// штампы-кандидаты по filterTags и вставляются в закрашенные клетки.
    ///
    /// Kind:
    ///  - Area    — вложенный штамп ставится на пол в клетках сокета;
    ///  - Surface — на ВЕРХ предмета, занимающего клетку сокета
    ///    (высота берётся из PlacedObject.GetTopY(), как при ручной
    ///    установке на поверхность в BuildSystem).
    ///
    /// Рекурсия: у вложенных штампов тоже заполняются сокеты,
    /// глубина ≤ maxDepth, общий бюджет объектов на вызов.
    /// </summary>
    public class SocketFillerService
    {
        private readonly GridBuildingSystem grid;
        private readonly StampLibraryService library;
        private readonly StampPlacementService placement;
        private readonly float surfacePadding;

        public int MaxDepth = 4;
        public int BudgetPerRoom = 40;

        public SocketFillerService(GridBuildingSystem grid, StampLibraryService library,
            StampPlacementService placement, float surfacePadding = 0.01f)
        {
            this.grid = grid;
            this.library = library;
            this.placement = placement;
            this.surfacePadding = surfacePadding;
        }

        /// <summary>
        /// Заполнить сокеты штампа stamp, вставленного в originCell с
        /// поворотом rotationSteps. Возвращает число вставленных штампов;
        /// failures пополняется описаниями незаполненных required-сокетов.
        /// </summary>
        public int FillSockets(StampData stamp, Vector2Int originCell, int rotationSteps,
            System.Random rng, List<string> failures, int depth = 0, float floorY = 0f)
        {
            if (depth >= MaxDepth || stamp.sockets.Count == 0) return 0;

            int placedCount = 0;
            int budget = BudgetPerRoom;

            foreach (StampSocket socket in stamp.sockets)
            {
                int want = socket.countMin + rng.Next(socket.countMax - socket.countMin + 1);
                if (want <= 0) continue;

                List<Vector2Int> cells = GetSocketWorldCells(stamp, socket, originCell, rotationSteps);
                Shuffle(cells, rng);

                int placedHere = 0;
                for (int i = 0; i < want; i++)
                {
                    if (budget <= 0) break;
                    if (socket.probability < 1f && rng.NextDouble() > socket.probability && placedHere >= socket.countMin) continue;

                    if (TryFillOne(socket, cells, rng, failures, depth, ref budget, floorY))
                    {
                        placedHere++;
                        placedCount++;
                    }
                }

                if (socket.required && placedHere < socket.countMin)
                {
                    failures.Add($"Сокет «{socket.id}» ({string.Join("+", socket.filterTags)}): " +
                                 $"встало {placedHere}/{socket.countMin}.");
                }
            }

            return placedCount;
        }

        private bool TryFillOne(StampSocket socket, List<Vector2Int> cells,
            System.Random rng, List<string> failures, int depth, ref int budget, float floorY = 0f)
        {
            List<StampData> candidates = library.FindByTags(socket.filterTags);
            if (candidates.Count == 0) return false;
            Shuffle(candidates, rng);

            foreach (StampData child in candidates)
            {
                // Сокет не должен тянуть штампы крупнее своей области.
                foreach (Vector2Int cell in cells)
                {
                    for (int rot = 0; rot < 4; rot++)
                    {
                        float yOffset = floorY;
                        if (socket.kind == "Surface")
                        {
                            PlacedObject host = FindHostAtCell(cell);
                            if (host == null) continue;
                            yOffset = host.GetTopY() + surfacePadding - grid.GridOrigin.y;
                        }

                        if (placement.CanPlace(child, cell, rot, yOffset) &&
                            placement.TryPlace(child, cell, rot, out _, out _, yOffset))
                        {
                            budget--;
                            // Рекурсия: сокеты вложенного штампа.
                            FillSockets(child, cell, rot, rng, failures, depth + 1, floorY);
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        /// <summary>Предмет, чья проекция занимает клетку (для Surface-сокета).</summary>
        private PlacedObject FindHostAtCell(Vector2Int cell)
        {
            PlacedObject host = grid.GetPlacedObjectAtCell(cell, BuildLayer.Furniture);
            return host;
        }

        /// <summary>Клетки сокета в мировых координатах с учётом поворота штампа.</summary>
        public static List<Vector2Int> GetSocketWorldCells(StampData stamp, StampSocket socket,
            Vector2Int originCell, int rotationSteps)
        {
            List<Vector2Int> result = new List<Vector2Int>();

            List<StampClearanceRect> rects = socket.cells.Count > 0
                ? socket.cells
                : new List<StampClearanceRect> { socket.area };

            foreach (StampClearanceRect r in rects)
            {
                RectInt rotated = StampPlacementService.RotateLocalRect(
                    new RectInt(r.x, r.y, Mathf.Max(1, r.w), Mathf.Max(1, r.l)),
                    stamp.footprintW, stamp.footprintL, rotationSteps);

                for (int x = rotated.xMin; x < rotated.xMax; x++)
                {
                    for (int y = rotated.yMin; y < rotated.yMax; y++)
                    {
                        result.Add(new Vector2Int(originCell.x + x, originCell.y + y));
                    }
                }
            }

            return result;
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
