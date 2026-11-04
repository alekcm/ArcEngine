using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Определение «комнаты» flood-fill'ом от стартовой клетки:
    /// растекаемся по клеткам, пока не упрёмся в стены (двери/окна — тоже
    /// граница: это часть стены). Результат — клетки комнаты + рёбра её стен.
    ///
    /// Конвенция рёбер (как в WallSystem): Vertical(x,y) — западная грань
    /// клетки (x,y); Horizontal(x,y) — южная грань.
    /// </summary>
    public static class RoomRegionDetector
    {
        public class Region
        {
            public readonly HashSet<Vector2Int> Cells = new HashSet<Vector2Int>();
            public readonly List<WallEdge> BorderEdges = new List<WallEdge>();
            /// <summary>false — комната не замкнута (вышли за лимит клеток).</summary>
            public bool Bounded = true;
        }

        public static Region Detect(Vector2Int start, WallSystem wallSystem, int level = 0, int maxCells = 4096)
        {
            Region region = new Region();
            HashSet<WallEdge> border = new HashSet<WallEdge>();
            Queue<Vector2Int> queue = new Queue<Vector2Int>();

            region.Cells.Add(start);
            queue.Enqueue(start);

            while (queue.Count > 0)
            {
                if (region.Cells.Count > maxCells)
                {
                    region.Bounded = false;
                    break;
                }

                Vector2Int cell = queue.Dequeue();

                Step(cell, new Vector2Int(cell.x + 1, cell.y), new WallEdge(cell.x + 1, cell.y, WallOrientation.Vertical, level));
                Step(cell, new Vector2Int(cell.x - 1, cell.y), new WallEdge(cell.x, cell.y, WallOrientation.Vertical, level));
                Step(cell, new Vector2Int(cell.x, cell.y + 1), new WallEdge(cell.x, cell.y + 1, WallOrientation.Horizontal, level));
                Step(cell, new Vector2Int(cell.x, cell.y - 1), new WallEdge(cell.x, cell.y, WallOrientation.Horizontal, level));
            }

            region.BorderEdges.AddRange(border);
            return region;

            void Step(Vector2Int from, Vector2Int to, WallEdge edge)
            {
                if (IsBlocking(wallSystem, edge))
                {
                    border.Add(edge);
                    return;
                }

                if (region.Cells.Add(to))
                {
                    queue.Enqueue(to);
                }
            }
        }

        private static bool IsBlocking(WallSystem wallSystem, WallEdge edge)
        {
            WallSegment segment = wallSystem.GetSegment(edge);
            return segment != null && segment.WallDefinition != null;
        }
    }
}
