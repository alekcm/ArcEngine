using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Automatic generation of primitive colliders (Box / Capsule) based on mesh geometry analysis.
///
/// Algorithm:
///   1. Segmentation — splits mesh triangles into regions via normal-based region-growing.
///   2. PCA — finds principal axes and extents for each region.
///   3. Classification — determines Box vs Capsule using a triple metric:
///      a) Elongation (extent0 / extent1) — is the region rod-like?
///      b) Cross-section ratio (extent1 / extent2) — is the cross-section circular?
///      c) Normal roundness (entropy of projected normals) — are normals uniformly distributed?
///      Capsule requires: elongated AND circular cross-section AND round normals.
///      Otherwise: Box.
///   4. Fitting — fits each collider as an Oriented Bounding Box of its region.
///
/// Performance: each object gets 3–10 primitive colliders instead of a MeshCollider.
/// With 1000 objects on scene this is orders of magnitude faster for physics.
/// </summary>
[RequireComponent(typeof(MeshFilter))]
public class AutoColliderGenerator : MonoBehaviour
{
    // ==========================================================
    //  SETTINGS
    // ==========================================================

    [Header("Segmentation")]
    [Tooltip("Max angle (degrees) between normals of adjacent faces to group them into one region.\n" +
             "Lower = more regions (finer). Higher = fewer regions (coarser).\n" +
             "For 8-sided cylinders use >= 50. Recommended: 65.")]
    [Range(5f, 89f)]
    public float normalAngleThreshold = 65f;

    [Tooltip("Minimum triangle count for a region to be kept.\n" +
             "Higher = fewer colliders.")]
    [Min(1)]
    public int minTrianglesPerRegion = 15;

    [Tooltip("If > 0, keep only N largest regions (by triangle count).\n" +
             "Useful to cap total collider count. 0 = unlimited.")]
    [Min(0)]
    public int maxColliders = 0;

    [Header("Shape Classification")]
    [Tooltip("Elongation threshold (extent0 / extent1).\n" +
             "Regions with elongation above this AND circular cross-section → Capsule.\n" +
             "Chair legs: ~3–4. Flat objects: ~1.")]
    public float capsuleElongationThreshold = 2.5f;

    [Tooltip("Cross-section circularity threshold (extent1 / extent2).\n" +
             "A perfect cylinder has ratio = 1.0. A flat plank >> 1.0.\n" +
             "If ratio is BELOW this threshold → cross-section is circular → Capsule.\n" +
             "Recommended: 1.5.")]
    public float crossSectionRatioThreshold = 1.5f;

    [Tooltip("Normal roundness threshold (0–1).\n" +
             "Measures entropy of face normals projected onto the cross-section plane.\n" +
             "Cylinder: ~0.6–1.0 (uniform). Box beam: ~0.3–0.5 (clustered).\n" +
             "Capsule requires BOTH geometric AND normal-based circularity.")]
    [Range(0f, 1f)]
    public float normalRoundnessThreshold = 0.55f;

    [Header("Collider Sizing")]
    [Tooltip("Extra padding (meters) added to each collider dimension.")]
    public float padding = 0.005f;

    [Tooltip("Minimum collider dimension (meters). Prevents degenerate thin colliders.")]
    public float minColliderDimension = 0.01f;

    [Header("Collider Settings")]
    public bool isTrigger = false;

    [Tooltip("Physics material applied to all generated colliders. Leave null for default.")]
    public PhysicsMaterial physicsMaterial;

    // ==========================================================
    //  CONSTANTS
    // ==========================================================

    private const string COLLIDER_PARENT_NAME = "AutoColliders";
    private const int ROUNDNESS_BINS = 12;

    // ==========================================================
    //  PUBLIC INTERFACE
    // ==========================================================

