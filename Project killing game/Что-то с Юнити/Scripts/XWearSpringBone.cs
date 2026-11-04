// XWearSpringBone.cs
// Lightweight secondary physics for VRoid .xwear clothing/accessory bones.
// Unity 6 safe version:
// - runtime state is initialized automatically (private particle arrays are not serialized)
// - branched chains use the real parent index instead of a flat DFS "previous particle"
// - simulation result is applied to currentPosWorld, not back to the rest pose

using System;
using System.Collections.Generic;
using UnityEngine;

namespace XWearImporter
{
    [DisallowMultipleComponent]
    [AddComponentMenu("XWear/Spring Bone")]
    public class XWearSpringBone : MonoBehaviour
    {
        [Header("Pull / return force (0..1)")]
        [Range(0f, 1f)] public float pull = 0.5f;

        [Header("Per-segment stiffness (0..1)")]
        [Range(0f, 1f)] public float stiffness = 0.5f;

        [Header("Spring damping (0..1)")]
        [Range(0f, 1f)] public float spring = 0.5f;

        [Header("Gravity multiplier (0..1)")]
        [Range(0f, 1f)] public float gravity = 0f;

        [Header("Immobile threshold: chain freezes when displacement < this")]
        [Range(0f, 1f)] public float immobile = 0f;

        [Header("Maximum stretch (0..1)")]
        [Range(0f, 1f)] public float maxStretch = 0f;

        [Header("Maximum squish (0..1)")]
        [Range(0f, 1f)] public float maxSquish = 0f;

        [Header("Integration: 0=Verlet, 1=Semi-implicit Euler")]
        public int integrationType = 1;

        [Header("Maximum length change per segment per frame")]
        public float maxDeltaPerFrame = 0.05f;

        [Header("Bone collision radius")]
        public float radius = 0.01f;

        [Header("Runtime")]
        [Tooltip("Initialize automatically in play mode. Required because particle arrays are runtime-only and are not serialized into prefabs.")]
        public bool initializeOnEnable = true;

        [Header("Collisions")]
        [Tooltip("Enable collision detection against scene Colliders (body, walls, etc.).")]
        public bool useCollisions = true;

        [Tooltip("Radius around each particle used for the OverlapSphere query.")]
        public float collisionQueryRadius = 0.05f;

        [Tooltip("Layers to consider for collision.")]
        public LayerMask collisionLayers = ~0;

        private struct Particle
        {
            public Transform bone;
            public int parentIndex;
            public Vector3 restPosLocal;
            public Vector3 prevPosWorld;
            public Vector3 currentPosWorld;
        }

        private Particle[] _particles;
        private float[] _segmentLengths;
        private bool _initialized;
        private Transform _rootBone;
        private Vector3 _lastRootPosition;
        private Quaternion _lastRootRotation;

        private readonly Collider[] _overlapBuf = new Collider[32];

        void OnEnable()
        {
            if (initializeOnEnable && Application.isPlaying)
                Initialize(transform);
        }

        void Start()
        {
            if (initializeOnEnable && Application.isPlaying && !_initialized)
                Initialize(transform);
        }

        public void Initialize(Transform rootBone)
        {
            _rootBone = rootBone != null ? rootBone : transform;
            if (_rootBone == null) { _initialized = false; return; }

            var list = new List<Particle>();
            CollectBones(_rootBone, list, -1);
            _particles = list.ToArray();
            _segmentLengths = new float[_particles.Length];

            for (int i = 0; i < _particles.Length; i++)
            {
                var p = _particles[i];
                if (p.bone == null) continue;

                if (p.parentIndex < 0 || p.parentIndex >= _particles.Length || _particles[p.parentIndex].bone == null)
                {
                    _segmentLengths[i] = 0f;
                    p.restPosLocal = Vector3.zero;
                }
                else
                {
                    var parent = _particles[p.parentIndex].bone;
                    p.restPosLocal = parent.InverseTransformPoint(p.bone.position);
                    _segmentLengths[i] = Vector3.Distance(parent.position, p.bone.position);
                }

                p.currentPosWorld = p.bone.position;
                p.prevPosWorld = p.bone.position;
                _particles[i] = p;
            }

            _lastRootPosition = _rootBone.position;
            _lastRootRotation = _rootBone.rotation;
            _initialized = _particles.Length > 0;
        }

