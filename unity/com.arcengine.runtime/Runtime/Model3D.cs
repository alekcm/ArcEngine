// Model3D.cs — models by their kit path: Build puts the imported prefab under an object, Clips
// gives its animation clips (the twin of Model3D.clips(rec.mesh)).
// FIT: the kit's model axes differ from what the Unity importers give. Both importers mirror X to
// get a left-handed model (glTFast for glTF, Unity's own for FBX); the kit's world is the Unity world
// mirrored in Z (ArcSpace). A glTF also turns by 90° (glTF front +Z -> the kit's nose +X, Gltf3D.build).
// So a "model" node between the object and the prefab: FBX — 180° about Y, glTF — 90° about Y.
// The importer checks the result against model bounds the export computed in JS.
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    public static class Model3D
    {
        public static bool IsGltf(string path)
        {
            var p = (path ?? "").ToLowerInvariant();
            return p.EndsWith(".glb") || p.EndsWith(".gltf");
        }

        public static Quaternion FitRotation(string path)
        {
            return IsGltf(path) ? Quaternion.Euler(0f, 90f, 0f) : Quaternion.Euler(0f, 180f, 0f);
        }

        // The clips of a built model; null when it has none (FBX) or is not there yet.
        public static Clips3D Clips(GameObject root)
        {
            return root ? root.GetComponentInChildren<Clips3D>(true) : null;
        }

        // The prefab of path (Arc.Assets) under parent: parent/"model" (fit) /instance. null — no model.
        public static GameObject Build(string path, Transform parent)
        {
            var prefab = Arc.Assets ? Arc.Assets.Get<GameObject>(path) : null;
            if (!prefab) return null;
            var fit = FitNode(path, parent);
            var inst = Object.Instantiate(prefab, fit, false);
            inst.name = prefab.name;
            AttachClips(inst, path);
            return fit.gameObject;
        }

        public static Transform FitNode(string path, Transform parent)
        {
            var fit = new GameObject("model").transform;
            fit.SetParent(parent, false);
            fit.localRotation = FitRotation(path);
            return fit;
        }

        // The model's clips from the registry (path#clip) -> a Clips3D next to its Animator.
        public static void AttachClips(GameObject inst, string path)
        {
            var clips = Arc.Assets ? Arc.Assets.Clips(path) : new List<AnimationClip>();
            if (clips.Count == 0) return;
            var animator = inst.GetComponent<Animator>();
            if (!animator) animator = inst.AddComponent<Animator>();
            animator.runtimeAnimatorController = null;
            animator.applyRootMotion = false;
            var c = inst.GetComponent<Clips3D>();
            if (!c) c = inst.AddComponent<Clips3D>();
            c.clips = clips;
        }
    }
}
