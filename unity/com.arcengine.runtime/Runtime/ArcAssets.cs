// ArcAssets.cs — the importer's registry of assets by their kit path: code keeps its literals
// ('assets/models/mill.fbx' -> the imported model, 'assets/sounds/step.wav' -> the AudioClip).
// A model's animation clips are entries 'path#clip'.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    public class ArcAssets : ScriptableObject
    {
        [Serializable] public class Entry { public string path; public UnityEngine.Object asset; }

        public List<Entry> entries = new List<Entry>();
        Dictionary<string, UnityEngine.Object> _map;
        int _built = -1;

        void OnValidate() { _map = null; }

        public T Get<T>(string path) where T : UnityEngine.Object
        {
            if (_map == null || _built != entries.Count)
            {
                _map = new Dictionary<string, UnityEngine.Object>();
                foreach (var e in entries) if (e.asset != null) _map[e.path] = e.asset;
                _built = entries.Count;
            }
            return path != null && _map.TryGetValue(path, out var a) ? a as T : null;
        }

        public List<AnimationClip> Clips(string path)
        {
            var list = new List<AnimationClip>();
            string prefix = (path ?? "") + "#";
            foreach (var e in entries) if (e.path.StartsWith(prefix) && e.asset is AnimationClip c) list.Add(c);
            return list;
        }

        public void Put(string path, UnityEngine.Object asset)
        {
            var e = entries.Find(x => x.path == path);
            if (e == null) entries.Add(new Entry { path = path, asset = asset });
            else e.asset = asset;
            _map = null;
        }
    }
}
