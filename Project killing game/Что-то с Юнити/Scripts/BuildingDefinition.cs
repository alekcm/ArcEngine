using UnityEngine;

namespace MapEditorPrototype
{
    [CreateAssetMenu(fileName = "BuildingDefinition", menuName = "Map Editor/Building Definition")]
    public class BuildingDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string id;
        public string displayName;
        public Sprite icon;

        [Header("Prefab")]
        public GameObject prefab;

        [Header("Layer")]
        public BuildLayer layer = BuildLayer.Furniture;

        [Header("Placement Type")]
        public BuildingPlacementMode placementMode = BuildingPlacementMode.Grid;

        [Header("Footprint In Grid Cells")]
        [Min(1)] public int width = 1;
        [Min(1)] public int length = 1;

        [Header("Placement")]
        public Vector3 worldOffset = Vector3.zero;
        public bool allowAltFreePlacement = true;
        public bool allowSurfacePlacement;

        public Vector2Int Footprint => new Vector2Int(Mathf.Max(1, width), Mathf.Max(1, length));
        public string SafeDisplayName => string.IsNullOrWhiteSpace(displayName) ? name : displayName;
        public bool SupportsSurfacePlacement => allowSurfacePlacement || layer == BuildLayer.Decor;
        public bool IsWallMounted => placementMode == BuildingPlacementMode.WallMounted;
    }
}
