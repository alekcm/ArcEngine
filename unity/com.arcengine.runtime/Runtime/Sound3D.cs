// Sound3D.cs — the twin of js/Sound3D.js: effects, music, sounds that stand on the map. The path is
// the same literal as in JS ('assets/sounds/step.wav'): the importer registered the clip under it.
// The listener stands WHERE THE CAMERA IS; volume — full within falloffMin, linearly down to silence
// at falloffMax (3D distance: the audible region is a sphere); pan — by the side of the SCREEN.
// The math is the kit's own (Spatial), so a sound is as loud here as in the browser; each handle
// is a 2D AudioSource whose volume and pan this class sets every frame. Unity's own 3D sound
// (spatialBlend = 1, linear rolloff, min/maxDistance = falloff / 100) is the idiomatic swap.
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    public class SoundOptions
    {
        public float Volume = 1f;
        public bool Loop;
        public string Channel = "sfx";      // 'sfx' | 'music'
        public float? X, Y;                 // map px: the sound stands at that point
        public IMapPoint At;                // a live point: the sound follows it
        public float FalloffMin, FalloffMax; // px; 0 — AUDIO_FALLOFF_MIN / MAX
        public Transform Node;              // its world position wins over X/Y and At
    }

    public class SoundHandle
    {
        public readonly string Src;
        public readonly string Channel;
        public readonly bool Loop;
        public float Volume { get; private set; }
        public float FalloffMin, FalloffMax;
        public IMapPoint At;
        public Transform Node;
        public bool Playing { get; private set; } = true;
        internal AudioSource Source;
        readonly bool _placed;
        readonly float _x, _y;

        internal SoundHandle(string src, SoundOptions o)
        {
            Src = src;
            Channel = o.Channel == "music" ? "music" : "sfx";
            Loop = o.Loop;
            Volume = Mathf.Clamp01(o.Volume);
            At = o.At;
            Node = o.Node;
            FalloffMin = Mathf.Max(0f, o.FalloffMin);
            FalloffMax = Mathf.Max(0f, o.FalloffMax);
            _placed = At != null || Node != null || (o.X.HasValue && o.Y.HasValue);
            _x = o.X ?? 0f;
            _y = o.Y ?? 0f;
        }

        public bool Spatial => _placed;

        // Where the sound stands: map (x, y, h) px.
        public Vector3 Where()
        {
            if (Node) return ArcSpace.ToMap(Node.position);
            if (At != null) return new Vector3(At.X, At.Y, 0f);
            return new Vector3(_x, _y, 0f);
        }

        public SoundHandle SetVolume(float v)
        {
            Volume = Mathf.Clamp01(v);
            return this;
        }

        public void Stop()
        {
            if (!Playing) return;
            Playing = false;
            Sound3D.Release(this);
        }
    }

    public static class Sound3D
    {
        public static bool Muted { get; private set; }

        // Where sounds are heard from: map (x, y, h) px and the camera azimuth (rad).
        public static Vector3? Listener;
        public static float ListenerAzimuth;

        static readonly List<SoundHandle> _playing = new List<SoundHandle>();
        static SoundHandle _music;
        static GameObject _host;

        public struct Cfg { public float master, music, sfx, min, max, pan; }

        public static Cfg Config() => new Cfg
        {
            master = Arc.Const("AUDIO_MASTER_VOLUME", 0.8f),
            music = Arc.Const("AUDIO_MUSIC_VOLUME", 0.6f),
            sfx = Arc.Const("AUDIO_SFX_VOLUME", 1f),
            min = Arc.Const("AUDIO_FALLOFF_MIN", 150f),
            max = Arc.Const("AUDIO_FALLOFF_MAX", 1024f),
            pan = Arc.Const("AUDIO_PAN", 0.7f),
        };

        // Starts at once; a missing file — a warning and a silent handle, the game goes on.
        public static SoundHandle Play(string src, SoundOptions opts = null)
        {
            var h = new SoundHandle(src, opts ?? new SoundOptions());
            var clip = Arc.Assets ? Arc.Assets.Get<AudioClip>(src) : null;
            if (!clip || !Application.isPlaying)
            {
                if (!clip) Debug.LogWarning("Sound3D: не загрузился звук " + src);
                h.Stop();
                return h;
            }
            if (!_host)
            {
                _host = new GameObject("Sound3D");
                Object.DontDestroyOnLoad(_host);
            }
            var s = h.Source = _host.AddComponent<AudioSource>();
            s.clip = clip;
            s.loop = h.Loop;
            s.playOnAwake = false;
            s.spatialBlend = 0f;
            _playing.Add(h);
            Place(h, Config());
            s.Play();
            return h;
        }

        // The one looped background track; Music(null) — silence; the same track keeps playing.
        public static SoundHandle Music(string src, SoundOptions opts = null)
        {
            if (_music != null && _music.Playing && _music.Src == src) return _music;
            if (_music != null) _music.Stop();
            if (string.IsNullOrEmpty(src)) { _music = null; return null; }
            var o = opts ?? new SoundOptions();
            o.Loop = true;
            o.Channel = "music";
            return _music = Play(src, o);
        }

        public static void StopAll()
        {
            foreach (var h in _playing.ToArray()) h.Stop();
        }

        public static void SetMuted(bool on) => Muted = on;

        // Every frame after the camera (ArcApp): the listener, ended sounds, volumes and pans.
        public static void Update(CameraController camera)
        {
            if (camera && camera.Cam)
            {
                Listener = ArcSpace.ToMap(camera.Cam.transform.position);
                ListenerAzimuth = camera.Azimuth;
            }
            var c = Config();
            for (int i = _playing.Count - 1; i >= 0; i--)
            {
                var h = _playing[i];
                if (!h.Source || (!h.Loop && !h.Source.isPlaying)) { h.Stop(); continue; }
                Place(h, c);
            }
        }

        static void Place(SoundHandle h, Cfg c)
        {
            float level = h.Volume, pan = 0f;
            if (h.Spatial && Listener.HasValue)
            {
                var s = Spatial(h.Where(), Listener.Value, ListenerAzimuth,
                    h.FalloffMin > 0 ? h.FalloffMin : c.min, h.FalloffMax > 0 ? h.FalloffMax : c.max, c.pan);
                level *= s.x;
                pan = s.y;
            }
            float bus = h.Channel == "music" ? c.music : c.sfx;
            h.Source.volume = Muted ? 0f : Mathf.Clamp01(level * bus * c.master);
            h.Source.panStereo = Mathf.Clamp(pan, -1f, 1f);
        }

        internal static void Release(SoundHandle h)
        {
            _playing.Remove(h);
            if (h.Source)
            {
                h.Source.Stop();
                Object.Destroy(h.Source);
            }
            h.Source = null;
        }

        // The kit's math (js/Sound3D.js spatial): source and listener — map (x, y, h) px, the
        // listener's camera azimuth in rad. Returns (gain, pan).
        public static Vector2 Spatial(Vector3 source, Vector3 listener, float azimuth, float min, float max, float width)
        {
            float dx = source.x - listener.x, dy = source.y - listener.y, dh = source.z - listener.z;
            float d = Mathf.Sqrt(dx * dx + dy * dy + dh * dh), flat = Mathf.Sqrt(dx * dx + dy * dy);
            float far = Mathf.Max(0f, max), near = min < far ? Mathf.Max(0f, min) : 0f;
            float gain = d <= near ? 1f : far > near ? Mathf.Max(0f, (far - d) / (far - near)) : 0f;
            float side = flat > 0 ? (-dx * Mathf.Sin(azimuth) + dy * Mathf.Cos(azimuth)) / flat : 0f;
            float pan = side * Mathf.Min(1f, d / Mathf.Max(1f, near != 0 ? near : far)) * width;
            return new Vector2(gain, pan);
        }
    }
}