    [ContextMenu("Generate Auto Colliders")]
    public void GenerateAutoColliders()
    {
        ClearAutoColliders();

        MeshFilter mf = GetComponent<MeshFilter>();
        if (mf == null || mf.sharedMesh == null)
        {
            Debug.LogError($"[AutoColliderGenerator] No mesh on '{gameObject.name}'.", this);
            return;
        }

        Mesh mesh = mf.sharedMesh;
        Vector3[] verts = mesh.vertices;
        int[] tris = mesh.triangles;
        int triCount = tris.Length / 3;

        if (triCount == 0)
        {
            Debug.LogError($"[AutoColliderGenerator] Mesh '{mesh.name}' has no triangles.", this);
            return;
        }

        // Warn about non-uniform scale
        Vector3 savedScale = transform.localScale;
        if (!Mathf.Approximately(savedScale.x, savedScale.y) ||
            !Mathf.Approximately(savedScale.y, savedScale.z))
        {
            Debug.LogWarning($"[AutoColliderGenerator] '{gameObject.name}' has non-uniform scale " +
                $"({savedScale}). Colliders may be deformed. Bake scale first.", this);
        }

        // Create container for colliders
        GameObject colliderParent = new GameObject(COLLIDER_PARENT_NAME);
        colliderParent.transform.SetParent(transform, false);
        colliderParent.transform.localPosition = Vector3.zero;
        colliderParent.transform.localRotation = Quaternion.identity;
        colliderParent.transform.localScale = Vector3.one;

        // Step 1: face normals
        Vector3[] faceNormals = ComputeFaceNormals(verts, tris, triCount);

        // Step 2: triangle adjacency
        List<int>[] adjacency = BuildAdjacency(tris, triCount);

        // Step 3: region growing by normals
        List<List<int>> regions = RegionGrow(faceNormals, adjacency, triCount);

        // Step 4: filter small regions + cap count
        regions = FilterRegions(regions);

        if (regions.Count == 0)
        {
            Debug.LogWarning($"[AutoColliderGenerator] No valid regions for '{gameObject.name}'.", this);
            DestroyContainer(colliderParent);
            return;
        }

        // Step 5: for each region — PCA, classify, fit collider
        int boxCount = 0, capsuleCount = 0;

        foreach (List<int> region in regions)
        {
            Vector3[] regionVerts = CollectRegionVertices(verts, tris, region);

            // PCA
            Vector3 centroid;
            float[] eigenvalues;
            Vector3[] eigenvectors;
            ComputePCA(regionVerts, out centroid, out eigenvalues, out eigenvectors);

            if (eigenvalues[0] < 1e-10f) continue; // degenerate

            // Compute OBB extents
            float[] extents;
            Vector3 obbCenter;
            ComputeExtents(regionVerts, centroid, eigenvectors, out extents, out obbCenter);

            // Classify: Box or Capsule?
            bool useCapsule = ClassifyShape(extents, region, faceNormals, eigenvectors);

            if (useCapsule)
            {
                CreateCapsuleCollider(colliderParent.transform, obbCenter, eigenvectors, extents);
                capsuleCount++;
            }
            else
            {
                CreateBoxCollider(colliderParent.transform, obbCenter, eigenvectors, extents);
                boxCount++;
            }
        }

        if (colliderParent.transform.childCount == 0)
        {
            Debug.LogWarning($"[AutoColliderGenerator] No colliders created for '{gameObject.name}'.", this);
            DestroyContainer(colliderParent);
            return;
        }

#if UNITY_EDITOR
        UnityEditor.Undo.RegisterCreatedObjectUndo(colliderParent, "Generate Auto Colliders");
#endif

        Debug.Log($"[AutoColliderGenerator] '{gameObject.name}': {boxCount + capsuleCount} colliders " +
                  $"({boxCount} Box, {capsuleCount} Capsule)", this);
    }

    [ContextMenu("Clear Auto Colliders")]
    public void ClearAutoColliders()
    {
        List<GameObject> toDestroy = new List<GameObject>();
        foreach (Transform child in transform)
        {
            if (child.gameObject.name == COLLIDER_PARENT_NAME)
                toDestroy.Add(child.gameObject);
        }
        foreach (GameObject go in toDestroy)
        {
            if (Application.isPlaying) Destroy(go);
            else DestroyImmediate(go);
        }
    }

    // ==========================================================
    //  MESH ANALYSIS
    // ==========================================================

    private static Vector3[] ComputeFaceNormals(Vector3[] verts, int[] tris, int triCount)
    {
        Vector3[] normals = new Vector3[triCount];
        for (int i = 0; i < triCount; i++)
        {
            Vector3 a = verts[tris[i * 3]];
            Vector3 b = verts[tris[i * 3 + 1]];
            Vector3 c = verts[tris[i * 3 + 2]];
            normals[i] = Vector3.Cross(b - a, c - a);
            float mag = normals[i].magnitude;
            if (mag > 1e-10f) normals[i] /= mag;
        }
        return normals;
    }

