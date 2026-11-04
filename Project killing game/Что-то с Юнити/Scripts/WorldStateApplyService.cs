using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class WorldStateApplyService
    {
        private readonly GridBuildingSystem gridBuildingSystem;
        private readonly BuildCatalog buildCatalog;
        private readonly WallSystem wallSystem;
        private readonly WallCatalog wallCatalog;
        private readonly PathSystem pathSystem;
        private readonly PathCatalog pathCatalog;
        private readonly ExplorerController explorerController;
        private readonly BuildSystem buildSystem;

        public WorldStateApplyService(
            GridBuildingSystem gridBuildingSystem,
            BuildCatalog buildCatalog,
            WallSystem wallSystem,
            WallCatalog wallCatalog,
            PathSystem pathSystem,
            PathCatalog pathCatalog,
            ExplorerController explorerController,
            BuildSystem buildSystem)
        {
            this.gridBuildingSystem = gridBuildingSystem;
            this.buildCatalog = buildCatalog;
            this.wallSystem = wallSystem;
            this.wallCatalog = wallCatalog;
            this.pathSystem = pathSystem;
            this.pathCatalog = pathCatalog;
            this.explorerController = explorerController;
            this.buildSystem = buildSystem;
        }

        public void Apply(WorldState worldState)
        {
            if (worldState == null) return;
            if (buildSystem != null) buildSystem.ResetTransientEditorState();
            if (gridBuildingSystem != null) gridBuildingSystem.ClearAll();
            if (wallSystem != null) wallSystem.ClearAll();
            if (pathSystem != null) pathSystem.ClearAll();

            ApplyPlacedObjects(worldState.Build.PlacedObjects);
            ApplyWalls(worldState.Build.Walls);
            ApplyPaths(worldState.Build.PathStrokes);
            ApplyRuntime(worldState);
        }

        public void ApplyIncremental(WorldPatch patch)
        {
            if (patch == null) return;
            // 1. Delete
            // (Note: gridBuildingSystem removal by ID is not yet implemented in basic scripts, 
            // so we'd need to find the object by ID on the scene)
            foreach (var id in patch.DeletePlacedObjectIds) {
                foreach(var obj in Object.FindObjectsOfType<PlacedObject>()) {
                    if (obj.ObjectId == id) { gridBuildingSystem?.Remove(obj); break; }
                }
            }
            foreach (var id in patch.DeleteWallIds) {
                foreach(var seg in Object.FindObjectsOfType<WallSegment>()) {
                    if (seg.SegmentId == id) { wallSystem?.RemoveAtEdge(seg.Edge); break; }
                }
            }
            foreach (var id in patch.DeletePathIds) {
                foreach(var path in Object.FindObjectsOfType<PathStroke>()) {
                    if (path.StrokeId == id) { pathSystem?.RemoveStroke(path); break; }
                }
            }

            // 2. Upsert
            ApplyPlacedObjects(patch.UpsertPlacedObjects);
            ApplyWalls(patch.UpsertWalls);
            ApplyPaths(patch.UpsertPaths);
        }

        private void ApplyPlacedObjects(List<PlacedObjectState> objects)
        {
            if (gridBuildingSystem == null || buildCatalog == null) return;
            foreach (var item in objects)
            {
                if (item == null) continue;
                BuildingDefinition def = buildCatalog.FindById(item.DefinitionId);
                if (def == null) continue;
                if (item.UsesGridPlacement) gridBuildingSystem.Place(def, item.OriginCell, item.RotationSteps, item.BaseY, item.RotationY, item.ObjectId);
                else gridBuildingSystem.PlaceFree(def, item.WorldPosition, item.RotationSteps, item.RotationY, item.ObjectId);
            }
        }

        private void ApplyWalls(List<WallSegmentState> walls)
        {
            if (wallSystem == null || wallCatalog == null) return;
            foreach (var item in walls)
            {
                if (item == null) continue;
                WallDefinition wallDef = wallCatalog.FindWallById(item.WallDefinitionId);
                if (wallDef != null) wallSystem.PlaceWall(wallDef, item.Edge, item.SegmentId);
                if (!string.IsNullOrWhiteSpace(item.OpeningDefinitionId))
                {
                    WallOpeningDefinition openDef = wallCatalog.FindOpeningById(item.OpeningDefinitionId);
                    if (openDef != null) wallSystem.PlaceOpening(openDef, item.Edge);
                }
            }
        }

        private void ApplyPaths(List<PathStrokeState> strokes)
        {
            if (pathSystem == null || pathCatalog == null) return;
            foreach (var item in strokes)
            {
                if (item == null) continue;
                PathDefinition def = pathCatalog.FindById(item.DefinitionId);
                if (def != null) pathSystem.CreateStroke(def, item.ControlPoints, item.Width, item.StrokeId);
            }
        }

        private void ApplyRuntime(WorldState worldState)
        {
            if (explorerController != null && worldState.Runtime != null)
                explorerController.TeleportTo(worldState.Runtime.ExplorerPosition, Quaternion.Euler(0f, worldState.Runtime.ExplorerYaw, 0f));
        }
    }
}
