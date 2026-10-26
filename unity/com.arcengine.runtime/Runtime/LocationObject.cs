// LocationObject.cs — one object of the location: the twin of the kit's record { def, mesh, error }.
// Def keeps the field names of Objects.js (x, y, h, rot, scale, tag, hidden, clip, anim, sound) —
// game code ports with the same names: rec.def.x -> rec.Def.x. The fields are live: change them and
// call Location3D.PlaceObject / SetHidden; anim, clip and sound are re-read every frame (Location3D.Tick).
using System;
using UnityEngine;

namespace ArcEngine
{
    // anim — spin of a model part. pivot and axisVec — in the object's local space (m), worked out
    // by the export from the FBX itself: the part turns about them, not about its Unity node axes.
    [Serializable]
    public class AnimDef
    {
        public string part = "";
        public string axis = "y";
        public float speed;                // rpm
        public string dir = "cw";          // 'cw' | 'ccw' — seen from the end of the axis
        public float[] pivot = new float[0];
        public float[] axisVec = new float[0];
    }

    [Serializable]
    public class SoundDef
    {
        public string src = "";
        public float volume = 1;
        public bool loop = true;
        public float falloffMin;           // px; 0 — AUDIO_FALLOFF_MIN
        public float falloffMax;           // px; 0 — AUDIO_FALLOFF_MAX
    }

    [Serializable]
    public class LocationObjectDef : IMapPoint
    {
        public string name = "object";
        public string model = "";
        public string kind = "prop";       // 'actor' | 'prop'
        public float x, y, h;              // map px; h — above the ground
        public float[] rot = { 0, 0, 0 };  // degrees: [1] — heading (0 — along +x, 90 — down the map)
        public float[] scale = { 1, 1, 1 };
        public string tag = "";
        public bool hidden;
        public string clip = "";
        public AnimDef anim = new AnimDef();
        public SoundDef sound = new SoundDef();

        public float X => x;
        public float Y => y;
    }

    public class LocationObject : MonoBehaviour
    {
        public LocationObjectDef Def = new LocationObjectDef();
        public string Error = "";          // the model did not load: the object stands without a mesh

        // The placed model root (the kit's rec.mesh): this object itself; null if the model is missing.
        public GameObject Mesh => this != null && string.IsNullOrEmpty(Error) ? gameObject : null;

        // Run-time state of Location3D.Tick (the kit's rec.spin, rec.clip, rec.sound).
        [NonSerialized] internal SpinState Spin;
        [NonSerialized] internal string ClipPlayed;
        [NonSerialized] internal Clips3D ClipTarget;
        [NonSerialized] internal SoundHandle Sound;
        [NonSerialized] internal string SoundKey = "";

        internal class SpinState
        {
            public string Name;
            public Transform Part;
            public Vector3 RestPos, Pivot, Axis;
            public Quaternion RestRot;
            public float Angle;            // degrees, Unity sign
        }
    }
}