    private static List<int>[] BuildAdjacency(int[] tris, int triCount)
    {
        Dictionary<long, List<int>> edgeToTris = new Dictionary<long, List<int>>();

        for (int i = 0; i < triCount; i++)
        {
            int a = tris[i * 3], b = tris[i * 3 + 1], c = tris[i * 3 + 2];
            AddEdge(edgeToTris, a, b, i);
            AddEdge(edgeToTris, b, c, i);
            AddEdge(edgeToTris, c, a, i);
        }

        List<int>[] adj = new List<int>[triCount];
        for (int i = 0; i < triCount; i++)
            adj[i] = new List<int>(6);

        foreach (var kvp in edgeToTris)
        {
            List<int> list = kvp.Value;
            for (int a = 0; a < list.Count; a++)
                for (int b = a + 1; b < list.Count; b++)
                {
                    adj[list[a]].Add(list[b]);
                    adj[list[b]].Add(list[a]);
                }
        }

        return adj;
    }

    private static void AddEdge(Dictionary<long, List<int>> map, int a, int b, int triIndex)
    {
        int lo = a < b ? a : b;
        int hi = a < b ? b : a;
        long key = ((long)hi << 32) | (uint)lo;

        if (!map.TryGetValue(key, out List<int> list))
        {
            list = new List<int>(2);
            map[key] = list;
        }
        list.Add(triIndex);
    }

    // ==========================================================
    //  SEGMENTATION (REGION GROWING)
    // ==========================================================

    private List<List<int>> RegionGrow(Vector3[] faceNormals, List<int>[] adjacency, int triCount)
    {
        int[] regionOf = new int[triCount];
        for (int i = 0; i < triCount; i++) regionOf[i] = -1;

        List<List<int>> regions = new List<List<int>>();
        float cosThreshold = Mathf.Cos(normalAngleThreshold * Mathf.Deg2Rad);

        for (int seed = 0; seed < triCount; seed++)
        {
            if (regionOf[seed] >= 0) continue;

            List<int> region = new List<int>();
            Queue<int> queue = new Queue<int>();
            queue.Enqueue(seed);
            regionOf[seed] = regions.Count;

            while (queue.Count > 0)
            {
                int current = queue.Dequeue();
                region.Add(current);
                Vector3 curNormal = faceNormals[current];

                foreach (int neighbor in adjacency[current])
                {
                    if (regionOf[neighbor] >= 0) continue;
                    if (Vector3.Dot(curNormal, faceNormals[neighbor]) >= cosThreshold)
                    {
                        regionOf[neighbor] = regions.Count;
                        queue.Enqueue(neighbor);
                    }
                }
            }

            regions.Add(region);
        }

        return regions;
    }

    private List<List<int>> FilterRegions(List<List<int>> regions)
    {
        List<List<int>> valid = new List<List<int>>();
        foreach (var region in regions)
        {
            if (region.Count >= minTrianglesPerRegion)
                valid.Add(region);
        }

        if (maxColliders > 0 && valid.Count > maxColliders)
        {
            valid.Sort((a, b) => b.Count.CompareTo(a.Count));
            valid = valid.GetRange(0, maxColliders);
        }

        return valid;
    }

    // ==========================================================
    //  REGION VERTICES
    // ==========================================================

    private static Vector3[] CollectRegionVertices(Vector3[] allVerts, int[] tris, List<int> region)
    {
        HashSet<int> indices = new HashSet<int>();
        foreach (int tri in region)
        {
            indices.Add(tris[tri * 3]);
            indices.Add(tris[tri * 3 + 1]);
            indices.Add(tris[tri * 3 + 2]);
        }

        Vector3[] result = new Vector3[indices.Count];
        int idx = 0;
        foreach (int vi in indices)
            result[idx++] = allVerts[vi];

        return result;
    }

    // ==========================================================
    //  PCA (PRINCIPAL COMPONENT ANALYSIS)
    // ==========================================================

