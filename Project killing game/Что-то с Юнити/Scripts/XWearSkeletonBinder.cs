// XWearSkeletonBinder.cs
// Unity 6 FIX – 2026-06-29
// - RootBone validation (must be in bones[])
// - Mesh clone before bindpose edit (prevents InvalidOperationException in Play Mode)
// - RecalculateBounds + updateWhenOffscreen=true (Unity 6 culling)
// - Mixamo scale=100 compensation preserved
// Public API 100% compatible with original

using System.Collections.Generic;
using UnityEngine;

namespace XWearImporter
{
    [ExecuteAlways]
    [AddComponentMenu("XWear/Skeleton Binder")]
    public class XWearSkeletonBinder : MonoBehaviour
    {
        public enum BindMode
        {
            SmartRetargeting,
            DirectSMRLink,
            WorldPoseFollower
        }

        public enum XWearFitMode
        {
            [Tooltip("Recommended for .xwear: remap bones, rebuild bindposes, then softly adjust volume/cage without matrix skeleton vertex fitting.")]
            CageOnly = 0,
            [Tooltip("Only remap bones and rebuild bindposes. Safest; does not resize clothing.")]
            BindOnly = 1,
            [Tooltip("Full ClothingAutoFitterV2, including skeleton matrix vertex fitting. Powerful but can collapse some .xwear assets.")]
            FullAutoFit = 2
        }

        [Header("Architecture")]
        public BindMode bindMode = BindMode.DirectSMRLink;
        public Transform mainCharacterRoot;
        public List<Transform> clothingRoots = new List<Transform>();

        [Header("Direct SMR Binding")]
        public bool alignClothingRootToCharacterInDirectSMR = true;
        public bool alignClothingRootRotationToCharacterInDirectSMR = false;
        public bool rebuildBindposesForDirectSMR = true;
        [Tooltip("Legacy switch. If enabled, uses ClothingAutoFitterV2 now (not the old world-offset fitter).")]
        public bool fitVerticesToTargetBody = false;

        [Header("Auto Fit V2")]
        [Tooltip("Master switch for geometry fitting. If disabled, the binder uses BindOnly even when XWear Fit Mode is CageOnly/FullAutoFit.")]
        public bool autoFitClothingToTargetBody = true;
        [Tooltip("Recommended for .xwear is CageOnly. FullAutoFit is the old aggressive behaviour and can collapse sleeves/torso on some exports.")]
        public XWearFitMode xwearFitMode = XWearFitMode.CageOnly;
        public CharacterEditor.VrmImport.ClothingAutoFitterV2.ClothingFitType autoFitType = CharacterEditor.VrmImport.ClothingAutoFitterV2.ClothingFitType.Auto;
        [Range(0f, 1f)] public float autoFitStrength = 0.75f;
        [Range(0f, 1f)] public float autoFitCageStrength = 0.35f;
        [Range(0f, 1f)] public float autoFitSkeletonStrength = 1f;
        [Tooltip("Safety cap used only by CageOnly mode. Set FullAutoFit if stronger deformation is required.")]
        [Range(0f, 1f)] public float cageOnlyMaxCageStrength = 0.45f;
        public float autoFitMinCageScale = 0.55f;
        public float autoFitMaxCageScale = 1.85f;

        [Header("Scale Compensation")]
        [Tooltip("Keeps clothing world scale at 1 even when it is parented under a Mixamo/FBX Armature scaled to 100.")]
        public bool compensateClothingRootScale = true;
        public Vector3 desiredClothingWorldScale = Vector3.one;

        [Header("Unity 6 Bounds Fix")]
        public bool forceRecalculateBounds = true;
        public bool forceUpdateWhenOffscreen = true;
        public bool useLargeStableBounds = true;
        public Vector3 stableBoundsCenter = new Vector3(0, 0.9f, 0);
        public Vector3 stableBoundsExtents = new Vector3(0.8f, 1.2f, 0.8f);
        public bool validateRootBone = true;
        public bool autoFindHipsRoot = true;

        [Header("Crowd Optimization")]
        public bool optimizeFarPhysics = true;
        public float farDistanceThreshold = 15f;

        private struct BoneLink
        {
            public Transform bodyBone;
            public Transform clothBone;
            public Quaternion bodyStartLocalRot;
            public Quaternion clothStartLocalRot;
            public bool isRootHips;
        }

