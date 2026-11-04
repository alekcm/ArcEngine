// ОБНОВЛЕНО для этажей. ЗАМЕНЯЕТ Assets/Scripts/WorldNetworkDtos.cs.
using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    [Serializable]
    public class WorldSnapshotDto
    {
        public string worldId;
        public int buildVersion;
        public int runtimeVersion;
        public List<PlacedObjectDto> placedObjects = new List<PlacedObjectDto>();
        public List<WallSegmentDto> walls = new List<WallSegmentDto>();
        public List<PathStrokeDto> pathStrokes = new List<PathStrokeDto>();
        public Vector3Dto explorerPosition;
        public float explorerYaw;
    }

    [Serializable]
    public class WorldPatchDto
    {
        public string worldId;
        public int baseBuildVersion;
        public int newBuildVersion;

        public List<PlacedObjectDto> upsertPlacedObjects = new List<PlacedObjectDto>();
        public List<string> deletePlacedObjectIds = new List<string>();

        public List<WallSegmentDto> upsertWalls = new List<WallSegmentDto>();
        public List<string> deleteWallIds = new List<string>();

        public List<PathStrokeDto> upsertPaths = new List<PathStrokeDto>();
        public List<string> deletePathIds = new List<string>();
    }

    [Serializable]
    public class EditApplyRequestDto
    {
        public string worldId;
        public string authorPlayerId;
        public WorldPatchDto patch;
    }

    [Serializable]
    public class EditApplyResultDto
    {
        public bool accepted;
        public string reason;
        public WorldPatchDto appliedPatch;
    }

    [Serializable]
    public class PlacedObjectDto
    {
        public string objectId;
        public string definitionId;
        public int originX;
        public int originY;
        public int rotationSteps;
        public float rotationY;
        public bool usesGridPlacement;
        public float baseY;
        public Vector3Dto worldPosition;
    }

    [Serializable]
    public class WallSegmentDto
    {
        public string segmentId;
        public int x;
        public int y;
        public int orientation;
        public int level;
        public string wallDefinitionId;
        public string openingDefinitionId;
    }

    [Serializable]
    public class PathStrokeDto
    {
        public string strokeId;
        public string definitionId;
        public float width;
        public List<Vector3Dto> controlPoints = new List<Vector3Dto>();
    }

    [Serializable]
    public struct Vector3Dto
    {
        public float x;
        public float y;
        public float z;

        public Vector3Dto(float x, float y, float z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }
}
