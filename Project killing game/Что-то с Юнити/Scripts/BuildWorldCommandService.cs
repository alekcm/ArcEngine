// ОБНОВЛЕНО для этажей. ЗАМЕНЯЕТ Assets/Scripts/BuildWorldCommandService.cs.
using System.Collections.Generic;
using UnityEngine;
using Unity.Netcode;
using System.Threading.Tasks;

namespace MapEditorPrototype
{
    public class BuildWorldCommandService
    {
        private readonly GridBuildingSystem gridBuildingSystem;
        private readonly WallSystem wallSystem;
        private readonly PathSystem pathSystem;
        private readonly MapSaveSystem mapSaveSystem;
        private readonly EditorUndoRedoSystem undoRedoSystem;

        public bool SuppressBuildVersionTracking { get; set; }

        public BuildWorldCommandService(GridBuildingSystem gb, WallSystem ws, PathSystem ps, MapSaveSystem ms, EditorUndoRedoSystem ur)
        {
            this.gridBuildingSystem = gb;
            this.wallSystem = ws;
            this.pathSystem = ps;
            this.mapSaveSystem = ms;
            this.undoRedoSystem = ur;
        }

        public void SaveWorld() { mapSaveSystem?.SaveDefault(); }
        public void TouchBuildVersion() { if (!SuppressBuildVersionTracking) mapSaveSystem?.IncrementBuildVersion(); }

        public async void LoadWorld()
        {
            mapSaveSystem?.LoadDefault();
            await Task.Delay(200);
            if (NetworkManager.Singleton?.IsServer == true)
            {
                var router = Object.FindObjectOfType<WorldReplicationMessageRouter>();
                router?.BroadcastCurrentWorldToAll();
            }
        }

        public bool TryPaintRoomBatch(WallDefinition wallDef, BuildingDefinition floorDef, List<WallEdge> wallEdges, List<Vector2Int> floorCells)
        {
            if (wallSystem == null || gridBuildingSystem == null) return false;

            WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };

            // Стены
            foreach (var edge in wallEdges) {
                if (!wallSystem.CanPlaceWall(wallDef, edge)) continue;
                WallSegment s = wallSystem.PlaceWall(wallDef, edge);
                if (s != null) {
                    fwd.UpsertWalls.Add(s.GetState());
                    bwd.DeleteWallIds.Add(s.SegmentId);
                }
            }

            // Пол
            foreach (var cell in floorCells) {
                float floorBaseY = gridBuildingSystem.GridOrigin.y + FloorContext.ActiveFloorY;
                if (!gridBuildingSystem.CanPlace(floorDef, cell, 0, floorBaseY)) continue;
                PlacedObject obj = gridBuildingSystem.Place(floorDef, cell, 0, floorBaseY, 0f);
                if (obj != null) {
                    fwd.UpsertPlacedObjects.Add(obj.GetState());
                    bwd.DeletePlacedObjectIds.Add(obj.ObjectId);
                }
            }

            if (fwd.HasAnyChanges) undoRedoSystem?.PushAction(fwd, bwd);
            TouchBuildVersion();
            return true;
        }

        public PlacedObject PlaceGridObject(BuildingDefinition definition, Vector2Int originCell, int rotationSteps, float baseY, float rotationY, bool recordUndo)
        {
            PlacedObject result = gridBuildingSystem.Place(definition, originCell, rotationSteps, baseY, rotationY);
            if (result != null) {
                if (recordUndo) RecordAddObject(result);
                TouchBuildVersion();
            }
            return result;
        }

        public bool TryPaintGridCell(BuildingDefinition definition, Vector2Int cell, int rotationSteps, float baseY, float rotationY)
        {
            if (!gridBuildingSystem.CanPlace(definition, cell, rotationSteps, baseY)) return false;
            PlacedObject result = gridBuildingSystem.Place(definition, cell, rotationSteps, baseY, rotationY);
            if (result != null) { RecordAddObject(result); TouchBuildVersion(); return true; }
            return false;
        }

        public bool TryPaintObjectBatch(BuildingDefinition definition, List<Vector2Int> cells, int rotationSteps, float baseY, float yRotation)
        {
            WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            foreach (var cell in cells) {
                if (!gridBuildingSystem.CanPlace(definition, cell, rotationSteps, baseY)) continue;
                PlacedObject obj = gridBuildingSystem.Place(definition, cell, rotationSteps, baseY, yRotation);
                if (obj != null) { fwd.UpsertPlacedObjects.Add(obj.GetState()); bwd.DeletePlacedObjectIds.Add(obj.ObjectId); }
            }
            if (fwd.HasAnyChanges) undoRedoSystem?.PushAction(fwd, bwd);
            TouchBuildVersion();
            return true;
        }

        public bool PlaceWall(WallDefinition definition, WallEdge edge, bool recordUndo)
        {
            WallSegment result = wallSystem.PlaceWall(definition, edge);
            if (result != null) { if (recordUndo) RecordAddWall(result); TouchBuildVersion(); return true; }
            return false;
        }

        public bool TryPaintWallEdge(WallDefinition definition, WallEdge edge) { return PlaceWall(definition, edge, true); }

        public bool TryPaintWallBatch(WallDefinition definition, List<WallEdge> edges)
        {
            WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            foreach (var edge in edges) {
                if (!wallSystem.CanPlaceWall(definition, edge)) continue;
                WallSegment s = wallSystem.PlaceWall(definition, edge);
                if (s != null) { fwd.UpsertWalls.Add(s.GetState()); bwd.DeleteWallIds.Add(s.SegmentId); }
            }
            if (fwd.HasAnyChanges) undoRedoSystem?.PushAction(fwd, bwd);
            TouchBuildVersion();
            return true;
        }