        private void CollectBones(Transform t, List<Particle> list, int parentIndex)
        {
            if (t == null) return;
            if (t != _rootBone && t.GetComponent<XWearSpringBone>() != null) return;

            int myIndex = list.Count;
            list.Add(new Particle { bone = t, parentIndex = parentIndex });

            for (int i = 0; i < t.childCount; i++)
                CollectBones(t.GetChild(i), list, myIndex);
        }

        void FixedUpdate()
        {
            if (!_initialized || _particles == null || _particles.Length == 0)
            {
                if (initializeOnEnable && Application.isPlaying)
                    Initialize(transform);
                return;
            }

            if (immobile > 0f && !NeedsUpdate()) return;

            float dt = Mathf.Max(Time.fixedDeltaTime, 0.0001f);
            float damping = Mathf.Clamp01(spring);

            // 1. Integrate every non-root particle.
            for (int i = 0; i < _particles.Length; i++)
            {
                var p = _particles[i];
                if (p.bone == null) continue;

                if (p.parentIndex < 0)
                {
                    p.currentPosWorld = p.bone.position;
                    p.prevPosWorld = p.bone.position;
                    _particles[i] = p;
                    continue;
                }

                Vector3 velocity = p.currentPosWorld - p.prevPosWorld;
                Vector3 force = Physics.gravity * gravity + ReturnForce(i);

                Vector3 newPos;
                if (integrationType == 0)
                {
                    // Verlet style.
                    newPos = p.currentPosWorld + velocity * (1f - damping) + force * (dt * dt);
                }
                else
                {
                    // Semi-implicit Euler style, kept intentionally conservative.
                    Vector3 v = velocity * (1f - damping) + force * dt;
                    newPos = p.currentPosWorld + v * dt;
                }

                Vector3 delta = newPos - p.currentPosWorld;
                if (maxDeltaPerFrame > 0f && delta.magnitude > maxDeltaPerFrame)
                    delta = delta.normalized * maxDeltaPerFrame;

                p.prevPosWorld = p.currentPosWorld;
                p.currentPosWorld += delta;
                _particles[i] = p;
            }

            // 2. Constraint pass. Use the real hierarchy parent, not the previous DFS item.
            const int iterations = 4;
            for (int iter = 0; iter < iterations; iter++)
            {
                for (int i = 1; i < _particles.Length; i++)
                {
                    var child = _particles[i];
                    int pi = child.parentIndex;
                    if (pi < 0 || pi >= _particles.Length) continue;

                    var parent = _particles[pi];
                    if (parent.bone == null || child.bone == null) continue;

                    Vector3 delta = child.currentPosWorld - parent.currentPosWorld;
                    float currentLen = delta.magnitude;
                    if (currentLen < 1e-5f) continue;

                    float restLen = Mathf.Max(_segmentLengths[i], 1e-5f);
                    float maxLen = restLen * (1f + Mathf.Max(0f, maxStretch));
                    float minLen = restLen * Mathf.Max(1e-3f, 1f - Mathf.Clamp01(maxSquish));
                    float targetLen = Mathf.Clamp(currentLen, minLen, maxLen);

                    Vector3 correction = delta * (targetLen / currentLen - 1f);
                    child.currentPosWorld += correction;
                    _particles[i] = child;
                }
            }

            // 3. Collision pass.
            if (useCollisions)
                ResolveCollisions();

            // 4. Apply simulation result to transforms. The previous version wrote
            // parent.TransformPoint(restPosLocal), which snapped every particle back
            // to bind pose and made spring bones visually inert.
            for (int i = 1; i < _particles.Length; i++)
            {
                var p = _particles[i];
                if (p.bone != null)
                    p.bone.position = p.currentPosWorld;
            }

            if (_rootBone != null)
            {
                _lastRootPosition = _rootBone.position;
                _lastRootRotation = _rootBone.rotation;
            }
        }

