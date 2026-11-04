using System.Collections.Generic;

namespace MapEditorPrototype
{
    public class WorldPatch
    {
        public string WorldId;
        public int BaseBuildVersion;
        public int NewBuildVersion;

        public readonly List<PlacedObjectState> UpsertPlacedObjects = new List<PlacedObjectState>();
        public readonly List<string> DeletePlacedObjectIds = new List<string>();

        public readonly List<WallSegmentState> UpsertWalls = new List<WallSegmentState>();
        public readonly List<string> DeleteWallIds = new List<string>();

        public readonly List<PathStrokeState> UpsertPaths = new List<PathStrokeState>();
        public readonly List<string> DeletePathIds = new List<string>();

        public bool HasAnyChanges =>
            UpsertPlacedObjects.Count > 0 || DeletePlacedObjectIds.Count > 0 ||
            UpsertWalls.Count > 0 || DeleteWallIds.Count > 0 ||
            UpsertPaths.Count > 0 || DeletePathIds.Count > 0;
    }
}
