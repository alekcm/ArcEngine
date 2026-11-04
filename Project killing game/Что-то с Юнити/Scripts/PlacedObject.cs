using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class PlacedObject : MonoBehaviour
    {
        [SerializeField] private string objectId;
        [SerializeField] private BuildingDefinition definition;
        [SerializeField] private Vector2Int originCell;
        [SerializeField] private int rotationSteps;
        [SerializeField] private float rotationY;
        [SerializeField] private List<Vector2Int> occupiedCells = new List<Vector2Int>();
        [SerializeField] private bool selected;
        [SerializeField] private bool usesGridPlacement = true;
        [SerializeField] private float baseY;

        private Renderer[] cachedRenderers;
        private Collider[] cachedColliders;
        private PlacedObjectState cachedState;
        private bool isStateDirty = true;

        public string ObjectId => objectId;
        public BuildingDefinition Definition => definition;
        public Vector2Int OriginCell => originCell;
        public int RotationSteps => rotationSteps;
        public float RotationY => rotationY;
        public IReadOnlyList<Vector2Int> OccupiedCells => occupiedCells;
        public BuildLayer Layer => definition != null ? definition.layer : BuildLayer.Furniture;
        public bool IsSelected => selected;
        public bool UsesGridPlacement => usesGridPlacement;
        public float BaseY => baseY;

        public PlacedObjectState GetState()
        {
            if (isStateDirty || cachedState == null)
            {
                cachedState = new PlacedObjectState
                {
                    ObjectId = objectId,
                    DefinitionId = definition?.id,
                    OriginCell = originCell,
                    RotationSteps = rotationSteps,
                    RotationY = rotationY,
                    UsesGridPlacement = usesGridPlacement,
                    BaseY = baseY,
                    WorldPosition = transform.position
                };
                isStateDirty = false;
            }
            return cachedState;
        }

        private void Awake()
        {
            CacheComponents();
        }

        public void Initialize(BuildingDefinition def, Vector2Int cell, int rotS, float rotY, List<Vector2Int> occ, bool usesG, float bY, string id = null)
        {
            objectId = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id;
            definition = def;
            originCell = cell;
            rotationSteps = rotS;
            rotationY = rotY;
            occupiedCells = new List<Vector2Int>(occ);
            usesGridPlacement = usesG;
            baseY = bY;
            isStateDirty = true;
            CacheComponents();
            SetSelected(false);
        }

        public void UpdatePlacementData(Vector2Int cell, int rotS, float rotY, List<Vector2Int> occ, bool usesG, float bY)
        {
            originCell = cell; rotationSteps = rotS; rotationY = rotY; occupiedCells = new List<Vector2Int>(occ); usesGridPlacement = usesG; baseY = bY;
            isStateDirty = true;
        }

        public float GetTopY() => GetWorldBounds().max.y;

        public Bounds GetWorldBounds()
        {
            if (cachedColliders == null || cachedColliders.Length == 0) CacheComponents();
            bool hasBounds = false;
            Bounds bounds = new Bounds(transform.position, Vector3.zero);
            foreach (var c in cachedColliders) {
                if (c == null || !c.enabled) continue;
                if (!hasBounds) { bounds = c.bounds; hasBounds = true; } else bounds.Encapsulate(c.bounds);
            }
            if (hasBounds) return bounds;
            foreach (var r in cachedRenderers) {
                if (r == null) continue;
                if (!hasBounds) { bounds = r.bounds; hasBounds = true; } else bounds.Encapsulate(r.bounds);
            }
            return hasBounds ? bounds : new Bounds(transform.position, Vector3.one * 0.01f);
        }

        public void SetSelected(bool value)
        {
            selected = value;
            if (cachedRenderers == null) CacheComponents();
            foreach (var r in cachedRenderers) {
                if (r == null) continue;
                MaterialPropertyBlock block = new MaterialPropertyBlock();
                r.GetPropertyBlock(block);
                if (value) {
                    if (RendererSupportsProperty(r, "_EmissionColor")) block.SetColor("_EmissionColor", new Color(0.9f, 0.7f, 0.1f, 1f));
                } else block.Clear();
                r.SetPropertyBlock(block);
            }
        }

        private void CacheComponents() {
            cachedRenderers = GetComponentsInChildren<Renderer>(true);
            cachedColliders = GetComponentsInChildren<Collider>(true);
        }

        private bool RendererSupportsProperty(Renderer r, string name) {
            foreach (var m in r.sharedMaterials) if (m != null && m.HasProperty(name)) return true;
            return false;
        }
    }
}