        private void ResolveCollisions()
        {
            float queryRadius = Mathf.Max(collisionQueryRadius, 0.001f);
            for (int i = 1; i < _particles.Length; i++)
            {
                var p = _particles[i];
                if (p.bone == null) continue;

                int hits = Physics.OverlapSphereNonAlloc(
                    p.currentPosWorld, queryRadius + radius,
                    _overlapBuf, collisionLayers, QueryTriggerInteraction.Ignore);

                for (int h = 0; h < hits; h++)
                {
                    Collider col = _overlapBuf[h];
                    if (col == null || col.transform == p.bone || col.transform.IsChildOf(_rootBone)) continue;

                    Vector3 closest = col.ClosestPoint(p.currentPosWorld);
                    Vector3 delta = p.currentPosWorld - closest;

                    float minDist = GetColliderRadius(col) + radius;
                    float dist = delta.magnitude;
                    if (dist < minDist && dist > 1e-5f)
                        p.currentPosWorld = closest + (delta / dist) * minDist;
                    else if (dist <= 1e-5f)
                        p.currentPosWorld = closest + Vector3.up * minDist;
                }
                _particles[i] = p;
            }
        }

        private static float GetColliderRadius(Collider c)
        {
            switch (c)
            {
                case SphereCollider sc:
                    return sc.radius * Mathf.Max(sc.transform.lossyScale.x, sc.transform.lossyScale.y, sc.transform.lossyScale.z);
                case CapsuleCollider cc:
                    return cc.radius * Mathf.Max(cc.transform.lossyScale.x, cc.transform.lossyScale.y, cc.transform.lossyScale.z);
                case BoxCollider bc:
                    return 0.5f * Mathf.Max(
                        bc.size.x * Mathf.Abs(bc.transform.lossyScale.x),
                        bc.size.y * Mathf.Abs(bc.transform.lossyScale.y),
                        bc.size.z * Mathf.Abs(bc.transform.lossyScale.z));
                case MeshCollider mc:
                    return 0.5f * Mathf.Max(mc.bounds.size.x, mc.bounds.size.y, mc.bounds.size.z);
                default:
                    return 0f;
            }
        }

        private Vector3 ReturnForce(int i)
        {
            var p = _particles[i];
            if (p.parentIndex < 0 || p.parentIndex >= _particles.Length) return Vector3.zero;
            var parent = _particles[p.parentIndex].bone;
            if (parent == null) return Vector3.zero;

            Vector3 restWorld = parent.TransformPoint(p.restPosLocal);
            Vector3 dir = restWorld - p.currentPosWorld;
            return dir * ((pull + stiffness) * 10f);
        }

        private bool NeedsUpdate()
        {
            if (_rootBone != null)
            {
                if ((_rootBone.position - _lastRootPosition).sqrMagnitude > immobile * immobile)
                    return true;
                if (Quaternion.Angle(_rootBone.rotation, _lastRootRotation) > immobile * 10f)
                    return true;
            }

            for (int i = 1; i < _particles.Length; i++)
            {
                if (_particles[i].bone == null) continue;
                if ((_particles[i].currentPosWorld - _particles[i].bone.position).sqrMagnitude > immobile * immobile)
                    return true;
            }
            return false;
        }

        void OnDrawGizmosSelected()
        {
            if (_particles == null || _particles.Length == 0) return;
            Gizmos.color = new Color(0.2f, 0.8f, 1f, 0.6f);
            for (int i = 1; i < _particles.Length; i++)
            {
                if (_particles[i].bone != null)
                    Gizmos.DrawWireSphere(_particles[i].bone.position, radius);
            }
        }
    }
}
