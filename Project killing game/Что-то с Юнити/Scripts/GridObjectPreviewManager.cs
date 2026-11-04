using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class GridObjectPreviewManager : MonoBehaviour
    {
        [SerializeField] private Color validColor = new Color(0.35f, 1f, 0.45f, 0.5f);
        [SerializeField] private Color invalidColor = new Color(1f, 0.35f, 0.35f, 0.5f);
        
        private GameObject previewPrefab;
        private List<GameObject> pool = new List<GameObject>();
        private int activeCount = 0;

        public void SetPrefab(GameObject prefab)
        {
            if (previewPrefab != prefab)
            {
                previewPrefab = prefab;
                foreach (var obj in pool) if (obj != null) Destroy(obj);
                pool.Clear();
            }
        }

        public void UpdatePreview(GridBuildingSystem gridSystem, BuildingDefinition definition, List<Vector2Int> cells, int rotationSteps, float baseY)
        {
            HideAll();
            if (gridSystem == null || definition == null || cells == null || previewPrefab == null) return;

            Vector2Int rotatedFootprint = GridBuildingSystem.RotateFootprint(definition.Footprint, rotationSteps);
            float yRotation = rotationSteps * 90f;

            foreach (var cell in cells)
            {
                GameObject instance = GetOrCreateInstance();
                instance.SetActive(true);
                
                Vector3 pos = gridSystem.GetPlacementPosition(cell, rotatedFootprint, definition.worldOffset, definition.layer, baseY);
                Quaternion rot = Quaternion.Euler(0f, yRotation, 0f);
                instance.transform.SetPositionAndRotation(pos, rot);
                
                bool canPlace = gridSystem.CanPlace(definition, cell, rotationSteps, baseY);
                ApplyColor(instance, canPlace ? validColor : invalidColor);
            }
        }

        public void HideAll()
        {
            activeCount = 0;
            for (int i = 0; i < pool.Count; i++)
            {
                if (pool[i] != null) pool[i].SetActive(false);
            }
        }

        private GameObject GetOrCreateInstance()
        {
            if (activeCount < pool.Count)
            {
                return pool[activeCount++];
            }

            GameObject instance = Instantiate(previewPrefab, transform);
            instance.name = "GridObjectPreview_" + pool.Count;
            
            // Disable components
            foreach (var c in instance.GetComponentsInChildren<Collider>(true)) c.enabled = false;
            foreach (var r in instance.GetComponentsInChildren<Rigidbody>(true)) { r.isKinematic = true; r.detectCollisions = false; }
            foreach (var m in instance.GetComponentsInChildren<MonoBehaviour>(true)) m.enabled = false;
            
            pool.Add(instance);
            activeCount++;
            return instance;
        }

        private void ApplyColor(GameObject go, Color color)
        {
            foreach (var renderer in go.GetComponentsInChildren<Renderer>(true))
            {
                MaterialPropertyBlock block = new MaterialPropertyBlock();
                renderer.GetPropertyBlock(block);
                block.SetColor("_BaseColor", color);
                block.SetColor("_Color", color);
                renderer.SetPropertyBlock(block);
            }
        }
    }
}
