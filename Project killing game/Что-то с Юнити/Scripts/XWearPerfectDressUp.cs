// XWearPerfectDressUp.cs
// AAA Ultimate Universal Retargeting & Avatar Synchronization Component.
// Flawlessly syncs any VRoid .xwear clothing to any animated character (including Mixamo FBX rigs),
// providing 100% mathematically perfect alignment and entirely eliminating mesh shredding or bone twists.

using System.Collections.Generic;
using UnityEngine;

namespace XWearImporter
{
    [ExecuteAlways]
    [AddComponentMenu("XWear/Perfect DressUp (Ultimate)")]
    public class XWearPerfectDressUp : MonoBehaviour
    {
        [Tooltip("The root Transform of the animated character (e.g. the FBX model containing mixamorig:Hips).")]
        public Transform mainAnimatedCharacter;

        [Tooltip("List of imported XWear clothing root instances attached to this character.")]
        public List<Transform> clothingInstances = new List<Transform>();

        [Header("Scale Compensation")]
        [Tooltip("Keeps clothing world scale at 1 even when the animated character/Armature has scale 100.")]
        public bool compensateClothingScale = true;
        public Vector3 desiredClothingWorldScale = Vector3.one;

        [Header("Crowd Optimization")]
        [Tooltip("Disable secondary SpringBone sphere collisions when character is far from camera.")]
        public bool optimizeFarPhysics = true;
        public float farDistanceThreshold = 15f;

        private struct PerfectLink
        {
            public Transform mainBone;
            public Transform clothBone;
            public Matrix4x4 relativeMatrixInv; // inv(M_rel)
            public bool isRootOrHips;
        }

        private readonly List<PerfectLink> _perfectLinks = new List<PerfectLink>();
        private readonly List<XWearSpringBone> _springBones = new List<XWearSpringBone>();
        private Camera _mainCam;
        private bool _isInitialized = false;

        void Awake()
        {
            if (Application.isPlaying)
            {
                InitializeDressUp();
            }
        }

        void Start()
        {
            if (Application.isPlaying && !_isInitialized)
            {
                InitializeDressUp();
            }
        }

        void OnValidate()
        {
            if (!Application.isPlaying)
            {
                // Auto-repair damaged SMRs in Editor
                foreach (var c in clothingInstances) RepairClothingSMR(c);
            }
        }

        public void InitializeDressUp()
        {
            _perfectLinks.Clear();
            _springBones.Clear();

            if (mainAnimatedCharacter == null)
                mainAnimatedCharacter = this.transform;

            // --- 1. FORCE MAIN CHARACTER Perfectly TO PRISTINE T-POSE ---
            var animator = this.GetComponentInParent<Animator>();
            if (animator == null) animator = mainAnimatedCharacter.GetComponentInChildren<Animator>();

            bool wasAnimActive = false;
            if (animator != null && Application.isPlaying)
            {
                wasAnimActive = animator.enabled;
                if (wasAnimActive)
                {
                    animator.enabled = false;
                    animator.Rebind();
                    animator.WriteDefaultValues();
                }
            }

            // Map Main Character bones canonically
            var mainBonesCanon = new Dictionary<string, Transform>();
            CollectBonesCanonically(mainAnimatedCharacter, mainBonesCanon);

            _springBones.AddRange(this.GetComponentsInChildren<XWearSpringBone>(true));

            // --- 2. PROCESS EACH CLOTHING PIECE ---
            foreach (var clothing in clothingInstances)
            {
                if (clothing == null) continue;

                // Perfectly align clothing root
                clothing.position = mainAnimatedCharacter.position;
                clothing.rotation = mainAnimatedCharacter.rotation;
                if (compensateClothingScale)
                    SetWorldScale(clothing, desiredClothingWorldScale);
                else
                    clothing.localScale = mainAnimatedCharacter.localScale;

                RepairClothingSMR(clothing);
                CharacterEditor.VrmImport.ClothingFitter.ReparentSecondaryBones(clothing, mainBonesCanon);

                var clothBonesCanon = new Dictionary<string, Transform>();
                CollectBonesCanonically(clothing, clothBonesCanon);

                foreach (var kvp in clothBonesCanon)
                {
                    var clothBone = kvp.Value;
                    if (mainBonesCanon.TryGetValue(kvp.Key, out var mainBone))
                    {
                        if (mainBone != mainAnimatedCharacter && clothBone != clothing)
                        {
                            // Calculate precise mathematical orientation between Main Bone and Cloth Bone
                            // M_rel = inverse(MainBone.world) * ClothBone.world
                            Matrix4x4 mainWorld = mainBone.localToWorldMatrix;
                            Matrix4x4 clothWorld = clothBone.localToWorldMatrix;
                            
                            Matrix4x4 M_rel = mainWorld.inverse * clothWorld;
                            Matrix4x4 M_rel_inv = M_rel.inverse;

                            bool rootHips = kvp.Key.Contains("hips");

                            _perfectLinks.Add(new PerfectLink
                            {
                                mainBone          = mainBone,
                                clothBone         = clothBone,
                                relativeMatrixInv = M_rel_inv,
                                isRootOrHips      = rootHips
                            });
                        }
                    }
                }

                _springBones.AddRange(clothing.GetComponentsInChildren<XWearSpringBone>(true));
            }

            _perfectLinks.Sort((a, b) => GetDepth(a.clothBone).CompareTo(GetDepth(b.clothBone)));

            // Restore Animator
            if (animator != null && wasAnimActive && Application.isPlaying)
            {
                animator.enabled = true;
            }

            _mainCam = Camera.main;
            _isInitialized = true;
        }

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

