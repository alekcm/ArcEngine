using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class WallLinePreviewManager : MonoBehaviour
    {
        [SerializeField] private Color previewColor = new Color(0.1f, 1f, 0.2f, 0.7f);
        
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

        public void UpdatePreview(WallSystem wallSystem, List<WallEdge> edges)
        {
            HideAll();
            if (wallSystem == null || edges == null || previewPrefab == null) return;

            for (int i = 0; i < edges.Count; i++)
            {
                GameObject instance = GetOrCreateInstance();
                instance.SetActive(true);
                
                // Приподнимаем над землей на 0.05 метра
                Vector3 pos = wallSystem.GetEdgeWorldPosition(edges[i]) + Vector3.up * 0.05f;
                Quaternion rot = wallSystem.GetEdgeRotation(edges[i]);
                instance.transform.SetPositionAndRotation(pos, rot);
                
                ApplyColor(instance, previewColor);
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
            instance.name = "WallLinePreview_" + pool.Count;
            
            // Отключаем лишнее
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
                block.SetColor("_EmissionColor", color * 0.4f);
                renderer.SetPropertyBlock(block);
            }
        }
    }
}
