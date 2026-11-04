using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    [RequireComponent(typeof(LineRenderer))]
    public class PathPreviewRenderer : MonoBehaviour
    {
        [SerializeField] private LineRenderer lineRenderer;
        [SerializeField] private Color validColor = new Color(0.25f, 0.9f, 1f, 0.9f);

        private void Reset()
        {
            lineRenderer = GetComponent<LineRenderer>();
            ConfigureLineRenderer();
        }

        private void Awake()
        {
            if (lineRenderer == null)
            {
                lineRenderer = GetComponent<LineRenderer>();
            }

            ConfigureLineRenderer();
            SetVisible(false);
        }

        public void SetVisible(bool visible)
        {
            if (lineRenderer != null)
            {
                lineRenderer.enabled = visible;
            }
        }

        public void UpdatePreview(IReadOnlyList<Vector3> points, Vector3 currentPoint, float width)
        {
            if (lineRenderer == null || points == null || points.Count == 0)
            {
                SetVisible(false);
                return;
            }

            lineRenderer.enabled = true;
            lineRenderer.startWidth = width;
            lineRenderer.endWidth = width;
            lineRenderer.positionCount = points.Count + 1;

            for (int i = 0; i < points.Count; i++)
            {
                lineRenderer.SetPosition(i, points[i]);
            }

            lineRenderer.SetPosition(points.Count, currentPoint);
        }

        private void ConfigureLineRenderer()
        {
            if (lineRenderer == null)
            {
                return;
            }

            lineRenderer.useWorldSpace = true;
            lineRenderer.alignment = LineAlignment.View;
            lineRenderer.textureMode = LineTextureMode.Tile;
            lineRenderer.numCapVertices = 4;
            lineRenderer.numCornerVertices = 4;
            lineRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lineRenderer.receiveShadows = false;
            lineRenderer.material = new Material(Shader.Find("Sprites/Default"));
            lineRenderer.startColor = validColor;
            lineRenderer.endColor = validColor;
        }
    }
}
