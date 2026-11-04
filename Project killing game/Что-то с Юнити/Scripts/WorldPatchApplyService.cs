using System.Collections.Generic;

namespace MapEditorPrototype
{
    public class WorldPatchApplyService
    {
        public void Apply(WorldState target, WorldPatch patch)
        {
            if (target == null || patch == null)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(patch.WorldId))
            {
                target.WorldId = patch.WorldId;
            }

            ApplyPlacedObjectChanges(target.Build.PlacedObjects, patch);
            ApplyWallChanges(target.Build.Walls, patch);
            ApplyPathChanges(target.Build.PathStrokes, patch);

            if (target.Versions != null)
            {
                target.Versions.BuildVersion = patch.NewBuildVersion > 0 ? patch.NewBuildVersion : target.Versions.BuildVersion;
            }
        }

        private void ApplyPlacedObjectChanges(List<PlacedObjectState> targetList, WorldPatch patch)
        {
            if (targetList == null)
            {
                return;
            }

            for (int i = targetList.Count - 1; i >= 0; i--)
            {
                PlacedObjectState item = targetList[i];
                if (item != null && patch.DeletePlacedObjectIds.Contains(item.ObjectId))
                {
                    targetList.RemoveAt(i);
                }
            }

            for (int i = 0; i < patch.UpsertPlacedObjects.Count; i++)
            {
                PlacedObjectState incoming = patch.UpsertPlacedObjects[i];
                if (incoming == null)
                {
                    continue;
                }

                int existingIndex = FindPlacedObjectIndex(targetList, incoming.ObjectId);
                if (existingIndex >= 0)
                {
                    targetList[existingIndex] = ClonePlacedObjectState(incoming);
                }
                else
                {
                    targetList.Add(ClonePlacedObjectState(incoming));
                }
            }
        }

        private void ApplyWallChanges(List<WallSegmentState> targetList, WorldPatch patch)
        {
            if (targetList == null)
            {
                return;
            }

            for (int i = targetList.Count - 1; i >= 0; i--)
            {
                WallSegmentState item = targetList[i];
                if (item != null && patch.DeleteWallIds.Contains(item.SegmentId))
                {
                    targetList.RemoveAt(i);
                }
            }

            for (int i = 0; i < patch.UpsertWalls.Count; i++)
            {
                WallSegmentState incoming = patch.UpsertWalls[i];
                if (incoming == null)
                {
                    continue;
                }

                int existingIndex = FindWallIndex(targetList, incoming.SegmentId);
                if (existingIndex >= 0)
                {
                    targetList[existingIndex] = CloneWallState(incoming);
                }
                else
                {
                    targetList.Add(CloneWallState(incoming));
                }
            }
        }

        private void ApplyPathChanges(List<PathStrokeState> targetList, WorldPatch patch)
        {
            if (targetList == null)
            {
                return;
            }

            for (int i = targetList.Count - 1; i >= 0; i--)
            {
                PathStrokeState item = targetList[i];
                if (item != null && patch.DeletePathIds.Contains(item.StrokeId))
                {
                    targetList.RemoveAt(i);
                }
            }

            for (int i = 0; i < patch.UpsertPaths.Count; i++)
            {
                PathStrokeState incoming = patch.UpsertPaths[i];
                if (incoming == null)
                {
                    continue;
                }

                int existingIndex = FindPathIndex(targetList, incoming.StrokeId);
                if (existingIndex >= 0)
                {
                    targetList[existingIndex] = ClonePathState(incoming);
                }
                else
                {
                    targetList.Add(ClonePathState(incoming));
                }
            }
        }

        private int FindPlacedObjectIndex(List<PlacedObjectState> targetList, string id)
        {
            for (int i = 0; i < targetList.Count; i++)
            {
                if (targetList[i] != null && targetList[i].ObjectId == id)
                {
                    return i;
                }
            }

            return -1;
        }

        private int FindWallIndex(List<WallSegmentState> targetList, string id)
        {
            for (int i = 0; i < targetList.Count; i++)
            {
                if (targetList[i] != null && targetList[i].SegmentId == id)
                {
                    return i;
                }
            }

            return -1;
        }

        private int FindPathIndex(List<PathStrokeState> targetList, string id)
        {
            for (int i = 0; i < targetList.Count; i++)
            {
                if (targetList[i] != null && targetList[i].StrokeId == id)
                {
                    return i;
                }
            }

            return -1;
        }

        private PlacedObjectState ClonePlacedObjectState(PlacedObjectState source)
        {
            return new PlacedObjectState
            {
                ObjectId = source.ObjectId,
                DefinitionId = source.DefinitionId,
                OriginCell = source.OriginCell,
                RotationSteps = source.RotationSteps,
                RotationY = source.RotationY,
                UsesGridPlacement = source.UsesGridPlacement,
                BaseY = source.BaseY,
                WorldPosition = source.WorldPosition
            };
        }

        private WallSegmentState CloneWallState(WallSegmentState source)
        {
            return new WallSegmentState
            {
                SegmentId = source.SegmentId,
                Edge = source.Edge,
                WallDefinitionId = source.WallDefinitionId,
                OpeningDefinitionId = source.OpeningDefinitionId
            };
        }

        private PathStrokeState ClonePathState(PathStrokeState source)
        {
            PathStrokeState clone = new PathStrokeState
            {
                StrokeId = source.StrokeId,
                DefinitionId = source.DefinitionId,
                Width = source.Width
            };
            if (source.ControlPoints != null)
            {
                foreach (var p in source.ControlPoints) clone.ControlPoints.Add(p);
            }
            return clone;
        }
    }
}