    private static void ComputePCA(Vector3[] points,
        out Vector3 centroid, out float[] eigenvalues, out Vector3[] eigenvectors)
    {
        int n = points.Length;

        // Centroid
        centroid = Vector3.zero;
        for (int i = 0; i < n; i++)
            centroid += points[i];
        centroid /= n;

        // Covariance matrix (symmetric 3x3)
        float m00 = 0, m01 = 0, m02 = 0;
        float m11 = 0, m12 = 0;
        float m22 = 0;

        for (int i = 0; i < n; i++)
        {
            float dx = points[i].x - centroid.x;
            float dy = points[i].y - centroid.y;
            float dz = points[i].z - centroid.z;

            m00 += dx * dx; m01 += dx * dy; m02 += dx * dz;
            m11 += dy * dy; m12 += dy * dz;
            m22 += dz * dz;
        }

        float invN = 1f / n;
        m00 *= invN; m01 *= invN; m02 *= invN;
        m11 *= invN; m12 *= invN; m22 *= invN;

        // Eigendecomposition of symmetric 3x3
        EigenDecomposition3x3(m00, m01, m02, m11, m12, m22,
            out eigenvalues, out eigenvectors);

        // Sort descending
        SortEigenDescending(ref eigenvalues, ref eigenvectors);

        // Clamp negative values
        for (int i = 0; i < 3; i++)
            if (eigenvalues[i] < 0f) eigenvalues[i] = 0f;

        // Ensure right-handed coordinate system
        if (Vector3.Dot(Vector3.Cross(eigenvectors[0], eigenvectors[1]), eigenvectors[2]) < 0f)
            eigenvectors[2] = -eigenvectors[2];
    }

    /// <summary>
    /// Analytical eigendecomposition of a symmetric 3x3 matrix
    /// using Cardano's / trigonometric method.
    /// </summary>
    private static void EigenDecomposition3x3(
        float m00, float m01, float m02,
        float m11, float m12, float m22,
        out float[] eigenvalues, out Vector3[] eigenvectors)
    {
        float offDiagSq = m01 * m01 + m02 * m02 + m12 * m12;

        if (offDiagSq < 1e-14f)
        {
            eigenvalues = new float[] { m00, m11, m22 };
            eigenvectors = new Vector3[] { Vector3.right, Vector3.up, Vector3.forward };
            return;
        }

        float q = (m00 + m11 + m22) / 3f;

        float p2 = (m00 - q) * (m00 - q)
                 + (m11 - q) * (m11 - q)
                 + (m22 - q) * (m22 - q)
                 + 2f * offDiagSq;
        float p = Mathf.Sqrt(p2 / 6f);

        float b00 = (m00 - q) / p;
        float b01 = m01 / p;
        float b02 = m02 / p;
        float b11 = (m11 - q) / p;
        float b12 = m12 / p;
        float b22 = (m22 - q) / p;

        float detB = b00 * (b11 * b22 - b12 * b12)
                   - b01 * (b01 * b22 - b12 * b02)
                   + b02 * (b01 * b12 - b11 * b02);
        float r = detB / 2f;

        float phi;
        if (r <= -1f) phi = Mathf.PI / 3f;
        else if (r >= 1f) phi = 0f;
        else phi = Mathf.Acos(r) / 3f;

        eigenvalues = new float[3];
        eigenvalues[0] = q + 2f * p * Mathf.Cos(phi);
        eigenvalues[2] = q + 2f * p * Mathf.Cos(phi + 2f * Mathf.PI / 3f);
        eigenvalues[1] = 3f * q - eigenvalues[0] - eigenvalues[2];

        // Eigenvectors via cross products of (A - lambda*I) rows
        eigenvectors = new Vector3[3];
        for (int i = 0; i < 3; i++)
        {
            float lam = eigenvalues[i];

            float r0x = m00 - lam, r0y = m01,     r0z = m02;
            float r1x = m01,     r1y = m11 - lam, r1z = m12;
            float r2x = m02,     r2y = m12,       r2z = m22 - lam;

            Vector3 c01 = new Vector3(
                r0y * r1z - r0z * r1y,
                r0z * r1x - r0x * r1z,
                r0x * r1y - r0y * r1x);

            Vector3 c02 = new Vector3(
                r0y * r2z - r0z * r2y,
                r0z * r2x - r0x * r2z,
                r0x * r2y - r0y * r2x);

            Vector3 c12 = new Vector3(
                r1y * r2z - r1z * r2y,
                r1z * r2x - r1x * r2z,
                r1x * r2y - r1y * r2x);

            float sq01 = c01.sqrMagnitude;
            float sq02 = c02.sqrMagnitude;
            float sq12 = c12.sqrMagnitude;

            if (sq01 >= sq02 && sq01 >= sq12)
                eigenvectors[i] = sq01 > 1e-14f ? c01.normalized : Vector3.right;
            else if (sq02 >= sq12)
                eigenvectors[i] = sq02 > 1e-14f ? c02.normalized : Vector3.up;
            else
                eigenvectors[i] = sq12 > 1e-14f ? c12.normalized : Vector3.forward;
        }
    }

