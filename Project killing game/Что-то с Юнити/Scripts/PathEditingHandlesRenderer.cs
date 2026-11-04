using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace MapEditorPrototype
{
    public class PathEditingHandlesRenderer : MonoBehaviour
    {
        [SerializeField] private Transform handlesRoot;
        [SerializeField] private float controlHandleSize = 0.22f;
        [SerializeField] private float insertHandleSize = 0.16f;
        [SerializeField] private float widthHandleSize = 0.28f;
        [SerializeField] private float yOffset = 0.03f;

        [Header("Colors")]
        [SerializeField] private Color controlHandleColor = new Color(0.18f, 0.7f, 1f, 1f);
        [SerializeField] private Color hoveredControlHandleColor = new Color(0.55f, 0.9f, 1f, 1f);
        [SerializeField] private Color selectedControlHandleColor = new Color(1f, 0.8f, 0.15f, 1f);
        [SerializeField] private Color insertHandleColor = new Color(1f, 0.5f, 0.18f, 1f);
        [SerializeField] private Color hoveredInsertHandleColor = new Color(1f, 0.72f, 0.32f, 1f);
        [SerializeField] private Color widthHandleColor = new Color(0.45f, 1f, 0.45f, 1f);
        [SerializeField] private Color hoveredWidthHandleColor = new Color(0.75f, 1f, 0.65f, 1f);
        [SerializeField] private Color activeWidthHandleColor = new Color(1f, 0.9f, 0.3f, 1f);
        [SerializeField] private Color widthGuideColor = new Color(0.45f, 1f, 0.45f, 0.45f);
        [SerializeField] private Color activeWidthGuideColor = new Color(1f, 0.9f, 0.3f, 0.9f);
        [SerializeField] private float widthGuideThickness = 0.04f;

        private readonly List<PathHandleMarker> controlMarkers = new List<PathHandleMarker>();
        private readonly List<PathHandleMarker> insertMarkers = new List<PathHandleMarker>();
        private readonly List<PathHandleMarker> widthMarkers = new List<PathHandleMarker>();
        private readonly List<LineRenderer> widthGuideLines = new List<LineRenderer>();
        private Material sharedHandleMaterial;
        private Material sharedLineMaterial;

        private void Awake()
        {
            EnsureInfrastructure();
            Hide();
        }

        public void Show(PathStroke stroke, int selectedPointIndex, PathHandleMarker hoveredMarker, int activeWidthSegmentIndex)
        {
            EnsureInfrastructure();
            if (stroke == null)
            {
                Hide();
                return;
            }

            if (handlesRoot != null)
            {
                handlesRoot.gameObject.SetActive(true);
            }

            int controlCount = stroke.ControlPoints.Count;
            int segmentCount = Mathf.Max(0, controlCount - 1);
            EnsureControlMarkerCount(controlCount);
            EnsureInsertMarkerCount(segmentCount);
            EnsureWidthMarkerCount(segmentCount);
            EnsureWidthGuideCount(segmentCount);

            PathHandleType hoveredType = hoveredMarker != null && hoveredMarker.TargetStroke == stroke ? hoveredMarker.HandleType : (PathHandleType)(-1);
            int hoveredIndex = hoveredMarker != null && hoveredMarker.TargetStroke == stroke ? hoveredMarker.HandleIndex : -1;

            for (int i = 0; i < controlMarkers.Count; i++)
            {
                bool shouldBeActive = i < controlCount;
                PathHandleMarker marker = controlMarkers[i];
                marker.gameObject.SetActive(shouldBeActive);
                if (!shouldBeActive)
                {
                    continue;
                }

                marker.Initialize(stroke, PathHandleType.ControlPoint, i);
                marker.transform.position = stroke.ControlPoints[i] + Vector3.up * yOffset;
                marker.transform.localScale = Vector3.one * controlHandleSize;

                Color color = controlHandleColor;
                if (i == selectedPointIndex)
                {
                    color = selectedControlHandleColor;
                }
                else if (hoveredType == PathHandleType.ControlPoint && hoveredIndex == i)
                {
                    color = hoveredControlHandleColor;
                }

                SetMarkerColor(marker, color);
            }

            for (int segmentIndex = 0; segmentIndex < insertMarkers.Count; segmentIndex++)
            {
                bool shouldBeActive = segmentIndex < segmentCount;
                PathHandleMarker insertMarker = insertMarkers[segmentIndex];
                PathHandleMarker widthMarker = widthMarkers[segmentIndex];
                LineRenderer guide = widthGuideLines[segmentIndex];

                insertMarker.gameObject.SetActive(shouldBeActive);
                widthMarker.gameObject.SetActive(shouldBeActive);
                guide.gameObject.SetActive(shouldBeActive);

                if (!shouldBeActive)
                {
                    continue;
                }

                if (stroke.TryGetSegmentMidpoint(segmentIndex, out Vector3 midpoint))
                {
                    insertMarker.Initialize(stroke, PathHandleType.InsertPoint, segmentIndex);
                    insertMarker.transform.position = midpoint + Vector3.up * yOffset;
                    insertMarker.transform.localScale = Vector3.one * insertHandleSize;
                    SetMarkerColor(insertMarker, hoveredType == PathHandleType.InsertPoint && hoveredIndex == segmentIndex ? hoveredInsertHandleColor : insertHandleColor);
                }

                if (stroke.TryGetSegmentWidthHandlePose(segmentIndex, out Vector3 widthHandlePosition, out Vector3 centerPosition))
                {
                    widthMarker.Initialize(stroke, PathHandleType.Width, segmentIndex);
                    widthMarker.transform.position = widthHandlePosition + Vector3.up * yOffset;
                    widthMarker.transform.localScale = Vector3.one * widthHandleSize;

                    bool isActiveWidthSegment = activeWidthSegmentIndex == segmentIndex;
                    Color widthColor = isActiveWidthSegment
                        ? activeWidthHandleColor
                        : hoveredType == PathHandleType.Width && hoveredIndex == segmentIndex ? hoveredWidthHandleColor : widthHandleColor;
                    SetMarkerColor(widthMarker, widthColor);

                    guide.positionCount = 2;
                    guide.startWidth = widthGuideThickness;
                    guide.endWidth = widthGuideThickness;
                    Color guideColor = isActiveWidthSegment ? activeWidthGuideColor : widthGuideColor;
                    guide.startColor = guideColor;
                    guide.endColor = guideColor;
                    guide.SetPosition(0, centerPosition + Vector3.up * yOffset * 0.5f);
                    guide.SetPosition(1, widthHandlePosition + Vector3.up * yOffset * 0.5f);
                }
            }
        }

        public void Hide()
        {
            EnsureInfrastructure();
            if (handlesRoot != null)
            {
                handlesRoot.gameObject.SetActive(false);
            }
        }

        private void EnsureInfrastructure()
        {
            if (handlesRoot == null)
            {
                GameObject rootObject = new GameObject("PathEditingHandles");
                rootObject.transform.SetParent(transform, false);
                handlesRoot = rootObject.transform;
            }

            if (sharedHandleMaterial == null)
            {
                sharedHandleMaterial = new Material(Shader.Find("Sprites/Default"));
            }

            if (sharedLineMaterial == null)
            {
                sharedLineMaterial = new Material(Shader.Find("Sprites/Default"));
            }
        }

        private void EnsureControlMarkerCount(int count)
        {
            while (controlMarkers.Count < count)
            {
                controlMarkers.Add(CreateHandleMarker("ControlHandle_" + controlMarkers.Count, PrimitiveType.Sphere));
            }
        }

        private void EnsureInsertMarkerCount(int count)
        {
            while (insertMarkers.Count < count)
            {
                insertMarkers.Add(CreateHandleMarker("InsertHandle_" + insertMarkers.Count, PrimitiveType.Cube));
            }
        }

        private void EnsureWidthMarkerCount(int count)
        {
            while (widthMarkers.Count < count)
            {
                widthMarkers.Add(CreateHandleMarker("WidthHandle_" + widthMarkers.Count, PrimitiveType.Sphere));
            }
        }

        private void EnsureWidthGuideCount(int count)
        {
            while (widthGuideLines.Count < count)
            {
                GameObject lineObject = new GameObject("WidthGuide_" + widthGuideLines.Count);
                lineObject.transform.SetParent(handlesRoot, false);
                LineRenderer line = lineObject.AddComponent<LineRenderer>();
                line.material = sharedLineMaterial;
                line.useWorldSpace = true;
                line.alignment = LineAlignment.View;
                line.numCapVertices = 4;
                line.numCornerVertices = 4;
                line.textureMode = LineTextureMode.Stretch;
                line.shadowCastingMode = ShadowCastingMode.Off;
                line.receiveShadows = false;
                widthGuideLines.Add(line);
            }
        }

        private PathHandleMarker CreateHandleMarker(string objectName, PrimitiveType primitiveType)
        {
            GameObject handleObject = GameObject.CreatePrimitive(primitiveType);
            handleObject.name = objectName;
            handleObject.transform.SetParent(handlesRoot, false);

            Renderer renderer = handleObject.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.sharedMaterial = sharedHandleMaterial;
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                renderer.receiveShadows = false;
            }

            PathHandleMarker marker = handleObject.AddComponent<PathHandleMarker>();
            return marker;
        }

        private void SetMarkerColor(PathHandleMarker marker, Color color)
        {
            if (marker == null)
            {
                return;
            }

            Renderer renderer = marker.GetComponent<Renderer>();
            if (renderer == null)
            {
                return;
            }

            MaterialPropertyBlock block = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(block);
            block.SetColor("_Color", color);
            block.SetColor("_BaseColor", color);
            renderer.SetPropertyBlock(block);
        }
    }
}
