using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Превращает якорь штампа (Wall/Corner/Center/NearDoor/Free) в
    /// упорядоченный список кандидатных позиций+поворотов внутри комнаты.
    ///
    /// Сторона стены берётся из stamp.anchorEdge — игрок отмечает её
    /// кликом в редакторе штампов («у этой грани должна быть стена»).
    /// Поворот вычисляется так, чтобы отмеченная грань легла на стену
    /// комнаты: rot = (стенаКомнаты - граньШтампа) mod 4.
    /// CCW-последовательность граней: south(0) → east(1) → north(2) → west(3).
    /// Если anchorEdge не задана, считается "south" (старые штампы).
    /// </summary>
    public static class AnchorPlacementPlanner
    {
        public struct Candidate
        {
            public Vector2Int Pos;
            public int Rotation;

            public Candidate(Vector2Int pos, int rotation)
            {
                Pos = pos;
                Rotation = rotation;
            }
        }

        private enum WallSide { South = 0, East = 1, North = 2, West = 3 }

        private static int ParseAnchorEdge(string anchorEdge)
        {
            switch ((anchorEdge ?? "").ToLowerInvariant())
            {
                case "east": return 1;
                case "north": return 2;
                case "west": return 3;
                case "back": return 0; // легаси-значение из ранних штампов
                default: return 0;     // "south", пусто
            }
        }

        private static int BackRotationForWall(WallSide side, StampData stamp)
        {
            return (((int)side - ParseAnchorEdge(stamp.anchorEdge)) % 4 + 4) % 4;
        }

        /// <summary>
        /// Кандидаты для штампа в комнате, в порядке убывания приоритета
        /// (внутри одной группы — перемешаны). roomRect — клетки комнаты,
        /// doorCell — клетка перед дверью.
        /// </summary>
        public static List<Candidate> GetCandidates(StampData stamp, RectInt roomRect, Vector2Int doorCell, System.Random rng)
        {
            switch (stamp.anchor)
            {
                case "Wall": return WallCandidates(stamp, roomRect, rng);
                case "Corner": return CornerCandidates(stamp, roomRect, rng);
                case "Center": return CenterCandidates(stamp, roomRect, rng);
                case "NearDoor": return NearDoorCandidates(stamp, roomRect, doorCell, rng);
                // Surface требует сокетов (MVP-3); пока ведёт себя как Free.
                default: return FreeCandidates(stamp, roomRect, rng);
            }
        }

        // ------------------------------------------------------------------

        private static List<Candidate> WallCandidates(StampData stamp, RectInt room, System.Random rng)
        {
            List<Candidate> result = new List<Candidate>();

            foreach (WallSide side in ShuffledSides(rng))
            {
                int rot = BackRotationForWall(side, stamp);
                Vector2Int fp = StampPlacementService.RotatedFootprint(stamp, rot);
                if (fp.x > room.width || fp.y > room.height) continue;

                List<Candidate> sideCandidates = new List<Candidate>();
                switch (side)
                {
                    case WallSide.South:
                        for (int x = room.xMin; x <= room.xMax - fp.x; x++)
                            sideCandidates.Add(new Candidate(new Vector2Int(x, room.yMin), rot));
                        break;
                    case WallSide.North:
                        for (int x = room.xMin; x <= room.xMax - fp.x; x++)
                            sideCandidates.Add(new Candidate(new Vector2Int(x, room.yMax - fp.y), rot));
                        break;
                    case WallSide.East:
                        for (int y = room.yMin; y <= room.yMax - fp.y; y++)
                            sideCandidates.Add(new Candidate(new Vector2Int(room.xMax - fp.x, y), rot));
                        break;
                    case WallSide.West:
                        for (int y = room.yMin; y <= room.yMax - fp.y; y++)
                            sideCandidates.Add(new Candidate(new Vector2Int(room.xMin, y), rot));
                        break;
                }

                Shuffle(sideCandidates, rng);
                result.AddRange(sideCandidates);
            }

            return result;
        }

        private static List<Candidate> CornerCandidates(StampData stamp, RectInt room, System.Random rng)
        {
            List<Candidate> result = new List<Candidate>();

            // Каждый угол: два варианта «спины» (к одной из двух стен угла).
            (Vector2Int corner, WallSide a, WallSide b)[] corners =
            {
                (new Vector2Int(room.xMin, room.yMin), WallSide.South, WallSide.West),
                (new Vector2Int(room.xMax, room.yMin), WallSide.South, WallSide.East),
                (new Vector2Int(room.xMin, room.yMax), WallSide.North, WallSide.West),
                (new Vector2Int(room.xMax, room.yMax), WallSide.North, WallSide.East),
            };

            foreach (var (corner, a, b) in Shuffled(corners, rng))
            {
                foreach (WallSide side in new[] { a, b })
                {
                    int rot = BackRotationForWall(side, stamp);
                    Vector2Int fp = StampPlacementService.RotatedFootprint(stamp, rot);
                    if (fp.x > room.width || fp.y > room.height) continue;

                    int x = corner.x == room.xMin ? room.xMin : room.xMax - fp.x;
                    int y = corner.y == room.yMin ? room.yMin : room.yMax - fp.y;
                    result.Add(new Candidate(new Vector2Int(x, y), rot));
                }
            }

            return result;
        }

        private static List<Candidate> CenterCandidates(StampData stamp, RectInt room, System.Random rng)
        {
            List<Candidate> result = new List<Candidate>();
            int rot = rng.Next(4);

            for (int attempt = 0; attempt < 4; attempt++)
            {
                int r = (rot + attempt) % 4;
                Vector2Int fp = StampPlacementService.RotatedFootprint(stamp, r);
                if (fp.x > room.width || fp.y > room.height) continue;

                Vector2Int center = new Vector2Int(
                    room.xMin + (room.width - fp.x) / 2,
                    room.yMin + (room.height - fp.y) / 2);

                // Центр и кольцо смещений вокруг него.
                List<Candidate> ring = new List<Candidate> { new Candidate(center, r) };
                for (int dx = -1; dx <= 1; dx++)
                {
                    for (int dy = -1; dy <= 1; dy++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        Vector2Int p = center + new Vector2Int(dx, dy);
                        if (p.x >= room.xMin && p.y >= room.yMin &&
                            p.x + fp.x <= room.xMax && p.y + fp.y <= room.yMax)
                        {
                            ring.Add(new Candidate(p, r));
                        }
                    }
                }
                result.AddRange(ring);
            }

            return result;
        }

        private static List<Candidate> NearDoorCandidates(StampData stamp, RectInt room, Vector2Int doorCell, System.Random rng)
        {
            List<Candidate> result = new List<Candidate>();

            for (int radius = 1; radius <= 3; radius++)
            {
                List<Candidate> ringCandidates = new List<Candidate>();
                for (int rot = 0; rot < 4; rot++)
                {
                    Vector2Int fp = StampPlacementService.RotatedFootprint(stamp, rot);
                    if (fp.x > room.width || fp.y > room.height) continue;

                    for (int dx = -radius; dx <= radius; dx++)
                    {
                        for (int dy = -radius; dy <= radius; dy++)
                        {
                            if (Mathf.Max(Mathf.Abs(dx), Mathf.Abs(dy)) != radius) continue;
                            Vector2Int p = doorCell + new Vector2Int(dx, dy);
                            if (p.x >= room.xMin && p.y >= room.yMin &&
                                p.x + fp.x <= room.xMax && p.y + fp.y <= room.yMax)
                            {
                                ringCandidates.Add(new Candidate(p, rot));
                            }
                        }
                    }
                }
                Shuffle(ringCandidates, rng);
                result.AddRange(ringCandidates);
            }

            return result;
        }

        private static List<Candidate> FreeCandidates(StampData stamp, RectInt room, System.Random rng)
        {
            List<Candidate> result = new List<Candidate>();
            for (int rot = 0; rot < 4; rot++)
            {
                Vector2Int fp = StampPlacementService.RotatedFootprint(stamp, rot);
                if (fp.x > room.width || fp.y > room.height) continue;

                for (int x = room.xMin; x <= room.xMax - fp.x; x++)
                {
                    for (int y = room.yMin; y <= room.yMax - fp.y; y++)
                    {
                        result.Add(new Candidate(new Vector2Int(x, y), rot));
                    }
                }
            }
            Shuffle(result, rng);
            return result;
        }

        // ------------------------------------------------------------------

        private static WallSide[] ShuffledSides(System.Random rng)
        {
            WallSide[] sides = { WallSide.South, WallSide.East, WallSide.North, WallSide.West };
            for (int i = sides.Length - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (sides[i], sides[j]) = (sides[j], sides[i]);
            }
            return sides;
        }

        private static T[] Shuffled<T>(T[] array, System.Random rng)
        {
            T[] copy = (T[])array.Clone();
            for (int i = copy.Length - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (copy[i], copy[j]) = (copy[j], copy[i]);
            }
            return copy;
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
