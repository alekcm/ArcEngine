using System;

namespace MapEditorPrototype
{
    /// <summary>
    /// Ребро стены. ОБНОВЛЕНО: добавлен level (этаж). Старые вызовы
    /// с тремя аргументами работают без изменений (level = 0),
    /// старые сейвы грузятся как этаж 0.
    /// ЗАМЕНЯЕТ Assets/Scripts/WallEdge.cs.
    /// </summary>
    [Serializable]
    public struct WallEdge : IEquatable<WallEdge>
    {
        public int x;
        public int y;
        public WallOrientation orientation;
        public int level;

        public WallEdge(int x, int y, WallOrientation orientation, int level = 0)
        {
            this.x = x;
            this.y = y;
            this.orientation = orientation;
            this.level = level;
        }

        public bool Equals(WallEdge other)
        {
            return x == other.x && y == other.y && orientation == other.orientation && level == other.level;
        }

        public override bool Equals(object obj)
        {
            return obj is WallEdge other && Equals(other);
        }

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = 17;
                hash = hash * 31 + x;
                hash = hash * 31 + y;
                hash = hash * 31 + (int)orientation;
                hash = hash * 31 + level;
                return hash;
            }
        }

        public override string ToString()
        {
            return $"({x}, {y}, {orientation}, эт.{level})";
        }
    }
}
