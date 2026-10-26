// Clips3D.cs — animation clips of a model by name: the twin of the kit's Clips3D (Gltf3D.js).
// Play("run") cross-fades from whatever is playing over MODEL_CLIP_BLEND_SEC: the current clip's
// weight rises to 1, the rest fall to 0, the sum is kept at 1; calling Play with the current clip
// every frame is fine. Built on Playables (a mixer into the model's Animator, no controller):
// the clips are the GLB's own (glTFast, Mecanim), the weights are this class's, like the kit's.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace ArcEngine
{
    public class ClipOptions
    {
        public bool Loop = true;
        public float Speed = 1f;
        public float Blend = -1f;          // < 0 — MODEL_CLIP_BLEND_SEC
        public string Then = "";           // the clip to play after a non-looped one ends
    }

    public class Clips3D : MonoBehaviour
    {
        public List<AnimationClip> clips = new List<AnimationClip>();

        public string Current { get; private set; } = "";

        class Track
        {
            public AnimationClip Clip;
            public AnimationClipPlayable Playable;
            public int Input;
            public float Weight;
            public double Time;
            public float Speed = 1f;
            public bool Loop = true, Playing;
        }

        List<Track> _tracks;
        PlayableGraph _graph;
        AnimationMixerPlayable _mixer;
        float _blend = 0.2f;
        string _then = "";

        public static float BlendSec() => Arc.Const("MODEL_CLIP_BLEND_SEC", 0.2f);

        public List<string> Names()
        {
            var list = new List<string>();
            foreach (var c in clips) if (c) list.Add(c.name);
            return list;
        }

        public bool Has(string name) => clips.Exists(c => c && c.name == name);

        // false — the model has no such clip.
        public bool Play(string name, ClipOptions opts = null)
        {
            if (!Ensure()) return false;
            var t = _tracks.Find(x => x.Clip.name == name);
            if (t == null) return false;
            var o = opts ?? new ClipOptions();
            float speed = o.Speed > 0 ? o.Speed : 1f;
            _blend = o.Blend >= 0 ? o.Blend : BlendSec();
            _then = o.Loop ? "" : (o.Then ?? "");
            if (Current != name || !t.Playing)
            {
                bool first = !_tracks.Exists(x => x.Weight > 0);
                t.Time = 0;
                t.Playing = true;
                t.Loop = o.Loop;
                t.Speed = speed;
                if (first) t.Weight = 1f;
            }
            else
            {
                t.Speed = speed;
            }
            Current = name;
            return true;
        }

        // Everything stops: the model returns to its rest pose.
        public void Stop()
        {
            Current = "";
            if (_tracks == null) return;
            foreach (var t in _tracks) { t.Weight = 0; t.Playing = false; t.Time = 0; }
            Apply();
        }

        bool Ensure()
        {
            if (_tracks != null) return true;
            if (!Application.isPlaying) return false;
            var animator = GetComponent<Animator>();
            if (!animator) animator = gameObject.AddComponent<Animator>();
            _tracks = new List<Track>();
            _graph = PlayableGraph.Create(name + "/clips");
            _graph.SetTimeUpdateMode(DirectorUpdateMode.Manual);
            var valid = clips.FindAll(c => c);
            _mixer = AnimationMixerPlayable.Create(_graph, valid.Count);
            var output = AnimationPlayableOutput.Create(_graph, "clips", animator);
            output.SetSourcePlayable(_mixer);
            for (int i = 0; i < valid.Count; i++)
            {
                var p = AnimationClipPlayable.Create(_graph, valid[i]);
                p.SetApplyFootIK(false);
                _graph.Connect(p, 0, _mixer, i);
                _mixer.SetInputWeight(i, 0f);
                _tracks.Add(new Track { Clip = valid[i], Playable = p, Input = i });
            }
            _graph.Play();
            return true;
        }

        void Update()
        {
            if (_tracks != null) Tick(Time.deltaTime);
        }

        void Tick(float dt)
        {
            string next = null;
            foreach (var t in _tracks)
            {
                if (!t.Playing) continue;
                t.Time += dt * t.Speed;
                double len = t.Clip.length;
                if (t.Loop) { if (len > 0) t.Time %= len; }
                else if (t.Time >= len)
                {
                    t.Time = len;
                    t.Playing = false;
                    if (Current == t.Clip.name && _then != "") next = _then;
                }
            }
            if (next != null) Play(next);
            if (Current != "")
            {
                float step = _blend > 0 ? Mathf.Max(0f, dt) / _blend : 1f;
                foreach (var t in _tracks) t.Weight = Mathf.Clamp01(t.Weight + (t.Clip.name == Current ? step : -step));
            }
            Apply();
        }

        void Apply()
        {
            float sum = 0;
            foreach (var t in _tracks) sum += t.Weight;
            foreach (var t in _tracks)
            {
                if (t.Weight <= 0 && t.Clip.name != Current) t.Playing = false;
                _mixer.SetInputWeight(t.Input, sum > 0 ? t.Weight / sum : 0f);
                t.Playable.SetTime(t.Time);
            }
            _graph.Evaluate(0f);
        }

        void OnDestroy()
        {
            if (_graph.IsValid()) _graph.Destroy();
        }
    }
}
