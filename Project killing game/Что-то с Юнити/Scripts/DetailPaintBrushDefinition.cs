using UnityEngine;

namespace MapEditorPrototype
{
    [CreateAssetMenu(fileName = "DetailPaintBrush", menuName = "Map Editor/Detail Paint Brush")]
    public class DetailPaintBrushDefinition : ScriptableObject
    {
        public string id;
        public string displayName;
        public Sprite icon;
        public DetailPaintChannel channel = DetailPaintChannel.Cracks;
        [Min(0.05f)] public float brushSize = 0.75f;
        [Range(0f, 1f)] public float opacity = 0.85f;
        [Range(0f, 1f)] public float hardness = 0.7f;
        public Texture2D overlayTexture;
        public Color overlayTint = Color.white;
        public Vector2 overlayTiling = Vector2.one;

        public string SafeDisplayName => string.IsNullOrWhiteSpace(displayName) ? name : displayName;
    }
}