        public bool PlaceOpening(WallOpeningDefinition definition, WallEdge edge, bool recordUndo)
        {
            WallSegment sBefore = wallSystem.GetSegment(edge);
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            if (sBefore != null) bwd.UpsertWalls.Add(sBefore.GetState());
            if (wallSystem.PlaceOpening(definition, edge)) {
                if (recordUndo) { WallSegment sAfter = wallSystem.GetSegment(edge); WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId }; fwd.UpsertWalls.Add(sAfter.GetState()); undoRedoSystem?.PushAction(fwd, bwd); }
                TouchBuildVersion(); return true;
            }
            return false;
        }

        public bool RemoveWallAtEdge(WallEdge edge, bool recordUndo)
        {
            WallSegment sBefore = wallSystem.GetSegment(edge);
            if (sBefore == null) return false;
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            bwd.UpsertWalls.Add(sBefore.GetState());
            if (wallSystem.RemoveAtEdge(edge)) {
                if (recordUndo) { WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId }; fwd.DeleteWallIds.Add(sBefore.SegmentId); undoRedoSystem?.PushAction(fwd, bwd); }
                TouchBuildVersion(); return true;
            }
            return false;
        }

        public bool DeletePlacedObject(PlacedObject obj, bool recordUndo)
        {
            if (obj == null) return false;
            if (recordUndo) RecordDeleteObject(obj);
            gridBuildingSystem.Remove(obj);
            TouchBuildVersion();
            return true;
        }

        public PathStroke CreatePath(PathDefinition definition, IReadOnlyList<Vector3> points, float width, bool recordUndo)
        {
            PathStroke stroke = pathSystem?.CreateStroke(definition, points, width);
            if (stroke != null) {
                if (recordUndo) {
                    WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                    fwd.UpsertPaths.Add(new PathStrokeState { StrokeId = stroke.StrokeId, DefinitionId = stroke.Definition.id, Width = stroke.Width, ControlPoints = new List<Vector3>(stroke.ControlPoints) });
                    WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                    bwd.DeletePathIds.Add(stroke.StrokeId);
                    undoRedoSystem?.PushAction(fwd, bwd);
                }
                TouchBuildVersion();
            }
            return stroke;
        }

        public bool DeletePath(PathStroke stroke, bool recordUndo)
        {
            if (pathSystem == null || stroke == null) return false;
            if (recordUndo) {
                WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                fwd.DeletePathIds.Add(stroke.StrokeId);
                WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                bwd.UpsertPaths.Add(new PathStrokeState { StrokeId = stroke.StrokeId, DefinitionId = stroke.Definition.id, Width = stroke.Width, ControlPoints = new List<Vector3>(stroke.ControlPoints) });
                undoRedoSystem?.PushAction(fwd, bwd);
            }
            pathSystem.RemoveStroke(stroke);
            TouchBuildVersion();
            return true;
        }

        public bool RemovePathPoint(PathStroke stroke, int index, bool recordUndo)
        {
            if (stroke == null) return false;
            if (recordUndo) {
                WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                bwd.UpsertPaths.Add(new PathStrokeState { StrokeId = stroke.StrokeId, DefinitionId = stroke.Definition.id, Width = stroke.Width, ControlPoints = new List<Vector3>(stroke.ControlPoints) });
                if (stroke.RemoveControlPointAt(index)) {
                    WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                    fwd.UpsertPaths.Add(new PathStrokeState { StrokeId = stroke.StrokeId, DefinitionId = stroke.Definition.id, Width = stroke.Width, ControlPoints = new List<Vector3>(stroke.ControlPoints) });
                    undoRedoSystem?.PushAction(fwd, bwd);
                } else return false;
            } else if (!stroke.RemoveControlPointAt(index)) return false;
            TouchBuildVersion();
            return true;
        }

        public bool UpdatePathWidth(PathStroke stroke, float width, bool recordUndo)
        {
            if (stroke == null) return false;
            if (recordUndo) {
                WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                bwd.UpsertPaths.Add(new PathStrokeState { StrokeId = stroke.StrokeId, DefinitionId = stroke.Definition.id, Width = stroke.Width, ControlPoints = new List<Vector3>(stroke.ControlPoints) });
                stroke.SetWidth(width);
                WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
                fwd.UpsertPaths.Add(new PathStrokeState { StrokeId = stroke.StrokeId, DefinitionId = stroke.Definition.id, Width = stroke.Width, ControlPoints = new List<Vector3>(stroke.ControlPoints) });
                undoRedoSystem?.PushAction(fwd, bwd);
            } else stroke.SetWidth(width);
            TouchBuildVersion();
            return true;
        }

        private void RecordAddObject(PlacedObject obj)
        {
            WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            fwd.UpsertPlacedObjects.Add(obj.GetState());
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            bwd.DeletePlacedObjectIds.Add(obj.ObjectId);
            undoRedoSystem?.PushAction(fwd, bwd);
        }

        private void RecordDeleteObject(PlacedObject obj)
        {
            WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            fwd.DeletePlacedObjectIds.Add(obj.ObjectId);
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            bwd.UpsertPlacedObjects.Add(obj.GetState());
            undoRedoSystem?.PushAction(fwd, bwd);
        }

        private void RecordAddWall(WallSegment s)
        {
            WorldPatch fwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            fwd.UpsertWalls.Add(s.GetState());
            WorldPatch bwd = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId };
            bwd.DeleteWallIds.Add(s.SegmentId);
            undoRedoSystem?.PushAction(fwd, bwd);
        }
    }
}