        private readonly List<BoneLink> _links = new List<BoneLink>();
        private readonly List<XWearSpringBone> _springBones = new List<XWearSpringBone>();
        private Camera _mainCam;
        private bool _isInitialized = false;

        private static readonly Dictionary<int, Mesh> _originalMeshCache = new Dictionary<int, Mesh>();

        void Awake()
        {
            if (Application.isPlaying) InitializeBinder();
        }
        void Start()
        {
            if (Application.isPlaying && !_isInitialized) InitializeBinder();
        }
        void OnValidate()
        {
            if (Application.isPlaying) return;
        }
        void OnEnable()
        {
#if UNITY_EDITOR
            if (!Application.isPlaying)
            {
                UnityEditor.EditorApplication.delayCall += () =>
                {
                    if (this == null || Application.isPlaying) return;
                    foreach (var c in clothingRoots) RepairClothingSMR(c, true);
                };
            }
#endif
        }

        [ContextMenu("Force Rebind Now")]
        public void ForceRebind() { _isInitialized = false; InitializeBinder(); }

        public void InitializeBinder()
        {
            _links.Clear();
            _springBones.Clear();
            if (mainCharacterRoot == null) mainCharacterRoot = transform;

            using (var scope = CharacterEditor.VrmImport.ClothingFitter.TPoseScope.Enter(mainCharacterRoot))
            {
                var excluded = new HashSet<Transform>(clothingRoots);
            var mainBonesByName = new Dictionary<string, Transform>();
            CollectBodyBonesCanonically(mainCharacterRoot, mainBonesByName, excluded);

            Transform hipsFallback = null;
            if (autoFindHipsRoot)
            {
                mainBonesByName.TryGetValue("c_hips", out hipsFallback);
                if (hipsFallback == null) mainBonesByName.TryGetValue("hips", out hipsFallback);
            }
            if (hipsFallback == null) hipsFallback = mainCharacterRoot;

            _springBones.AddRange(GetComponentsInChildren<XWearSpringBone>(true));

            foreach (var clothing in clothingRoots)
            {
                if (clothing == null) continue;

                // Disable standalone fitters on clothing root so they do not execute independently in Start() and cause double-fitting
                foreach (var cf in clothing.GetComponentsInChildren<CharacterEditor.VrmImport.ClothingFitter>(true))
                { cf.enabled = false; cf.fitOnStart = false; }
                foreach (var caf in clothing.GetComponentsInChildren<CharacterEditor.VrmImport.ClothingAutoFitterV2>(true))
                { caf.enabled = false; caf.fitOnStart = false; }

                RepairClothingSMR(clothing, true);

                if (bindMode == BindMode.SmartRetargeting || bindMode == BindMode.WorldPoseFollower)
                {
                    // smart retargeting unchanged (omitted for brevity – same as original)
                    var rootGO = FindClothingSkeletonRoot(clothing);
                    if (rootGO != null) rootGO.gameObject.SetActive(true);
                    var clothBones = new Dictionary<string, Transform>();
                    CollectBonesCanonically(clothing, clothBones);
                    foreach (var kvp in clothBones)
                    {
                        if (mainBonesByName.TryGetValue(kvp.Key, out var bodyBone))
                        {
                            if (bodyBone != mainCharacterRoot && kvp.Value != clothing)
                            {
                                _links.Add(new BoneLink
                                {
                                    bodyBone = bodyBone,
                                    clothBone = kvp.Value,
                                    bodyStartLocalRot = bodyBone.localRotation,
                                    clothStartLocalRot = kvp.Value.localRotation,
                                    isRootHips = kvp.Key.Contains("hips")
                                });
                            }
                        }
                    }
                    _springBones.AddRange(clothing.GetComponentsInChildren<XWearSpringBone>(true));
                    continue;
                }

                // DirectSMRLink
                if (alignClothingRootToCharacterInDirectSMR && mainCharacterRoot != null)
                {
                    clothing.position = mainCharacterRoot.position;
                    if (alignClothingRootRotationToCharacterInDirectSMR)
                        clothing.rotation = mainCharacterRoot.rotation;
                }
                if (compensateClothingRootScale)
                    SetWorldScale(clothing, desiredClothingWorldScale);

                var smrs = clothing.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                foreach (var smr in smrs)
                {
                    if (smr == null || smr.sharedMesh == null) continue;
                    Mesh workingMesh = EnsureWritableMeshInstance(smr);
                    var curBones = smr.bones;
                    if (curBones == null || curBones.Length == 0) continue;

                    var newBones = new Transform[curBones.Length];
                    bool anyMapped = false;
                    for (int b = 0; b < curBones.Length; b++)
                    {
                        var oldBone = curBones[b];
                        Transform mapped = oldBone;
                        if (oldBone != null)
                        {
                            string canon = GetCanonicalBoneName(oldBone.name);
                            if (mainBonesByName.TryGetValue(canon, out var mainBone) && mainBone != null)
                            {
                                mapped = mainBone;
                                anyMapped = true;
                            }
                        }
                        newBones[b] = mapped;
                    }
                    if (!anyMapped) continue;

                    Transform newRootBone = ResolveRootBoneSafe(smr.rootBone, newBones, mainBonesByName, hipsFallback);

                    if (rebuildBindposesForDirectSMR && workingMesh != null)
                    {
                        try { RebuildDirectSMRBindposes(smr, curBones, newBones, workingMesh); }
                        catch (System.Exception e) { Debug.LogWarning($"[XWearBinder] bindpose rebuild failed: {e.Message}", smr); }
                    }

                    smr.bones = newBones;
                    smr.rootBone = newRootBone;

                    if (validateRootBone && !IsBoneInArray(smr.rootBone, newBones))
                    {
                        smr.rootBone = hipsFallback != null && IsBoneInArray(hipsFallback, newBones) ? hipsFallback : newBones[0];
                    }

                    ApplyUnity6BoundsFix(smr);
                }

                // Reparent secondary bones AFTER geometry fitting so source bone positions remain pristine during fitting
                CharacterEditor.VrmImport.ClothingFitter.ReparentSecondaryBones(clothing, mainBonesByName);

                // For DirectSMRLink, when SetParent is skipped on Prefab instances,
                // link the clothing skeleton's humanoid bones so any non-reparented secondary bones follow animation!
                if (bindMode == BindMode.DirectSMRLink)
                {
                    var clothBones = new Dictionary<string, Transform>();
                    CollectBonesCanonically(clothing, clothBones);
                    foreach (var kvp in clothBones)
                    {
                        if (mainBonesByName.TryGetValue(kvp.Key, out var bodyBone))
                        {
                            if (bodyBone != mainCharacterRoot && kvp.Value != clothing)
                            {
                                if (!ContainsLink(kvp.Value))
                                {
                                    _links.Add(new BoneLink
                                    {
                                        bodyBone = bodyBone,
                                        clothBone = kvp.Value,
                                        bodyStartLocalRot = bodyBone.localRotation,
                                        clothStartLocalRot = kvp.Value.localRotation,
                                        isRootHips = kvp.Key.Contains("hips")
                                    });
                                }
                            }
                        }
                    }
                }

                // spring bone reparent
                var springs = clothing.GetComponentsInChildren<XWearSpringBone>(true);
                foreach (var cs in springs)
                {
                    if (cs.transform.parent != null)
                    {
                        string pc = GetCanonicalBoneName(cs.transform.parent.name);
                        if (mainBonesByName.TryGetValue(pc, out var np) && np != null)
                        {
                            if (cs.transform.parent != np)
                            {
                                Vector3 worldPos = cs.transform.position;
                                Quaternion worldRot = cs.transform.rotation;
                                Vector3 origLossy = cs.transform.lossyScale;
                                CharacterEditor.VrmImport.ClothingFitter.ReparentBoneCleanly(cs.transform, np, worldPos, worldRot, origLossy);
                            }
                        }
                    }
                    cs.Initialize(cs.transform);
                    if (!_springBones.Contains(cs)) _springBones.Add(cs);
                }
                var rgo = FindClothingSkeletonRoot(clothing);
                if (rgo != null && rgo != clothing) rgo.gameObject.SetActive(true);
            }

            if (bindMode == BindMode.SmartRetargeting || bindMode == BindMode.WorldPoseFollower || bindMode == BindMode.DirectSMRLink)
            {
                _links.Sort((a, b) => GetDepth(a.clothBone).CompareTo(GetDepth(b.clothBone)));
            }

            _mainCam = Camera.main;
            _isInitialized = true;
            }
        }

