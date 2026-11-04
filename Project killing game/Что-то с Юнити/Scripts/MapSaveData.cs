// ОБНОВЛЕНО для этажей: у стены появилось поле level (старые сейвы = этаж 0).
// ЗАМЕНЯЕТ Assets/Scripts/MapSaveData.cs.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    [Serializable]
    public class MapSaveData
    {
        public string worldId;
        public int buildVersion;
        public int runtimeVersion;
        public List<PlacedObjectSaveData> placedObjects = new List<PlacedObjectSaveData>();
        public List<WallSegmentSaveData> walls = new List<WallSegmentSaveData>();
        public List<PathStrokeSaveData> pathStrokes = new List<PathStrokeSaveData>();
        public SerializableVector3 explorerPosition;
        public float explorerYaw;
    }

    [Serializable]
    public class PlacedObjectSaveData
    {
        public string objectId;
        public string definitionId;
        public int originX;
        public int originY;
        public int rotationSteps;
        public float rotationY;
        public bool useGridPlacement = true;
        public float baseY;
        public SerializableVector3 worldPosition;
    }

    [Serializable]
    public class WallSegmentSaveData
    {
        public string segmentId;
        public int x;
        public int y;
        public int orientation;
        public int level; // этаж; в старых сейвах поля нет => 0
        public string wallDefinitionId;
        public string openingDefinitionId;
    }

    [Serializable]
    public class PathStrokeSaveData
    {
        public string strokeId;
        public string definitionId;
        public float width;
        public List<SerializableVector3> controlPoints = new List<SerializableVector3>();
    }

    [Serializable]
    public struct SerializableVector3
    {
        public float x;
        public float y;
        public float z;

        public SerializableVector3(Vector3 value)
        {
            x = value.x;
            y = value.y;
            z = value.z;
        }

        public Vector3 ToVector3()
        {
            return new Vector3(x, y, z);
        }
    }
}
