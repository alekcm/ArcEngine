using UnityEngine;

namespace MapEditorPrototype
{
    public class PathHandleMarker : MonoBehaviour
    {
        [SerializeField] private PathHandleType handleType;
        [SerializeField] private int handleIndex = -1;
        [SerializeField] private PathStroke targetStroke;

        public PathHandleType HandleType => handleType;
        public int HandleIndex => handleIndex;
        public int PointIndex => handleIndex;
        public PathStroke TargetStroke => targetStroke;

        public void Initialize(PathStroke stroke, PathHandleType type, int index)
        {
            targetStroke = stroke;
            handleType = type;
            handleIndex = index;
        }
    }
}