        static Mesh EnsureWritableMeshInstance(SkinnedMeshRenderer smr)
        {
            var m = smr.sharedMesh;
            if (m == null) return null;
            bool needClone = false;
#if UNITY_EDITOR
            needClone = UnityEditor.AssetDatabase.Contains(m);
#endif
            if (needClone)
            {
                var clone = UnityEngine.Object.Instantiate(m);
                CharacterEditor.VrmImport.ClothingFitter.RegisterClonedMesh(m, clone);
                CharacterEditor.VrmImport.ClothingAutoFitterV2.RegisterClonedMesh(m, clone);
                clone.name = m.name.Replace("_DirectSMRBound", "") + "_DirectSMRBound";
                clone.hideFlags = HideFlags.DontSave;
                smr.sharedMesh = clone;
                m = clone;
            }
            int id = m.GetInstanceID();
            if (!_originalMeshCache.ContainsKey(id)) _originalMeshCache[id] = m;
            CharacterEditor.VrmImport.ClothingFitter.GetOrCacheOriginalMesh(m);
            return m;
        }

        void RebuildDirectSMRBindposes(SkinnedMeshRenderer smr, Transform[] oldBones, Transform[] targetBones, Mesh targetMesh)
        {
            Mesh sourceMesh = targetMesh != null ? targetMesh : smr.sharedMesh;
            if (sourceMesh == null || targetBones == null || targetBones.Length == 0) return;

            Mesh reboundMesh = sourceMesh;
#if UNITY_EDITOR
            if (Application.isPlaying && UnityEditor.AssetDatabase.Contains(reboundMesh))
            {
                reboundMesh = UnityEngine.Object.Instantiate(sourceMesh);
                CharacterEditor.VrmImport.ClothingFitter.RegisterClonedMesh(sourceMesh, reboundMesh);
                CharacterEditor.VrmImport.ClothingAutoFitterV2.RegisterClonedMesh(sourceMesh, reboundMesh);
                reboundMesh.hideFlags = HideFlags.DontSave;
                smr.sharedMesh = reboundMesh;
            }
#endif
            if (!reboundMesh.name.EndsWith("_DirectSMRBound"))
                reboundMesh.name = sourceMesh.name + "_DirectSMRBound";

            bool fitEnabled = autoFitClothingToTargetBody || fitVerticesToTargetBody;
            XWearFitMode effectiveMode = fitEnabled ? xwearFitMode : XWearFitMode.BindOnly;

            if (effectiveMode == XWearFitMode.BindOnly)
            {
                CharacterEditor.VrmImport.ClothingFitter.RebuildBindposesOnly(smr, targetBones, reboundMesh);
            }
            else
            {
                var options = CharacterEditor.VrmImport.ClothingAutoFitterV2.FitOptions.Default;
                options.clothingType = autoFitType;
                options.fitStrength = autoFitStrength;
                options.cageFitStrength = autoFitCageStrength;
                options.skeletonFitStrength = autoFitSkeletonStrength;

                if (effectiveMode == XWearFitMode.CageOnly)
                {
                    // .xwear meshes are already in a valid VRoid rest pose. The old full
                    // skeleton matrix vertex fitting could collapse sleeves/torso when the
                    // target skeleton had different rest matrices. CageOnly keeps the mesh
                    // in place and only applies a clamped anatomical volume adjustment.
                    options.skeletonFitStrength = 0f;
                    options.cageFitStrength = Mathf.Min(options.cageFitStrength, Mathf.Clamp01(cageOnlyMaxCageStrength));
                }

                options.minCageScale = autoFitMinCageScale;
                options.maxCageScale = autoFitMaxCageScale;
                options.normalizeTargetScaleArtifacts = true;
                options.cloneMeshBeforeFit = false; // already using a working mesh instance
                options.useStableBounds = useLargeStableBounds;
                options.stableBoundsCenter = stableBoundsCenter;
                options.stableBoundsExtents = stableBoundsExtents;
                options.updateWhenOffscreen = forceUpdateWhenOffscreen;
                CharacterEditor.VrmImport.ClothingAutoFitterV2.FitSkinnedMeshToTarget(smr, oldBones, targetBones, reboundMesh, options);
            }
            smr.sharedMesh = reboundMesh;
        }

