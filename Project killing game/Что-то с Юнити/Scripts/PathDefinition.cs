using UnityEngine;

namespace MapEditorPrototype
{
    [CreateAssetMenu(fileName = "PathDefinition", menuName = "Map Editor/Path Definition")]
    public class PathDefinition : ScriptableObject
    {
        public string id;
        public string displayName;
        public Sprite icon;
        public Material material;
        [Min(0.1f)] public float defaultWidth = 1.5f;
        public float yOffset = 0.02f;
        [Min(64)] public int detailMaskResolution = 512;

        public string SafeDisplayName => string.IsNullOrWhiteSpace(displayName) ? name : displayName;
    }
}
