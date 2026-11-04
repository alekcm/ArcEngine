using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Чистая логика раскладки одного этажа (MVP-1):
    /// коридорный скелет (spine) + две полосы комнат по сторонам.
    /// Никакого Unity-мира — только прямоугольники и рёбра.
    /// См. design/layout-algorithm.md §3.
    /// </summary>
    public static class FloorPlanGenerator
    {
        public class GenRoom
        {
            public GenLocationSpec Spec;
            /// <summary>Клетки комнаты: xMin..xMax-1, yMin..yMax-1 (RectInt-полуинтервал).</summary>
            public RectInt Rect;
            /// <summary>Ребро двери в коридор.</summary>
            public WallEdge DoorEdge;
            /// <summary>Клетка ВНУТРИ комнаты перед дверью (держим свободной).</summary>
            public Vector2Int DoorCellInside;
        }

        public class FloorPlan
        {
            public int Seed;
            /// <summary>Вся коробка здания в клетках (полуинтервал).</summary>
            public RectInt Bounds;
            public RectInt Corridor;
            public List<GenRoom> Rooms = new List<GenRoom>();
            public List<string> Warnings = new List<string>();
        }

        public static FloorPlan Generate(GenTemplate template, int seed, Vector2Int origin)
        {
            System.Random rng = new System.Random(seed);
            FloorPlan plan = new FloorPlan { Seed = seed };

            // 1. Кластеры комнат. Кластер = неделимая группа, которая ляжет
            // в одну полосу подряд (стена к стене):
            //  - все инстансы локаций с одним groupKey («крыло»);
            //  - пары adjacentTo (кухня + столовая);
            //  - остальные локации — кластеры из одной комнаты.
            // Порядок кластеров СЛУЧАЙНЫЙ (раньше была детерминированная
            // сортировка — отсюда «кладовые всегда первые слева снизу»).
            List<List<GenLocationSpec>> clusters = BuildClusters(template, rng);

            // 2. Глубина полос и ширина коридора.
            int depthSouth = rng.Next(template.roomDepthMin, template.roomDepthMax + 1);
            int depthNorth = rng.Next(template.roomDepthMin, template.roomDepthMax + 1);
            int cw = Mathf.Max(1, template.corridorWidth);

            // 3. Распределение КЛАСТЕРАМИ: кластер целиком уходит в более
            // короткую полосу — его комнаты гарантированно соседствуют.
            List<(GenLocationSpec spec, int width)> south = new List<(GenLocationSpec, int)>();
            List<(GenLocationSpec spec, int width)> north = new List<(GenLocationSpec, int)>();
            int southWidth = 0, northWidth = 0;

            foreach (List<GenLocationSpec> cluster in clusters)
            {
                bool toSouth = southWidth <= northWidth;
                foreach (GenLocationSpec spec in cluster)
                {
                    int width = rng.Next(spec.widthMin, spec.widthMax + 1);
                    if (toSouth) { south.Add((spec, width)); southWidth += width; }
                    else { north.Add((spec, width)); northWidth += width; }
                }
            }

            int buildingWidth = Mathf.Max(southWidth, northWidth);
            if (buildingWidth == 0)
            {
                plan.Warnings.Add("Шаблон пуст: нет ни одной локации.");
                return plan;
            }

            // 4. Короткую полосу дотягиваем: остаток размазывается по всем
            // комнатам полосы (+1 по кругу), а не уходит одной последней —
            // иначе последняя комната получалась непропорционально длинной.
            DistributeRemainder(south, buildingWidth - southWidth);
            DistributeRemainder(north, buildingWidth - northWidth);

            // 5. Координаты. Юг: y 0..dS-1; коридор: dS..dS+cw-1; север: выше.
            plan.Bounds = new RectInt(origin.x, origin.y, buildingWidth, depthSouth + cw + depthNorth);
            plan.Corridor = new RectInt(origin.x, origin.y + depthSouth, buildingWidth, cw);

            LayoutStrip(plan, south, origin.x, origin.y, depthSouth, isSouth: true, rng);
            LayoutStrip(plan, north, origin.x, origin.y + depthSouth + cw, depthNorth, isSouth: false, rng);

            return plan;
        }

        private static List<List<GenLocationSpec>> BuildClusters(GenTemplate template, System.Random rng)
        {
            List<List<GenLocationSpec>> clusters = new List<List<GenLocationSpec>>();
            Dictionary<string, List<GenLocationSpec>> wings = new Dictionary<string, List<GenLocationSpec>>();
            Dictionary<string, List<GenLocationSpec>> byId = new Dictionary<string, List<GenLocationSpec>>();

            // Развернуть инстансы.
            List<GenLocationSpec> singles = new List<GenLocationSpec>();
            foreach (GenLocationSpec spec in template.locations)
            {
                for (int i = 0; i < spec.count; i++)
                {
                    if (!string.IsNullOrEmpty(spec.groupKey))
                    {
                        if (!wings.TryGetValue(spec.groupKey, out var list)) wings[spec.groupKey] = list = new List<GenLocationSpec>();
                        list.Add(spec);
                    }
                    else
                    {
                        singles.Add(spec);
                    }
                    if (!byId.TryGetValue(spec.id, out var idList)) byId[spec.id] = idList = new List<GenLocationSpec>();
                    idList.Add(spec);
                }
            }

            // Крылья — готовые кластеры.
            foreach (var wing in wings.Values) clusters.Add(wing);

            // adjacent-пары: локация притягивается к первому инстансу цели.
            HashSet<GenLocationSpec> used = new HashSet<GenLocationSpec>();
            foreach (GenLocationSpec spec in singles)
            {
                if (used.Contains(spec)) continue;
                if (!string.IsNullOrEmpty(spec.adjacentTo) && byId.TryGetValue(spec.adjacentTo, out var targets))
                {
                    GenLocationSpec target = targets.Find(t => !used.Contains(t) && singles.Contains(t));
                    if (target != null)
                    {
                        clusters.Add(new List<GenLocationSpec> { target, spec });
                        used.Add(spec);
                        used.Add(target);
                        continue;
                    }
                }
            }
            foreach (GenLocationSpec spec in singles)
            {
                if (!used.Contains(spec)) clusters.Add(new List<GenLocationSpec> { spec });
            }

            // Случайный порядок кластеров; внутри крыла тоже перемешиваем.
            for (int i = clusters.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (clusters[i], clusters[j]) = (clusters[j], clusters[i]);
            }
            foreach (var cluster in clusters)
            {
                if (cluster.Count > 2)
                {
                    for (int i = cluster.Count - 1; i > 0; i--)
                    {
                        int j = rng.Next(i + 1);
                        (cluster[i], cluster[j]) = (cluster[j], cluster[i]);
                    }
                }
            }

            return clusters;
        }

        private static void DistributeRemainder(List<(GenLocationSpec spec, int width)> strip, int remainder)
        {
            if (remainder <= 0 || strip.Count == 0) return;

            // По +1 клетке по кругу, но не раздуваем комнату больше чем
            // в 1.5 × widthMax — излишек сверх лимита уйдёт другим.
            int index = 0;
            int safety = remainder * strip.Count + strip.Count;
            while (remainder > 0 && safety-- > 0)
            {
                var room = strip[index];
                int cap = Mathf.Max(room.spec.widthMax + room.spec.widthMax / 2, room.spec.widthMin + 1);
                if (room.width < cap)
                {
                    strip[index] = (room.spec, room.width + 1);
                    remainder--;
                }
                index = (index + 1) % strip.Count;
            }

            // Если все упёрлись в лимит (редко) — остаток всё же отдаём последней,
            // полосы обязаны совпасть по ширине.
            if (remainder > 0)
            {
                var last = strip[strip.Count - 1];
                strip[strip.Count - 1] = (last.spec, last.width + remainder);
            }
        }

        private static void LayoutStrip(FloorPlan plan, List<(GenLocationSpec spec, int width)> strip,
            int startX, int stripY, int depth, bool isSouth, System.Random rng)
        {
            int x = startX;
            foreach ((GenLocationSpec spec, int width) in strip)
            {
                GenRoom room = new GenRoom
                {
                    Spec = spec,
                    Rect = new RectInt(x, stripY, width, depth),
                };

                // Дверь в коридор: у юга — верхняя грань, у севера — нижняя.
                int doorX = width >= 3 ? rng.Next(x + 1, x + width - 1) : x;
                if (isSouth)
                {
                    // Горизонтальное ребро (x, y) — нижняя грань клетки (x, y).
                    room.DoorEdge = new WallEdge(doorX, stripY + depth, WallOrientation.Horizontal);
                    room.DoorCellInside = new Vector2Int(doorX, stripY + depth - 1);
                }
                else
                {
                    room.DoorEdge = new WallEdge(doorX, stripY, WallOrientation.Horizontal);
                    room.DoorCellInside = new Vector2Int(doorX, stripY);
                }

                plan.Rooms.Add(room);
                x += width;
            }
        }
    }
}
