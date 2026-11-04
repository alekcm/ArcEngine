using UnityEngine;

namespace MapEditorPrototype
{
    public enum WallOpeningType
    {
        Door,
        Window
    }

    [CreateAssetMenu(fileName = "WallOpeningDefinition", menuName = "Map Editor/Wall Opening Definition")]
    public class WallOpeningDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string id;
        public string displayName;
        public Sprite icon;

        [Header("Type")]
        public WallOpeningType openingType = WallOpeningType.Door;

        [Header("Prefab")]
        public GameObject prefab;
        public Vector3 worldOffset = Vector3.zero;

        public string SafeDisplayName => string.IsNullOrWhiteSpace(displayName) ? name : displayName;
    }
}
