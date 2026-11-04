using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class GridBuildingSystem : MonoBehaviour
    {
        [SerializeField] private float cellSize = 1f;
        [SerializeField] private float decorCellSize = 0.2f;
        [SerializeField] private Vector3 gridOrigin = Vector3.zero;
        [SerializeField] private Transform placedObjectsRoot;

        private readonly Dictionary<BuildLayer, Dictionary<PlacementCellKey, PlacedObject>> occupiedCellsByLayer = new Dictionary<BuildLayer, Dictionary<PlacementCellKey, PlacedObject>>();
        private readonly List<PlacedObject> placedObjects = new List<PlacedObject>();
        private static readonly BuildLayer[] SelectionPriority = { BuildLayer.Decor, BuildLayer.Furniture, BuildLayer.Floor };

        public event Action Changed;

        public float CellSize => cellSize;
        public float DecorCellSize => decorCellSize;
        public Vector3 GridOrigin => gridOrigin;
        public IReadOnlyList<PlacedObject> PlacedObjects => placedObjects;

        private void Awake()
        {
            EnsureLayerDictionaries();
        }

        public float GetCellSize(BuildLayer layer)
        {
            return layer == BuildLayer.Decor ? Mathf.Max(0.01f, decorCellSize) : Mathf.Max(0.01f, cellSize);
        }

        public Vector2Int WorldToCell(Vector3 worldPosition, BuildLayer layer)
        {
            float currentCellSize = GetCellSize(layer);
            Vector3 local = worldPosition - gridOrigin;
            int x = Mathf.FloorToInt(local.x / currentCellSize);
            int z = Mathf.FloorToInt(local.z / currentCellSize);
            return new Vector2Int(x, z);
        }

        public Vector2Int WorldToCell(Vector3 worldPosition)
        {
            return WorldToCell(worldPosition, BuildLayer.Furniture);
        }

        public Vector3 CellToWorld(Vector2Int cell, BuildLayer layer, float baseY)
        {
            float currentCellSize = GetCellSize(layer);
            return new Vector3(gridOrigin.x + cell.x * currentCellSize, baseY, gridOrigin.z + cell.y * currentCellSize);
        }

        public static Vector2Int RotateFootprint(Vector2Int footprint, int rotationSteps)
        {
            rotationSteps = NormalizeRotationSteps(rotationSteps);
            return rotationSteps % 2 == 0 ? footprint : new Vector2Int(footprint.y, footprint.x);
        }

        public Vector3 GetPlacementPosition(Vector2Int originCell, Vector2Int rotatedFootprint, Vector3 worldOffset, BuildLayer layer, float baseY)
        {
            float currentCellSize = GetCellSize(layer);
            Vector3 minCorner = CellToWorld(originCell, layer, baseY);
            Vector3 centerOffset = new Vector3(rotatedFootprint.x * currentCellSize, 0f, rotatedFootprint.y * currentCellSize) * 0.5f;
            return minCorner + centerOffset + worldOffset;
        }

        public bool CanPlace(BuildingDefinition definition, Vector2Int originCell, int rotationSteps, float baseY, PlacedObject ignoredObject = null)
        {
            if (definition == null || definition.prefab == null)
            {
                return false;
            }

            EnsureLayerDictionaries();

            Vector2Int rotatedFootprint = RotateFootprint(definition.Footprint, rotationSteps);
            List<PlacementCellKey> coveredKeys = GetCoveredCellKeys(originCell, rotatedFootprint, definition.layer, baseY);
            Dictionary<PlacementCellKey, PlacedObject> layerMap = occupiedCellsByLayer[definition.layer];

            for (int i = 0; i < coveredKeys.Count; i++)
            {
                PlacementCellKey key = coveredKeys[i];
                if (layerMap.TryGetValue(key, out PlacedObject existingObject) && existingObject != null && existingObject != ignoredObject)
                {
                    return false;
                }
            }

            return true;
        }

        public PlacedObject Place(BuildingDefinition definition, Vector2Int originCell, int rotationSteps, float baseY, float yRotation, string objectId = null)
        {
            if (!CanPlace(definition, originCell, rotationSteps, baseY))
            {
                return null;
            }

            Vector2Int rotatedFootprint = RotateFootprint(definition.Footprint, rotationSteps);
            List<Vector2Int> coveredCells = GetCoveredCells(originCell, rotatedFootprint);
            Vector3 worldPosition = GetPlacementPosition(originCell, rotatedFootprint, definition.worldOffset, definition.layer, baseY);
            Quaternion rotation = Quaternion.Euler(0f, yRotation, 0f);

            Transform parent = placedObjectsRoot != null ? placedObjectsRoot : transform;
            GameObject instance = Instantiate(definition.prefab, worldPosition, rotation, parent);
            instance.name = $"{definition.SafeDisplayName}_{originCell.x}_{originCell.y}";

            PlacedObject placedObject = instance.GetComponent<PlacedObject>();
            if (placedObject == null)
            {
                placedObject = instance.AddComponent<PlacedObject>();
            }

            placedObject.Initialize(definition, originCell, rotationSteps, yRotation, coveredCells, true, baseY, objectId);
            RegisterPlacedObject(placedObject);
            Changed?.Invoke();
            return placedObject;
        }

        public void PlaceBatch(BuildingDefinition definition, List<Vector2Int> cells, int rotationSteps, float baseY, float yRotation)
        {
            if (definition == null || cells == null || cells.Count == 0) return;

            foreach (var cell in cells)
            {
                if (!CanPlace(definition, cell, rotationSteps, baseY)) continue;

                Vector2Int rotatedFootprint = RotateFootprint(definition.Footprint, rotationSteps);
                List<Vector2Int> coveredCells = GetCoveredCells(cell, rotatedFootprint);
                Vector3 worldPosition = GetPlacementPosition(cell, rotatedFootprint, definition.worldOffset, definition.layer, baseY);
                Quaternion rotation = Quaternion.Euler(0f, yRotation, 0f);

                Transform parent = placedObjectsRoot != null ? placedObjectsRoot : transform;
                GameObject instance = Instantiate(definition.prefab, worldPosition, rotation, parent);
                
                PlacedObject placedObject = instance.GetComponent<PlacedObject>();
                if (placedObject == null) placedObject = instance.AddComponent<PlacedObject>();

                placedObject.Initialize(definition, cell, rotationSteps, yRotation, coveredCells, true, baseY, null);
                RegisterPlacedObject(placedObject);
            }

            Changed?.Invoke();
        }

        public PlacedObject PlaceFree(BuildingDefinition definition, Vector3 worldPosition, int rotationSteps, float yRotation, string objectId = null)
        {
            if (definition == null || definition.prefab == null)
            {
                return null;
            }

            Quaternion rotation = Quaternion.Euler(0f, yRotation, 0f);
            Transform parent = placedObjectsRoot != null ? placedObjectsRoot : transform;
            GameObject instance = Instantiate(definition.prefab, worldPosition, rotation, parent);
            instance.name = $"{definition.SafeDisplayName}_Free";

            PlacedObject placedObject = instance.GetComponent<PlacedObject>();
            if (placedObject == null)
            {
                placedObject = instance.AddComponent<PlacedObject>();
            }

            float baseY = worldPosition.y - definition.worldOffset.y;
            placedObject.Initialize(definition, WorldToCell(worldPosition, definition.layer), rotationSteps, yRotation, new List<Vector2Int>(), false, baseY, objectId);
            if (!placedObjects.Contains(placedObject))
            {
                placedObjects.Add(placedObject);
            }
            Changed?.Invoke();
            return placedObject;
        }

        public bool TryReposition(PlacedObject placedObject, Vector2Int originCell, int rotationSteps, float baseY, float yRotation)
        {
            if (placedObject == null || placedObject.Definition == null)
            {
                return false;
            }

            if (!CanPlace(placedObject.Definition, originCell, rotationSteps, baseY, placedObject))
            {
                return false;
            }

            UnregisterPlacedObject(placedObject);

            Vector2Int rotatedFootprint = RotateFootprint(placedObject.Definition.Footprint, rotationSteps);
            List<Vector2Int> coveredCells = GetCoveredCells(originCell, rotatedFootprint);
            Vector3 worldPosition = GetPlacementPosition(originCell, rotatedFootprint, placedObject.Definition.worldOffset, placedObject.Layer, baseY);
            Quaternion rotation = Quaternion.Euler(0f, yRotation, 0f);

            placedObject.transform.SetPositionAndRotation(worldPosition, rotation);
            placedObject.UpdatePlacementData(originCell, rotationSteps, yRotation, coveredCells, true, baseY);
            RegisterPlacedObject(placedObject);
            Changed?.Invoke();
            return true;
        }

        public bool TryRepositionFree(PlacedObject placedObject, Vector3 worldPosition, int rotationSteps, float yRotation)
        {
            if (placedObject == null || placedObject.Definition == null)
            {
                return false;
            }

            UnregisterPlacedObject(placedObject);
            Quaternion rotation = Quaternion.Euler(0f, yRotation, 0f);
            placedObject.transform.SetPositionAndRotation(worldPosition, rotation);
            placedObject.UpdatePlacementData(WorldToCell(worldPosition, placedObject.Layer), rotationSteps, yRotation, new List<Vector2Int>(), false, worldPosition.y - placedObject.Definition.worldOffset.y);
            RegisterPlacedObject(placedObject);
            Changed?.Invoke();
            return true;
        }

        public bool RemoveAtCell(Vector2Int cell, BuildLayer? layer = null)
        {
            PlacedObject placedObject = layer.HasValue ? GetPlacedObjectAtCell(cell, layer.Value) : GetTopPlacedObjectAtCell(cell);
            if (placedObject == null)
            {
                return false;
            }

            Remove(placedObject);
            return true;
        }

        public void Remove(PlacedObject placedObject)
        {
            RemoveInternal(placedObject, true);
        }

        public PlacedObject GetPlacedObjectAtCell(Vector2Int cell, BuildLayer layer)
        {
            EnsureLayerDictionaries();
            Dictionary<PlacementCellKey, PlacedObject> layerMap = occupiedCellsByLayer[layer];
            PlacedObject bestMatch = null;
            int bestHeight = int.MinValue;

            foreach (KeyValuePair<PlacementCellKey, PlacedObject> pair in layerMap)
            {
                if (pair.Key.x == cell.x && pair.Key.z == cell.y && pair.Key.heightLevel >= bestHeight)
                {
                    bestMatch = pair.Value;
                    bestHeight = pair.Key.heightLevel;
                }
            }

            return bestMatch;
        }

        public PlacedObject GetTopPlacedObjectAtCell(Vector2Int cell)
        {
            for (int i = 0; i < SelectionPriority.Length; i++)
            {
                PlacedObject placedObject = GetPlacedObjectAtCell(cell, SelectionPriority[i]);
                if (placedObject != null)
                {
                    return placedObject;
                }
            }

            return null;
        }

        public void ClearAll()
        {
            for (int i = placedObjects.Count - 1; i >= 0; i--)
            {
                PlacedObject placedObject = placedObjects[i];
                if (placedObject != null)
                {
                    Destroy(placedObject.gameObject);
                }
            }

            placedObjects.Clear();
            EnsureLayerDictionaries();
            foreach (Dictionary<PlacementCellKey, PlacedObject> layerMap in occupiedCellsByLayer.Values)
            {
                layerMap.Clear();
            }

            Changed?.Invoke();
        }

        public List<Vector2Int> GetCoveredCells(Vector2Int originCell, Vector2Int rotatedFootprint)
        {
            List<Vector2Int> cells = new List<Vector2Int>(rotatedFootprint.x * rotatedFootprint.y);
            for (int x = 0; x < rotatedFootprint.x; x++)
            {
                for (int z = 0; z < rotatedFootprint.y; z++)
                {
                    cells.Add(originCell + new Vector2Int(x, z));
                }
            }
            return cells;
        }

        private List<PlacementCellKey> GetCoveredCellKeys(Vector2Int originCell, Vector2Int rotatedFootprint, BuildLayer layer, float baseY)
        {
            List<PlacementCellKey> keys = new List<PlacementCellKey>(rotatedFootprint.x * rotatedFootprint.y);
            int heightLevel = GetHeightLevel(layer, baseY);
            for (int x = 0; x < rotatedFootprint.x; x++)
            {
                for (int z = 0; z < rotatedFootprint.y; z++)
                {
                    keys.Add(new PlacementCellKey(originCell.x + x, originCell.y + z, heightLevel));
                }
            }
            return keys;
        }

        private int GetHeightLevel(BuildLayer layer, float baseY)
        {
            float currentCellSize = GetCellSize(layer);
            return Mathf.RoundToInt((baseY - gridOrigin.y) / currentCellSize);
        }

        private void RegisterPlacedObject(PlacedObject placedObject)
        {
            EnsureLayerDictionaries();
            if (!placedObjects.Contains(placedObject))
            {
                placedObjects.Add(placedObject);
            }

            if (!placedObject.UsesGridPlacement)
            {
                return;
            }

            Dictionary<PlacementCellKey, PlacedObject> layerMap = occupiedCellsByLayer[placedObject.Layer];
            int heightLevel = GetHeightLevel(placedObject.Layer, placedObject.BaseY);
            for (int i = 0; i < placedObject.OccupiedCells.Count; i++)
            {
                Vector2Int cell = placedObject.OccupiedCells[i];
                layerMap[new PlacementCellKey(cell.x, cell.y, heightLevel)] = placedObject;
            }
        }

        private void UnregisterPlacedObject(PlacedObject placedObject)
        {
            if (placedObject == null)
            {
                return;
            }

            EnsureLayerDictionaries();

            if (placedObject.UsesGridPlacement)
            {
                Dictionary<PlacementCellKey, PlacedObject> layerMap = occupiedCellsByLayer[placedObject.Layer];
                int heightLevel = GetHeightLevel(placedObject.Layer, placedObject.BaseY);
                for (int i = 0; i < placedObject.OccupiedCells.Count; i++)
                {
                    Vector2Int cell = placedObject.OccupiedCells[i];
                    layerMap.Remove(new PlacementCellKey(cell.x, cell.y, heightLevel));
                }
            }
        }

        private void RemoveInternal(PlacedObject placedObject, bool notify)
        {
            if (placedObject == null)
            {
                return;
            }

            UnregisterPlacedObject(placedObject);
            placedObjects.Remove(placedObject);
            Destroy(placedObject.gameObject);

            if (notify)
            {
                Changed?.Invoke();
            }
        }

        private void EnsureLayerDictionaries()
        {
            Array layers = Enum.GetValues(typeof(BuildLayer));
            for (int i = 0; i < layers.Length; i++)
            {
                BuildLayer layer = (BuildLayer)layers.GetValue(i);
                if (!occupiedCellsByLayer.ContainsKey(layer))
                {
                    occupiedCellsByLayer[layer] = new Dictionary<PlacementCellKey, PlacedObject>();
                }
            }
        }

        private static int NormalizeRotationSteps(int rotationSteps)
        {
            return ((rotationSteps % 4) + 4) % 4;
        }
    }
}