    private static void SortEigenDescending(ref float[] vals, ref Vector3[] vecs)
    {
        for (int i = 0; i < 2; i++)
            for (int j = i + 1; j < 3; j++)
                if (vals[i] < vals[j])
                {
                    float tv = vals[i]; vals[i] = vals[j]; vals[j] = tv;
                    Vector3 vv = vecs[i]; vecs[i] = vecs[j]; vecs[j] = vv;
                }
    }

    // ==========================================================
    //  OBB EXTENTS
    // ==========================================================

    private static void ComputeExtents(Vector3[] points, Vector3 centroid, Vector3[] axes,
        out float[] extents, out Vector3 obbCenter)
    {
        float min0 = float.MaxValue, max0 = float.MinValue;
        float min1 = float.MaxValue, max1 = float.MinValue;
        float min2 = float.MaxValue, max2 = float.MinValue;

        for (int i = 0; i < points.Length; i++)
        {
            Vector3 d = points[i] - centroid;
            float p0 = Vector3.Dot(d, axes[0]);
            float p1 = Vector3.Dot(d, axes[1]);
            float p2 = Vector3.Dot(d, axes[2]);

            if (p0 < min0) min0 = p0; if (p0 > max0) max0 = p0;
            if (p1 < min1) min1 = p1; if (p1 > max1) max1 = p1;
            if (p2 < min2) min2 = p2; if (p2 > max2) max2 = p2;
        }

        extents = new float[]
        {
            Mathf.Max(max0 - min0, 0f),
            Mathf.Max(max1 - min1, 0f),
            Mathf.Max(max2 - min2, 0f)
        };

        float c0 = (min0 + max0) * 0.5f;
        float c1 = (min1 + max1) * 0.5f;
        float c2 = (min2 + max2) * 0.5f;

        obbCenter = centroid + axes[0] * c0 + axes[1] * c1 + axes[2] * c2;
    }

    // ==========================================================
    //  SHAPE CLASSIFICATION (TRIPLE METRIC)
    // ==========================================================

    /// <summary>
    /// Determines whether a region should use Capsule instead of Box.
    ///
    /// Uses a TRIPLE check — all three must pass:
    ///   1. Elongation: extent0 / extent1 > threshold (region is rod-like)
    ///   2. Cross-section ratio: extent1 / extent2 &lt; threshold (cross-section is circular)
    ///   3. Normal roundness: entropy of projected normals > threshold (normals are uniform)
    ///
    /// This correctly distinguishes:
    ///   - Cylinder (leg):  elongated + circular + round normals → Capsule
    ///   - Flat plank:      elongated + NOT circular (wide flat) → Box
    ///   - Box beam:        elongated + circular geo + NOT round normals → Box
    ///   - Flat slab:       NOT elongated → Box
    /// </summary>
    private bool ClassifyShape(float[] extents, List<int> regionTris,
        Vector3[] faceNormals, Vector3[] eigenvectors)
    {
        // extents[0] = longest, extents[1] = middle, extents[2] = shortest

        float elongation = extents[1] > 1e-6f ? extents[0] / extents[1] : float.MaxValue;

        // Check 1: must be elongated
        if (elongation <= capsuleElongationThreshold)
            return false;

        // Check 2: cross-section must be geometrically circular
        float crossRatio = extents[2] > 1e-6f ? extents[1] / extents[2] : float.MaxValue;
        if (crossRatio >= crossSectionRatioThreshold)
            return false;

        // Check 3: normals must be uniformly distributed around the axis
        float roundness = ComputeNormalRoundness(regionTris, faceNormals, eigenvectors);
        if (roundness <= normalRoundnessThreshold)
            return false;

        return true;
    }

