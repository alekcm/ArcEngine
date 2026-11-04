using System;
using UnityEngine;

namespace MapEditorPrototype
{
    public class WorldStateCaptureService
    {
        private readonly GridBuildingSystem gridBuildingSystem;
        private readonly WallSystem wallSystem;
        private readonly PathSystem pathSystem;

        public WorldStateCaptureService(GridBuildingSystem gb, WallSystem ws, PathSystem ps, ExplorerController ec)
        {
            this.gridBuildingSystem = gb;
            this.wallSystem = ws;
            this.pathSystem = ps;
        }

        public WorldState Capture(string worldId, int buildVersion, int runtimeVersion)
        {
            WorldState worldState = new WorldState { WorldId = worldId };
            worldState.Versions.BuildVersion = buildVersion;
            worldState.Versions.RuntimeVersion = runtimeVersion;

            if (gridBuildingSystem != null)
            {
                var objs = gridBuildingSystem.PlacedObjects;
                for (int i = 0; i < objs.Count; i++)
                {
                    var p = objs[i];
                    if (p != null) worldState.Build.PlacedObjects.Add(p.GetState());
                }
            }

            if (wallSystem != null)
            {
                foreach (var s in wallSystem.Segments)
                {
                    if (s != null) worldState.Build.Walls.Add(s.GetState());
                }
            }

            if (pathSystem != null)
            {
                var strokes = pathSystem.Strokes;
                for (int i = 0; i < strokes.Count; i++)
                {
                    var stroke = strokes[i];
                    if (stroke == null) continue;
                    worldState.Build.PathStrokes.Add(new PathStrokeState
                    {
                        StrokeId = stroke.StrokeId,
                        DefinitionId = stroke.Definition != null ? stroke.Definition.id : null,
                        Width = stroke.Width,
                        ControlPoints = new System.Collections.Generic.List<Vector3>(stroke.ControlPoints)
                    });
                }
            }

            return worldState;
        }
    }
}
