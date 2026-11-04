using System.Collections.Generic;

namespace MapEditorPrototype
{
    public class WorldStateDiffBuilder
    {
        public WorldPatch BuildPatch(WorldState baseState, WorldState editedState)
        {
            WorldPatch patch = new WorldPatch
            {
                WorldId = editedState != null ? editedState.WorldId : baseState != null ? baseState.WorldId : string.Empty,
                BaseBuildVersion = baseState != null && baseState.Versions != null ? baseState.Versions.BuildVersion : 0,
                NewBuildVersion = editedState != null && editedState.Versions != null ? editedState.Versions.BuildVersion : 0
            };

            if (baseState == null || editedState == null) return patch;

            BuildObjectDiff(baseState, editedState, patch);
            BuildWallDiff(baseState, editedState, patch);
            BuildPathDiff(baseState, editedState, patch);
            return patch;
        }

        private void BuildObjectDiff(WorldState baseState, WorldState editedState, WorldPatch patch)
        {
            Dictionary<string, PlacedObjectState> baseMap = new Dictionary<string, PlacedObjectState>();
            foreach (var item in baseState.Build.PlacedObjects) if (item != null && !string.IsNullOrWhiteSpace(item.ObjectId)) baseMap[item.ObjectId] = item;

            Dictionary<string, PlacedObjectState> editedMap = new Dictionary<string, PlacedObjectState>();
            foreach (var item in editedState.Build.PlacedObjects) if (item != null && !string.IsNullOrWhiteSpace(item.ObjectId)) editedMap[item.ObjectId] = item;

            foreach (var pair in editedMap)
                if (!baseMap.TryGetValue(pair.Key, out var baseItem) || !PlacedObjectsEqual(baseItem, pair.Value))
                    patch.UpsertPlacedObjects.Add(pair.Value);

            foreach (var pair in baseMap)
                if (!editedMap.ContainsKey(pair.Key))
                    patch.DeletePlacedObjectIds.Add(pair.Key);
        }

        private void BuildWallDiff(WorldState baseState, WorldState editedState, WorldPatch patch)
        {
            Dictionary<string, WallSegmentState> baseMap = new Dictionary<string, WallSegmentState>();
            foreach (var item in baseState.Build.Walls) if (item != null && !string.IsNullOrWhiteSpace(item.SegmentId)) baseMap[item.SegmentId] = item;

            Dictionary<string, WallSegmentState> editedMap = new Dictionary<string, WallSegmentState>();
            foreach (var item in editedState.Build.Walls) if (item != null && !string.IsNullOrWhiteSpace(item.SegmentId)) editedMap[item.SegmentId] = item;

            foreach (var pair in editedMap)
                if (!baseMap.TryGetValue(pair.Key, out var baseItem) || !WallsEqual(baseItem, pair.Value))
                    patch.UpsertWalls.Add(pair.Value);

            foreach (var pair in baseMap)
                if (!editedMap.ContainsKey(pair.Key))
                    patch.DeleteWallIds.Add(pair.Key);
        }

        private void BuildPathDiff(WorldState baseState, WorldState editedState, WorldPatch patch)
        {
            Dictionary<string, PathStrokeState> baseMap = new Dictionary<string, PathStrokeState>();
            foreach (var item in baseState.Build.PathStrokes) if (item != null && !string.IsNullOrWhiteSpace(item.StrokeId)) baseMap[item.StrokeId] = item;

            Dictionary<string, PathStrokeState> editedMap = new Dictionary<string, PathStrokeState>();
            foreach (var item in editedState.Build.PathStrokes) if (item != null && !string.IsNullOrWhiteSpace(item.StrokeId)) editedMap[item.StrokeId] = item;

            foreach (var pair in editedMap)
                if (!baseMap.TryGetValue(pair.Key, out var baseItem) || !PathsEqual(baseItem, pair.Value))
                    patch.UpsertPaths.Add(pair.Value);

            foreach (var pair in baseMap)
                if (!editedMap.ContainsKey(pair.Key))
                    patch.DeletePathIds.Add(pair.Key);
        }

        private bool PlacedObjectsEqual(PlacedObjectState a, PlacedObjectState b)
        {
            return a != null && b != null &&
                   a.DefinitionId == b.DefinitionId &&
                   a.OriginCell == b.OriginCell &&
                   a.RotationSteps == b.RotationSteps &&
                   Mathf.Approximately(a.RotationY, b.RotationY) &&
                   a.UsesGridPlacement == b.UsesGridPlacement &&
                   Mathf.Approximately(a.BaseY, b.BaseY) &&
                   (a.WorldPosition - b.WorldPosition).sqrMagnitude < 0.0001f;
        }

        private bool WallsEqual(WallSegmentState a, WallSegmentState b)
        {
            return a != null && b != null && a.Edge.Equals(b.Edge) && a.WallDefinitionId == b.WallDefinitionId && a.OpeningDefinitionId == b.OpeningDefinitionId;
        }

        private bool PathsEqual(PathStrokeState a, PathStrokeState b)
        {
            if (a == null || b == null || a.DefinitionId != b.DefinitionId || !Mathf.Approximately(a.Width, b.Width) || a.ControlPoints.Count != b.ControlPoints.Count) return false;
            for (int i = 0; i < a.ControlPoints.Count; i++)
                if ((a.ControlPoints[i] - b.ControlPoints[i]).sqrMagnitude > 0.0001f) return false;
            return true;
        }

        private static class Mathf {
            public static bool Approximately(float a, float b) => UnityEngine.Mathf.Approximately(a, b);
        }
    }
}