    /// <summary>
    /// Computes cross-section "roundness" (0..1) via entropy of face normal distribution.
    ///
    /// Projects face normals onto the plane perpendicular to the primary PCA axis,
    /// bins the angles, and computes normalized entropy.
    ///
    /// Cylinder → ~0.6–1.0 (uniform). Box beam → ~0.3–0.5 (clustered on faces).
    /// </summary>
    private static float ComputeNormalRoundness(List<int> regionTris, Vector3[] faceNormals,
        Vector3[] eigenvectors)
    {
        Vector3 primary = eigenvectors[0];
        Vector3 secondary = eigenvectors[1];
        Vector3 tertiary = eigenvectors[2];

        int[] bins = new int[ROUNDNESS_BINS];
        int total = 0;

        foreach (int tri in regionTris)
        {
            Vector3 n = faceNormals[tri];

            // Project normal onto cross-section plane
            float dotPrimary = Vector3.Dot(n, primary);
            Vector3 projected = n - primary * dotPrimary;

            // Skip normals parallel to primary axis (end-caps of cylinder)
            if (projected.sqrMagnitude < 0.01f)
                continue;

            // Angle in cross-section plane
            float u = Vector3.Dot(projected, secondary);
            float v = Vector3.Dot(projected, tertiary);
            float angle = Mathf.Atan2(v, u);

            int bin = Mathf.FloorToInt((angle + Mathf.PI) / (2f * Mathf.PI) * ROUNDNESS_BINS);
            bin = Mathf.Clamp(bin, 0, ROUNDNESS_BINS - 1);

            bins[bin]++;
            total++;
        }

        if (total == 0) return 0f;

        float entropy = 0f;
        float invTotal = 1f / total;
        for (int i = 0; i < ROUNDNESS_BINS; i++)
        {
            if (bins[i] > 0)
            {
                float p = bins[i] * invTotal;
                entropy -= p * Mathf.Log(p);
            }
        }

        float maxEntropy = Mathf.Log(ROUNDNESS_BINS);
        return maxEntropy > 0f ? entropy / maxEntropy : 0f;
    }

    // ==========================================================
    //  COLLIDER CREATION
    // ==========================================================

    private void CreateBoxCollider(Transform parent, Vector3 localCenter, Vector3[] axes, float[] extents)
    {
        GameObject child = new GameObject("Box");
        child.transform.SetParent(parent, false);
        child.transform.localPosition = localCenter;

        // Orient: local X=axes[0], Y=axes[1], Z=axes[2]
        // LookRotation(forward=axes[2], up=axes[1]) → Z=axes[2], Y=axes[1], X=axes[1]×axes[2]=axes[0]
        child.transform.localRotation = Quaternion.LookRotation(axes[2], axes[1]);

        BoxCollider col = child.AddComponent<BoxCollider>();
        col.size = new Vector3(
            Mathf.Max(extents[0], minColliderDimension) + 2f * padding,
            Mathf.Max(extents[1], minColliderDimension) + 2f * padding,
            Mathf.Max(extents[2], minColliderDimension) + 2f * padding
        );
        col.isTrigger = isTrigger;
        if (physicsMaterial != null) col.material = physicsMaterial;
    }

    private void CreateCapsuleCollider(Transform parent, Vector3 localCenter, Vector3[] axes, float[] extents)
    {
        GameObject child = new GameObject("Capsule");
        child.transform.SetParent(parent, false);
        child.transform.localPosition = localCenter;

        // Capsule along axes[0] (primary). Local Z = axes[0] via LookRotation.
        child.transform.localRotation = Quaternion.LookRotation(axes[0], axes[1]);

        CapsuleCollider col = child.AddComponent<CapsuleCollider>();
        col.direction = 2; // Z-axis

        float radius = Mathf.Max(extents[1], extents[2]) * 0.5f + padding;
        float height = Mathf.Max(extents[0], minColliderDimension) + 2f * padding;

        // Unity requires height >= 2 * radius
        if (height < 2f * radius)
            height = 2f * radius;

        col.radius = radius;
        col.height = height;
        col.isTrigger = isTrigger;
        if (physicsMaterial != null) col.material = physicsMaterial;
    }

    // ==========================================================
    //  UTILITIES
    // ==========================================================

    private void DestroyContainer(GameObject go)
    {
        if (Application.isPlaying) Destroy(go);
        else DestroyImmediate(go);
    }
}
