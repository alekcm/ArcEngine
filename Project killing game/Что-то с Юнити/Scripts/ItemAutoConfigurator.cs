#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using Unity.Netcode;
using Unity.Netcode.Components;
using System.IO;

namespace MapEditorPrototype.Editor
{
    public class ItemAutoConfigurator
    {
        [MenuItem("Tools/Detective/Configure All Items")]
        public static void ConfigureItems()
        {
            string[] guids = AssetDatabase.FindAssets("t:Prefab");
            int count = 0;

            foreach (string guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                
                if (!path.StartsWith("Assets/")) continue;
                if (path.ToLower().EndsWith(".fbx")) continue;

                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab == null) continue;

                if (prefab.GetComponent<PlacedObject>() != null)
                {
                    if (ConfigurePrefab(prefab)) count++;
                }
            }

            AssetDatabase.SaveAssets();
            Debug.Log($"[AutoConfig] Successfully processed {count} items in Assets folder.");
        }

        private static bool ConfigurePrefab(GameObject prefab)
        {
            try 
            {
                if (prefab.GetComponent<NetworkObject>() == null)
                    prefab.AddComponent<NetworkObject>();

                var rb = prefab.GetComponent<Rigidbody>();
                if (rb == null) rb = prefab.AddComponent<Rigidbody>();
                if (rb != null)
                {
                    rb.mass = 10f;
                    rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
                }

                var nt = prefab.GetComponent<NetworkTransform>();
                if (nt == null) nt = prefab.AddComponent<NetworkTransform>();
                if (nt != null)
                {
                    SerializedObject ntSo = new SerializedObject(nt);
                    var interpProp = ntSo.FindProperty("Interpolate") ?? ntSo.FindProperty("interpolate");
                    if (interpProp != null) interpProp.boolValue = true;
                    ntSo.ApplyModifiedProperties();
                }

                var movableScript = prefab.GetComponent<MovableInteractableObject>();
                if (movableScript == null) movableScript = prefab.AddComponent<MovableInteractableObject>();
                
                if (movableScript != null)
                {
                    SerializedObject so = new SerializedObject(movableScript);
                    var rbProp = so.FindProperty("rb");
                    if (rbProp != null) rbProp.objectReferenceValue = rb;
                    
                    var ntProp = so.FindProperty("netTransform");
                    if (ntProp != null) ntProp.objectReferenceValue = nt;
                    
                    so.ApplyModifiedProperties();
                }

                EditorUtility.SetDirty(prefab);
                return true;
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[AutoConfig] Could not configure {prefab.name}: {e.Message}");
                return false;
            }
        }
    }
}
#endif
