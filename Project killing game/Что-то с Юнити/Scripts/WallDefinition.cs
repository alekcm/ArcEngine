using UnityEngine;

namespace MapEditorPrototype
{
    [CreateAssetMenu(fileName = "WallDefinition", menuName = "Map Editor/Wall Definition")]
    public class WallDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string id;
        public string displayName;
        public Sprite icon;

        [Header("Prefab")]
        public GameObject prefab;
        public Vector3 worldOffset = Vector3.zero;

        public string SafeDisplayName => string.IsNullOrWhiteSpace(displayName) ? name : displayName;
    }
}
