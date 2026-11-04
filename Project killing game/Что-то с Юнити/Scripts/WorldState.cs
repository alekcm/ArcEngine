using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class WorldState
    {
        public string WorldId;
        public BuildWorldState Build = new BuildWorldState();
        public RuntimeWorldState Runtime = new RuntimeWorldState();
        public WorldVersionInfo Versions = new WorldVersionInfo();
    }

    public class BuildWorldState
    {
        public List<PlacedObjectState> PlacedObjects = new List<PlacedObjectState>();
        public List<WallSegmentState> Walls = new List<WallSegmentState>();
        public List<PathStrokeState> PathStrokes = new List<PathStrokeState>();
    }

    public class RuntimeWorldState
    {
        public Vector3 ExplorerPosition;
        public float ExplorerYaw;
    }

    public class WorldVersionInfo
    {
        public int BuildVersion;
        public int RuntimeVersion;
    }

    public class PlacedObjectState
    {
        public string ObjectId;
        public string DefinitionId;
        public Vector2Int OriginCell;
        public int RotationSteps;
        public float RotationY;
        public bool UsesGridPlacement;
        public float BaseY;
        public Vector3 WorldPosition;
    }

    public class WallSegmentState
    {
        public string SegmentId;
        public WallEdge Edge;
        public string WallDefinitionId;
        public string OpeningDefinitionId;
    }

    public class PathStrokeState
    {
        public string StrokeId;
        public string DefinitionId;
        public float Width;
        public List<Vector3> ControlPoints = new List<Vector3>();
    }
}
