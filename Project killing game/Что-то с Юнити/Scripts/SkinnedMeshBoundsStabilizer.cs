// SkinnedMeshBoundsStabilizer.cs
// Drop on any character root (wumon@T-Pose) to force stable SMR bounds in Unity 6 Play Mode.
// Solves: "bounds expand hugely / fly away" after DirectSMRLink / VRM hair remap.
using UnityEngine;

[DefaultExecutionOrder(10000)] // run late, after Binder
[DisallowMultipleComponent]
public class SkinnedMeshBoundsStabilizer : MonoBehaviour
{
    [Header("Bounds Settings")]
    public bool updateWhenOffscreen = true;
    public bool useManualBounds = true;
    public Vector3 manualCenter = new Vector3(0, 0.9f, 0);
    public Vector3 manualExtents = new Vector3(0.6f, 1.0f, 0.4f);

    [Header("Hair Override (smaller)")]
    public bool detectHairByName = true;
    public Vector3 hairCenter = new Vector3(0, 1.55f, 0);
    public Vector3 hairExtents = new Vector3(0.25f, 0.25f, 0.25f);

    [Header("Runtime")]
    public bool recalculateEveryFrame = false;
    public bool logFixedRenderers = false;

    SkinnedMeshRenderer[] _smrs;

    void Awake()
    {
        FixAll(true);
    }

    void Start()
    {
        FixAll(false);
    }

    void LateUpdate()
    {
        if (recalculateEveryFrame) FixAll(false);
    }

    [ContextMenu("Fix Now")]
    public void FixAll(bool firstTime)
    {
        if (_smrs == null || _smrs.Length == 0)
            _smrs = GetComponentsInChildren<SkinnedMeshRenderer>(true);

        int fixedCount = 0;
        foreach (var smr in _smrs)
        {
            if (smr == null || smr.sharedMesh == null) continue;

            // Unity 6 critical flags
            smr.updateWhenOffscreen = updateWhenOffscreen;
            smr.quality = SkinQuality.Bone4;
            smr.skinnedMotionVectors = true;
            smr.allowOcclusionWhenDynamic = false;
            smr.forceMatrixRecalculationPerRender = true;

            bool isHair = detectHairByName && (
                smr.name.ToLower().Contains("hair") ||
                smr.name.Contains("mesh_0") ||
                smr.sharedMesh.name.ToLower().Contains("hair")
            );

            if (useManualBounds)
            {
                if (isHair)
                    smr.localBounds = new Bounds(hairCenter, hairExtents * 2f);
                else
                    smr.localBounds = new Bounds(manualCenter, manualExtents * 2f);
            }
            else
            {
                // try recalc from mesh
                try
                {
                    // do NOT modify sharedMesh asset in play mode - clone if needed
                    var mesh = smr.sharedMesh;
                    #if UNITY_EDITOR
                    if (Application.isPlaying && UnityEditor.AssetDatabase.Contains(mesh))
                    {
                        mesh = Instantiate(mesh);
                        smr.sharedMesh = mesh;
                    }
                    #endif
                    mesh.RecalculateBounds();
                    smr.localBounds = mesh.bounds;
                }
                catch { }
            }

            // rootBone safety - must be in bones[]
            if (smr.rootBone != null && smr.bones != null)
            {
                bool found = false;
                foreach (var b in smr.bones) if (b == smr.rootBone) { found = true; break; }
                if (!found && smr.bones.Length > 0)
                {
                    // pick hips/head fallback
                    Transform fallback = null;
                    foreach (var b in smr.bones)
                    {
                        if (b == null) continue;
                        var n = b.name.ToLower();
                        if (n.Contains("hips") || n.Contains("head")) { fallback = b; break; }
                    }
                    smr.rootBone = fallback != null ? fallback : smr.bones[0];
                }
            }

            fixedCount++;
        }

        if (firstTime && logFixedRenderers)
            Debug.Log($"[BoundsStabilizer] Fixed {fixedCount} SkinnedMeshRenderers on {name}", this);
    }
}