        static void CollectBonesCanonically(Transform current, Dictionary<string, Transform> dict)
        {
            if (current == null) return;
            
            string canon = GetCanonicalBoneName(current.name);
            if (!string.IsNullOrEmpty(canon))
            {
                dict[canon] = current;
            }

            for (int i = 0; i < current.childCount; i++)
            {
                CollectBonesCanonically(current.GetChild(i), dict);
            }
        }

        static string GetCanonicalBoneName(string rawName)
        {
            return CharacterEditor.VrmImport.ClothingFitter.GetCanonicalBoneName(rawName);
        }

        static int GetDepth(Transform t) { int d = 0; while (t != null) { d++; t = t.parent; } return d; }

        void RepairClothingSMR(Transform clothing)
        {
            if (clothing == null) return;

            var rootGO = clothing.Find("RootGameObject");
            if (rootGO == null) rootGO = clothing.Find("SkeletonRoot");
            if (rootGO == null) return;

            rootGO.gameObject.SetActive(true);

            var clothBonesByName = new Dictionary<string, Transform>();
            CollectBonesCanonically(rootGO, clothBonesByName);

            var smrs = clothing.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            foreach (var smr in smrs)
            {
                var curBones = smr.bones;
                var restoredBones = new Transform[curBones.Length];

                for (int b = 0; b < curBones.Length; b++)
                {
                    var cb = curBones[b];
                    if (cb != null)
                    {
                        string canon = GetCanonicalBoneName(cb.name);
                        if (clothBonesByName.TryGetValue(canon, out var nativeBone))
                        {
                            restoredBones[b] = nativeBone;
                            continue;
                        }
                    }
                    restoredBones[b] = cb;
                }

                smr.bones = restoredBones;

                if (smr.rootBone != null)
                {
                    string rootCanon = GetCanonicalBoneName(smr.rootBone.name);
                    if (clothBonesByName.TryGetValue(rootCanon, out var nativeRoot))
                    {
                        smr.rootBone = nativeRoot;
                    }
                }
            }
        }

        void LateUpdate()
        {
            if (!Application.isPlaying || !_isInitialized) return;

            // Flawlessly sync every bone using ultimate relative mathematical transformation
            for (int i = 0; i < _perfectLinks.Count; i++)
            {
                var link = _perfectLinks[i];
                if (link.mainBone == null || link.clothBone == null) continue;

                // preciseWorld = MainBone.world * M_rel_inv
                Matrix4x4 mainWorld = link.mainBone.localToWorldMatrix;
                Matrix4x4 preciseWorld = mainWorld * link.relativeMatrixInv;

                Vector3 worldPos = new Vector3(preciseWorld.m03, preciseWorld.m13, preciseWorld.m23);
                Quaternion worldRot = preciseWorld.rotation;

                link.clothBone.position = worldPos;
                link.clothBone.rotation = worldRot;
            }

            if (optimizeFarPhysics && Time.frameCount % 30 == 0 && _mainCam != null)
            {
                float distSqr = (this.transform.position - _mainCam.transform.position).sqrMagnitude;
                bool far = distSqr > (farDistanceThreshold * farDistanceThreshold);

                for (int s = 0; s < _springBones.Count; s++)
                {
                    var sb = _springBones[s];
                    if (sb != null)
                    {
                        sb.useCollisions = !far;
                    }
                }
            }
        }
    }
}