        void ApplyUnity6BoundsFix(SkinnedMeshRenderer smr)
        {
            if (smr == null || smr.sharedMesh == null) return;
            if (forceRecalculateBounds) { try { smr.sharedMesh.RecalculateBounds(); } catch {} }
            if (useLargeStableBounds)
                smr.localBounds = new Bounds(stableBoundsCenter, stableBoundsExtents * 2f);
            else
                smr.localBounds = smr.sharedMesh.bounds;
            if (forceUpdateWhenOffscreen) smr.updateWhenOffscreen = true;
            smr.quality = SkinQuality.Bone4;
            smr.skinnedMotionVectors = true;
            smr.allowOcclusionWhenDynamic = false;
            smr.forceMatrixRecalculationPerRender = true;
        }

        Transform ResolveRootBoneSafe(Transform originalRoot, Transform[] newBones, Dictionary<string, Transform> mainBones, Transform hipsFallback)
        {
            Transform candidate = originalRoot;
            if (candidate != null)
            {
                string rc = GetCanonicalBoneName(candidate.name);
                if (mainBones.TryGetValue(rc, out var mapped) && mapped != null) candidate = mapped;
            }
            if (candidate != null && IsBoneInArray(candidate, newBones)) return candidate;
            if (hipsFallback != null && IsBoneInArray(hipsFallback, newBones)) return hipsFallback;
            foreach (var b in newBones) if (b != null) { var n=b.name.ToLowerInvariant(); if (n.Contains("hips")||n.Contains("pelvis")||n.Contains("head")||n.Contains("root")) return b; }
            foreach (var b in newBones) if (b != null) return b;
            return originalRoot;
        }
        static bool IsBoneInArray(Transform t, Transform[] arr) { if (t==null||arr==null) return false; foreach(var a in arr) if(a==t) return true; return false; }
        bool ContainsLink(Transform clothBone) { for (int i = 0; i < _links.Count; i++) if (_links[i].clothBone == clothBone) return true; return false; }
        static int GetDepth(Transform t) { int d = 0; while (t != null) { d++; t = t.parent; } return d; }

