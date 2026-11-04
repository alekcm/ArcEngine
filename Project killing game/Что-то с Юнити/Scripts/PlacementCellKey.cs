using System;

namespace MapEditorPrototype
{
    [Serializable]
    public struct PlacementCellKey : IEquatable<PlacementCellKey>
    {
        public int x;
        public int z;
        public int heightLevel;

        public PlacementCellKey(int x, int z, int heightLevel)
        {
            this.x = x;
            this.z = z;
            this.heightLevel = heightLevel;
        }

        public bool Equals(PlacementCellKey other)
        {
            return x == other.x && z == other.z && heightLevel == other.heightLevel;
        }

        public override bool Equals(object obj)
        {
            return obj is PlacementCellKey other && Equals(other);
        }

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = 17;
                hash = hash * 31 + x;
                hash = hash * 31 + z;
                hash = hash * 31 + heightLevel;
                return hash;
            }
        }
    }
}
