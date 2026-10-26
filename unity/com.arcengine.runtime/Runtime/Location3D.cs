// Location3D.cs — the location: ground (Terrain3D) and the objects the editor placed (Objects.js,
// built by the importer). The twin of js/Location3D.js: FindByTag, SetHidden, PlaceObject,
// AddObject, RemoveObject; Tick(dt) every frame (ArcApp) — part spin (def.anim), the looped clip
// (def.clip) and the sound (def.sound) of each object, exactly as the kit does it.
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    public class Location3D : MonoBehaviour
    {
        public Terrain3D Terrain;
        public Transform ObjectsRoot;
        public List<LocationObject> Objects = new List<LocationObject>();

        public float Width => Mathf.Max(64f, Arc.Const("LOCATION_WIDTH", 2048f));
        public float Height => Mathf.Max(64f, Arc.Const("LOCATION_HEIGHT", 2048f));

        float GroundAt(float x, float y) => Terrain ? Terrain.HeightAt(x, y) : 0f;

        // A record -> an object with its model (from the asset registry by def.model). No model —
        // an object without a mesh (Error), the scene goes on.
        public LocationObject AddObject(LocationObjectDef def)
        {
            var go = new GameObject(string.IsNullOrEmpty(def.name) ? "object" : def.name);
            go.transform.SetParent(ObjectsRoot ? ObjectsRoot : transform, false);
            var rec = go.AddComponent<LocationObject>();
            rec.Def = def;
            Objects.Add(rec);
            if (Model3D.Build(def.model, go.transform) == null)
            {
                rec.Error = "нет модели " + def.model;
                Debug.LogWarning("Location3D: не загрузилась модель " + def.model);
            }
            PlaceObject(rec);
            ApplyHidden(rec);
            return rec;
        }

        // From the record: on the ground + h, rot [x, y, z]°, scale [x, y, z] (ArcSpace).
        public void PlaceObject(LocationObject rec)
        {
            if (!rec) return;
            var d = rec.Def;
            var t = rec.transform;
            t.position = ArcSpace.ToWorld(d.x, d.y, GroundAt(d.x, d.y) + d.h);
            t.rotation = ArcSpace.Rotation(d.rot);
            var s = d.scale != null && d.scale.Length >= 3 ? d.scale : new float[] { 1, 1, 1 };
            t.localScale = new Vector3(s[0] > 0 ? s[0] : 1, s[1] > 0 ? s[1] : 1, s[2] > 0 ? s[2] : 1);
        }

        public void PlaceObjects()
        {
            foreach (var rec in Objects) PlaceObject(rec);
        }

        // Objects with def.tag == tag, in list order; none — an empty list.
        public List<LocationObject> FindByTag(string tag)
        {
            var list = new List<LocationObject>();
            if (string.IsNullOrEmpty(tag)) return list;
            foreach (var rec in Objects) if (rec && rec.Def.tag == tag) list.Add(rec);
            return list;
        }

        // Placed but not in the scene — no mesh in the frame, no sound — until SetHidden(rec, false).
        public void SetHidden(LocationObject rec, bool hidden)
        {
            if (!rec) return;
            rec.Def.hidden = hidden;
            ApplyHidden(rec);
        }

        public void ApplyHidden(LocationObject rec)
        {
            if (rec) rec.gameObject.SetActive(!rec.Def.hidden);
        }

        public void RemoveObject(LocationObject rec)
        {
            if (!rec) return;
            Objects.Remove(rec);
            if (rec.Sound != null) rec.Sound.Stop();
            rec.Sound = null;
            if (Application.isPlaying) Destroy(rec.gameObject); else DestroyImmediate(rec.gameObject);
        }

        // Every frame before the camera (ArcApp): what the records ask for.
        public void Tick(float dt)
        {
            dt = Mathf.Clamp(dt, 0f, 0.1f);
            for (int i = 0; i < Objects.Count; i++)
            {
                var rec = Objects[i];
                if (!rec) continue;
                SpinPart(rec, dt);
                PlayClip(rec);
                UpdateSound(rec);
            }
        }

        // def.sound: looped unless loop is false, standing at the object. Restarted when the file or
        // the loop mode changes; volume and radii apply on the fly; a hidden object is silent.
        void UpdateSound(LocationObject rec)
        {
            var s = rec.Def.sound;
            bool on = s != null && !string.IsNullOrEmpty(s.src) && !rec.Def.hidden;
            string key = on ? s.src + (s.loop ? "|loop" : "|once") : "";
            if (key != (rec.SoundKey ?? ""))
            {
                if (rec.Sound != null) rec.Sound.Stop();
                rec.Sound = on ? Sound3D.Play(s.src, new SoundOptions
                {
                    At = rec.Def, Node = rec.transform, Loop = s.loop, Volume = s.volume,
                    FalloffMin = s.falloffMin, FalloffMax = s.falloffMax,
                }) : null;
                rec.SoundKey = key;
            }
            else if (rec.Sound != null && rec.Sound.Playing)
            {
                rec.Sound.SetVolume(s.volume);
                rec.Sound.FalloffMin = Mathf.Max(0f, s.falloffMin);
                rec.Sound.FalloffMax = Mathf.Max(0f, s.falloffMax);
            }
        }

        // def.clip — the looped clip; acts only when the field CHANGES, so game code may drive the same
        // model: Model3D.Clips(rec.Mesh).Play("run").
        void PlayClip(LocationObject rec)
        {
            string want = rec.Mesh ? (rec.Def.clip ?? "") : "";
            var clips = rec.Mesh ? Model3D.Clips(rec.Mesh) : null;
            if (rec.ClipPlayed == want && rec.ClipTarget == clips) return;
            if (clips)
            {
                if (want != "" && clips.Has(want)) clips.Play(want);
                else if (!string.IsNullOrEmpty(rec.ClipPlayed)) clips.Stop();
            }
            rec.ClipPlayed = want;
            rec.ClipTarget = clips;
        }

        // def.anim: the part spins about the export's pivot and axis (object space), speed in rpm,
        // dir seen from the axis end. The kit's scene was right-handed, Unity's is its mirror image:
        // the angle changes sign, what is seen on screen does not.
        void SpinPart(LocationObject rec, float dt)
        {
            var a = rec.Def.anim;
            string name = a != null && rec.Mesh ? (a.part ?? "") : "";
            var s = rec.Spin;
            if (s != null && s.Name != name)
            {
                if (s.Part) { s.Part.position = rec.transform.TransformPoint(s.RestPos); s.Part.rotation = rec.transform.rotation * s.RestRot; }
                s = rec.Spin = null;
            }
            if (name == "") return;
            if (s == null)
            {
                s = rec.Spin = new LocationObject.SpinState { Name = name, Part = FindPart(rec.transform, name) };
                if (s.Part)
                {
                    s.RestPos = rec.transform.InverseTransformPoint(s.Part.position);
                    s.RestRot = Quaternion.Inverse(rec.transform.rotation) * s.Part.rotation;
                    bool given = a.pivot != null && a.pivot.Length == 3 && a.axisVec != null && a.axisVec.Length == 3;
                    s.Pivot = given ? new Vector3(a.pivot[0], a.pivot[1], a.pivot[2]) : s.RestPos;
                    s.Axis = given ? new Vector3(a.axisVec[0], a.axisVec[1], a.axisVec[2]) : AxisOf(s.Part, a.axis, rec.transform);
                }
            }
            if (!s.Part || s.Axis.sqrMagnitude < 1e-12f) return;
            float turn = Mathf.Max(0f, a.speed) * 6f * (a.dir == "ccw" ? 1f : -1f);   // rpm -> °/s, kit sign
            s.Angle = (s.Angle - turn * dt) % 360f;                                      // mirrored world
            var spin = Quaternion.AngleAxis(s.Angle, s.Axis.normalized);
            s.Part.position = rec.transform.TransformPoint(s.Pivot + spin * (s.RestPos - s.Pivot));
            s.Part.rotation = rec.transform.rotation * spin * s.RestRot;
        }

        static Transform FindPart(Transform root, string name)
        {
            foreach (var t in root.GetComponentsInChildren<Transform>(true)) if (t.name == name) return t;
            return null;
        }

        // No axis from the export (a model the export could not read): the part's own node axis.
        static Vector3 AxisOf(Transform part, string axis, Transform root)
        {
            var c = string.IsNullOrEmpty(axis) ? 'y' : axis[axis.Length - 1];
            var v = c == 'x' ? part.right : c == 'z' ? part.forward : part.up;
            if (!string.IsNullOrEmpty(axis) && axis[0] == '-') v = -v;
            return Quaternion.Inverse(root.rotation) * v;
        }
    }
}
