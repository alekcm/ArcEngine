using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider))]
    public class PathStroke : MonoBehaviour, IPaintSurfaceOwner
    {
        [SerializeField] private string strokeId;
        [SerializeField] private PathDefinition definition;
        [SerializeField] private float width = 1.5f;
        [SerializeField] private List<Vector3> controlPoints = new List<Vector3>();
        [SerializeField] private bool selected;

        private MeshFilter meshFilter;
        private MeshRenderer meshRenderer;
        private MeshCollider meshCollider;
        private Mesh runtimeMesh;

        public string StrokeId => strokeId;
        public string SurfaceOwnerId => strokeId;
        public PathDefinition Definition => definition;
        public float Width => width;
        public IReadOnlyList<Vector3> ControlPoints => controlPoints;
        public bool IsSelected => selected;

        private void Awake()
        {
            meshFilter = GetComponent<MeshFilter>();
            meshRenderer = GetComponent<MeshRenderer>();
            meshCollider = GetComponent<MeshCollider>();
        }

        public void Initialize(PathDefinition pathDefinition, float strokeWidth, IReadOnlyList<Vector3> points, string newStrokeId = null)
        {
            meshFilter = GetComponent<MeshFilter>();
            meshRenderer = GetComponent<MeshRenderer>();
            meshCollider = GetComponent<MeshCollider>();

            definition = pathDefinition;
            width = Mathf.Max(0.1f, strokeWidth);
            strokeId = string.IsNullOrWhiteSpace(newStrokeId) ? Guid.NewGuid().ToString("N") : newStrokeId;

            controlPoints.Clear();
            if (points != null)
            {
                for (int i = 0; i < points.Count; i++)
                {
                    controlPoints.Add(points[i]);
                }
            }

            if (meshRenderer != null && definition != null && definition.material != null)
            {
                meshRenderer.sharedMaterial = definition.material;
            }

            RebuildMesh();
            SetSelected(false);
        }

        public void SetSelected(bool value)
        {
            selected = value;
            if (meshRenderer == null)
            {
                meshRenderer = GetComponent<MeshRenderer>();
            }

            if (meshRenderer == null)
            {
                return;
            }

            MaterialPropertyBlock block = new MaterialPropertyBlock();
            meshRenderer.GetPropertyBlock(block);

            if (value)
            {
                if (RendererSupportsProperty("_EmissionColor"))
                {
                    block.SetColor("_EmissionColor", new Color(0.15f, 0.45f, 1f, 1f));
                }
                if (RendererSupportsProperty("_BaseColor"))
                {
                    Color baseColor = Color.white;
                    block.SetColor("_BaseColor", Color.Lerp(baseColor, new Color(0.5f, 0.75f, 1f, 1f), 0.18f));
                }
            }
            else
            {
                block.Clear();
            }

            meshRenderer.SetPropertyBlock(block);
        }

        public bool TryGetNearestControlPointIndex(Vector3 worldPosition, float maxDistance, out int index)
        {
            index = -1;
            if (controlPoints == null || controlPoints.Count == 0)
            {
                return false;
            }

            float maxDistanceSqr = maxDistance * maxDistance;
            float bestDistanceSqr = maxDistanceSqr;

            for (int i = 0; i < controlPoints.Count; i++)
            {
                float distanceSqr = (controlPoints[i] - worldPosition).sqrMagnitude;
                if (distanceSqr <= bestDistanceSqr)
                {
                    bestDistanceSqr = distanceSqr;
                    index = i;
                }
            }

            return index >= 0;
        }

        public bool TryGetSegmentMidpoint(int segmentIndex, out Vector3 midpoint)
        {
            midpoint = default;
            if (!IsValidSegmentIndex(segmentIndex))
            {
                return false;
            }

            midpoint = (controlPoints[segmentIndex] + controlPoints[segmentIndex + 1]) * 0.5f;
            return true;
        }

        public bool TryGetSegmentWidthHandlePose(int segmentIndex, out Vector3 handlePosition, out Vector3 centerPosition)
        {
            handlePosition = default;
            centerPosition = default;
            if (!TryGetSegmentCenterAndRight(segmentIndex, out centerPosition, out Vector3 right))
            {
                return false;
            }

            handlePosition = centerPosition + right * (width * 0.5f);
            return true;
        }

        public bool TryGetWidthHandlePose(out Vector3 handlePosition, out Vector3 centerPosition)
        {
            int segmentIndex = Mathf.Clamp((controlPoints.Count - 2) / 2, 0, controlPoints.Count - 2);
            return TryGetSegmentWidthHandlePose(segmentIndex, out handlePosition, out centerPosition);
        }

        public float CalculateWidthFromHandlePosition(Vector3 worldPosition)
        {
            int segmentIndex = Mathf.Clamp((controlPoints.Count - 2) / 2, 0, controlPoints.Count - 2);
            return CalculateWidthFromSegmentHandlePosition(segmentIndex, worldPosition);
        }

        public float CalculateWidthFromSegmentHandlePosition(int segmentIndex, Vector3 worldPosition)
        {
            if (!TryGetSegmentCenterAndRight(segmentIndex, out Vector3 centerPosition, out Vector3 right))
            {
                return width;
            }

            float signedDistance = Vector3.Dot(worldPosition - centerPosition, right);
            return Mathf.Max(0.1f, Mathf.Abs(signedDistance) * 2f);
        }

        public bool SetControlPoint(int index, Vector3 worldPosition)
        {
            if (index < 0 || index >= controlPoints.Count)
            {
                return false;
            }

            controlPoints[index] = worldPosition;
            RebuildMesh();
            return true;
        }

        public bool InsertControlPointAfterSegment(int segmentIndex, Vector3 worldPosition, out int insertedIndex)
        {
            insertedIndex = -1;
            if (!IsValidSegmentIndex(segmentIndex))
            {
                return false;
            }

            insertedIndex = segmentIndex + 1;
            controlPoints.Insert(insertedIndex, worldPosition);
            RebuildMesh();
            return true;
        }

        public bool RemoveControlPointAt(int index)
        {
            if (index < 0 || index >= controlPoints.Count || controlPoints.Count <= 2)
            {
                return false;
            }

            controlPoints.RemoveAt(index);
            RebuildMesh();
            return true;
        }

        public void SetWidth(float newWidth)
        {
            width = Mathf.Max(0.1f, newWidth);
            RebuildMesh();
        }

        public void RebuildMesh()
        {
            if (controlPoints == null || controlPoints.Count < 2)
            {
                return;
            }

            if (runtimeMesh == null)
            {
                runtimeMesh = new Mesh
                {
                    name = name + "_PathMesh"
                };
            }
            else
            {
                runtimeMesh.Clear();
            }

            int pointCount = controlPoints.Count;
            Vector3[] vertices = new Vector3[pointCount * 2];
            Vector2[] uvs = new Vector2[pointCount * 2];
            int[] triangles = new int[(pointCount - 1) * 6];

            float accumulatedLength = 0f;

            for (int i = 0; i < pointCount; i++)
            {
                Vector3 current = transform.InverseTransformPoint(controlPoints[i]);
                Vector3 prev = i > 0 ? transform.InverseTransformPoint(controlPoints[i - 1]) : current;
                Vector3 next = i < pointCount - 1 ? transform.InverseTransformPoint(controlPoints[i + 1]) : current;

                Vector3 forward = i == 0 ? (next - current) : i == pointCount - 1 ? (current - prev) : (next - prev);
                forward.y = 0f;
                if (forward.sqrMagnitude < 0.0001f)
                {
                    forward = Vector3.forward;
                }
                forward.Normalize();

                Vector3 right = Vector3.Cross(Vector3.up, forward).normalized;
                Vector3 offset = right * (width * 0.5f);

                vertices[i * 2] = current - offset;
                vertices[i * 2 + 1] = current + offset;

                if (i > 0)
                {
                    accumulatedLength += Vector3.Distance(controlPoints[i - 1], controlPoints[i]);
                }

                uvs[i * 2] = new Vector2(accumulatedLength, 0f);
                uvs[i * 2 + 1] = new Vector2(accumulatedLength, 1f);
            }

            int triangleIndex = 0;
            for (int i = 0; i < pointCount - 1; i++)
            {
                int baseIndex = i * 2;
                triangles[triangleIndex++] = baseIndex;
                triangles[triangleIndex++] = baseIndex + 2;
                triangles[triangleIndex++] = baseIndex + 1;
                triangles[triangleIndex++] = baseIndex + 1;
                triangles[triangleIndex++] = baseIndex + 2;
                triangles[triangleIndex++] = baseIndex + 3;
            }

            runtimeMesh.vertices = vertices;
            runtimeMesh.uv = uvs;
            runtimeMesh.triangles = triangles;
            runtimeMesh.RecalculateNormals();
            runtimeMesh.RecalculateBounds();

            meshFilter.sharedMesh = runtimeMesh;
            meshCollider.sharedMesh = null;
            meshCollider.sharedMesh = runtimeMesh;
        }

        private bool TryGetSegmentCenterAndRight(int segmentIndex, out Vector3 centerPosition, out Vector3 right)
        {
            centerPosition = default;
            right = Vector3.right;
            if (!IsValidSegmentIndex(segmentIndex))
            {
                return false;
            }

            Vector3 start = controlPoints[segmentIndex];
            Vector3 end = controlPoints[segmentIndex + 1];
            centerPosition = (start + end) * 0.5f;

            Vector3 forward = end - start;
            forward.y = 0f;
            if (forward.sqrMagnitude < 0.0001f)
            {
                forward = Vector3.forward;
            }
            forward.Normalize();
            right = Vector3.Cross(Vector3.up, forward).normalized;
            return true;
        }

        private bool IsValidSegmentIndex(int segmentIndex)
        {
            return controlPoints != null && segmentIndex >= 0 && segmentIndex < controlPoints.Count - 1;
        }

        private bool RendererSupportsProperty(string propertyName)
        {
            if (meshRenderer == null || meshRenderer.sharedMaterials == null)
            {
                return false;
            }

            Material[] materials = meshRenderer.sharedMaterials;
            for (int i = 0; i < materials.Length; i++)
            {
                if (materials[i] != null && materials[i].HasProperty(propertyName))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