        static void SetWorldScale(Transform t, Vector3 desiredWorldScale)
        {
            if (t == null) return;
            Vector3 parentScale = t.parent != null ? t.parent.lossyScale : Vector3.one;
            t.localScale = new Vector3(
                Mathf.Abs(parentScale.x) > 1e-6f ? desiredWorldScale.x / parentScale.x : desiredWorldScale.x,
                Mathf.Abs(parentScale.y) > 1e-6f ? desiredWorldScale.y / parentScale.y : desiredWorldScale.y,
                Mathf.Abs(parentScale.z) > 1e-6f ? desiredWorldScale.z / parentScale.z : desiredWorldScale.z
            );
        }

        static Transform FindClothingSkeletonRoot(Transform clothing)
        {
            if (clothing == null) return null;
            // .xwear importer roots
            var root = clothing.Find("RootGameObject") ?? clothing.Find("SkeletonRoot");
            if (root != null) return root;
            // VRM slot prefabs produced by VrmCharacterExtractor usually contain "Root".
            root = clothing.Find("Root") ?? clothing.Find("Armature");
            if (root != null) return root;

            // Last-resort heuristic: find the highest child that contains humanoid bones.
            foreach (Transform child in clothing)
            {
                string canon = GetCanonicalBoneName(child.name);
                if (!string.IsNullOrEmpty(canon) && (canon == "root" || canon == "c_hips" || canon.Contains("hips")))
                    return child;
                if (child.Find("J_Bip_C_Hips") != null || child.Find("Hips") != null)
                    return child;
            }
            return null;
        }

        void RepairClothingSMR(Transform clothing, bool restoreMeshAsset)
        {
            if (clothing == null) return;
            var rootGO = FindClothingSkeletonRoot(clothing);
            if (rootGO == null) return;
            rootGO.gameObject.SetActive(true);
            var clothBonesByName = new Dictionary<string, Transform>();
            CollectBonesCanonically(rootGO, clothBonesByName);
            var smrs = clothing.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            foreach (var smr in smrs)
            {
                if (restoreMeshAsset && smr.sharedMesh != null && smr.sharedMesh.name.EndsWith("_DirectSMRBound"))
                {
#if UNITY_EDITOR
                    string baseName = smr.sharedMesh.name.Replace("_DirectSMRBound", "");
                    var guids = UnityEditor.AssetDatabase.FindAssets(baseName + " t:Mesh");
                    if (guids.Length > 0)
                    {
                        var path = UnityEditor.AssetDatabase.GUIDToAssetPath(guids[0]);
                        var orig = UnityEditor.AssetDatabase.LoadAssetAtPath<Mesh>(path);
                        if (orig != null) smr.sharedMesh = orig;
                    }
#endif
                }
                var curBones = smr.bones; if (curBones == null) continue;
                var restored = new Transform[curBones.Length];
                for (int b=0;b<curBones.Length;b++)
                {
                    var cb = curBones[b];
                    if (cb != null)
                    {
                        string canon = GetCanonicalBoneName(cb.name);
                        if (clothBonesByName.TryGetValue(canon, out var native)) { restored[b]=native; continue; }
                    }
                    restored[b]=cb;
                }
                smr.bones = restored;
                if (smr.rootBone != null)
                {
                    string rc = GetCanonicalBoneName(smr.rootBone.name);
                    if (clothBonesByName.TryGetValue(rc, out var nr)) smr.rootBone = nr;
                }
                if (!Application.isPlaying && smr.sharedMesh != null)
                {
                    smr.localBounds = smr.sharedMesh.bounds;
                    smr.updateWhenOffscreen = false;
                }
            }
        }

        static void CollectBonesCanonically(Transform current, Dictionary<string, Transform> dict)
        {
            if (current == null) return;
            string canon = GetCanonicalBoneName(current.name);
            if (!string.IsNullOrEmpty(canon) && !dict.ContainsKey(canon)) dict[canon] = current;
            for (int i=0;i<current.childCount;i++) CollectBonesCanonically(current.GetChild(i), dict);
        }
        static void CollectBodyBonesCanonically(Transform current, Dictionary<string, Transform> dict, HashSet<Transform> excludedRoots)
        {
            if (current == null) return;
            if (excludedRoots != null && excludedRoots.Contains(current)) return;
            string canon = GetCanonicalBoneName(current.name);
            if (!string.IsNullOrEmpty(canon) && !dict.ContainsKey(canon)) dict[canon] = current;
            for (int i=0;i<current.childCount;i++) CollectBodyBonesCanonically(current.GetChild(i), dict, excludedRoots);
        }
        static string GetCanonicalBoneName(string rawName)
        {
            return CharacterEditor.VrmImport.ClothingFitter.GetCanonicalBoneName(rawName);
        }

        void LateUpdate()
        {
            if (!Application.isPlaying || !_isInitialized) return;
            if (bindMode == BindMode.SmartRetargeting)
            {
                for (int i=0;i<_links.Count;i++)
                {
                    var link = _links[i];
                    if (link.bodyBone==null||link.clothBone==null) continue;
                    if (link.isRootHips) link.clothBone.position = link.bodyBone.position;
                    Quaternion delta = link.bodyBone.localRotation * Quaternion.Inverse(link.bodyStartLocalRot);
                    link.clothBone.localRotation = delta * link.clothStartLocalRot;
                }
            }
            else if (bindMode == BindMode.WorldPoseFollower || bindMode == BindMode.DirectSMRLink)
            {
                for (int i=0;i<_links.Count;i++)
                {
                    var l=_links[i];
                    if (l.bodyBone!=null && l.clothBone!=null)
                    {
                        l.clothBone.position = l.bodyBone.position;
                        l.clothBone.rotation = l.bodyBone.rotation;
                    }
                }
            }
            if (optimizeFarPhysics && Time.frameCount % 30 == 0 && _mainCam != null)
            {
                float ds = (transform.position - _mainCam.transform.position).sqrMagnitude;
                bool far = ds > farDistanceThreshold*farDistanceThreshold;
                for (int s=0;s<_springBones.Count;s++) { var sb=_springBones[s]; if(sb!=null) sb.useCollisions=!far; }
            }
        }
    }
}
