// CameraController.cs — the twin of the kit's game camera (CameraControl.js): target on the map,
// azimuth, pitch, zoom (screen px per world px at the target: dist = H / (2·tan(fov/2)·zoom)),
// Follow / Home / LookAt / Shake, the same CAMERA_* constants and the same frame math, so the
// prototype is framed the same. Input (Input System): WASD/arrows fly along the view, Q/E down/up,
// RMB look-around (orbit while following), wheel zoom about the target, R — home. Not ported: pan by
// the middle button and touch, zoom to the cursor — the kit's pickers live in Babylon.
using UnityEngine;
#if ARC_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ArcEngine
{
    public class CameraController : MonoBehaviour
    {
        public Camera Cam;
        public Location3D Location;

        // Map px: the look-at point; h = ground + Lift.
        public Vector3 Target;               // x, y — map; z — height
        public float Lift;
        public float Azimuth, Pitch = 1f, Zoom = 1f, ZoomTarget = 1f;
        public IMapPoint FollowObj;

        public const float EYE_MIN = 40f;    // px: the camera no lower than this above the ground
        const float FREE_PITCH_MIN = -85f, FREE_PITCH_MAX = 88f;

        float _shakeUntil, _shakeAmp;

        public struct Cfg
        {
            public float fov, azimuth, pitch, zoom, zoomMobile, zoomMin, zoomMax, wheelStep, zoomLerp, followLerp,
                flySpeed, limits, liftMax, orbit, orbitDegPerPx, pitchMin, pitchMax;
        }

        public Cfg C;

        public static Cfg Config() => new Cfg
        {
            fov = Arc.Const("CAMERA_FOV_DEG", 52f),
            azimuth = Arc.Const("CAMERA_AZIMUTH_DEG", -90f),
            pitch = Arc.Const("CAMERA_PITCH_DEG", 57f),
            zoom = Arc.Const("CAMERA_ZOOM", 1f),
            zoomMobile = Arc.Const("CAMERA_ZOOM_MOBILE", 0.7f),
            zoomMin = Arc.Const("CAMERA_ZOOM_MIN", 0.5f),
            zoomMax = Arc.Const("CAMERA_ZOOM_MAX", 3f),
            wheelStep = Arc.Const("CAMERA_ZOOM_WHEEL_STEP", 0.12f),
            zoomLerp = Arc.Const("CAMERA_ZOOM_LERP", 0.18f),
            followLerp = Arc.Const("CAMERA_FOLLOW_LERP", 0.05f),
            flySpeed = Arc.Const("CAMERA_FLY_SPEED", 900f),
            limits = Arc.Const("CAMERA_LIMITS", 0f),
            liftMax = Arc.Const("CAMERA_LIFT_MAX", 600f),
            orbit = Arc.Const("CAMERA_ORBIT", 1f),
            orbitDegPerPx = Arc.Const("CAMERA_ORBIT_DEG_PER_PX", 0.3f),
            pitchMin = Arc.Const("CAMERA_ORBIT_PITCH_MIN_DEG", 35f),
            pitchMax = Arc.Const("CAMERA_ORBIT_PITCH_MAX_DEG", 88f),
        };

        // Re-read the constants: FOV and limits at once, orientation and zoom — on Home().
        public void ApplyConstants()
        {
            C = Config();
            if (!Cam) Cam = GetComponent<Camera>();
            if (Cam) Cam.fieldOfView = Mathf.Clamp(C.fov, 10f, 120f);
            ZoomTarget = ClampZoom(ZoomTarget);
            Zoom = ClampZoom(Zoom);
            Lift = ClampLift(Lift);
            Pitch = ClampPitch(Pitch);
        }

        // Orientation and zoom from the constants; the target — the followed object or the center.
        public void Home()
        {
            ApplyConstants();
            bool small = Arc.IsMobile && Mathf.Max(Screen.width, Screen.height) < 1024;
            ZoomTarget = Zoom = ClampZoom(small ? C.zoomMobile : C.zoom);
            Azimuth = C.azimuth * Mathf.Deg2Rad;
            var f = FollowObj;
            LookAt(f != null ? f.X : Width / 2f, f != null ? f.Y : Height / 2f);
            Pitch = ClampPitch(C.pitch * Mathf.Deg2Rad);
            Sync();
        }

        public void LookAt(float x, float y)
        {
            Target.x = x;
            Target.y = y;
            Lift = 0f;
            ClampTarget();
            Target.z = GroundH(Target.x, Target.y);
        }

        public void Follow(IMapPoint obj) => FollowObj = obj;

        // intensity — a fraction of the frame (0.01 — light).
        public void Shake(float ms, float intensity = 0.01f)
        {
            float amp = Mathf.Min(40f, intensity * 600f);
            _shakeAmp = Mathf.Max(_shakeAmp * (_shakeUntil > Time.time ? 1f : 0f), amp);
            _shakeUntil = Time.time + (ms > 0 ? ms : 200f) / 1000f;
        }

        float Width => Location ? Location.Width : 2048f;
        float Height => Location ? Location.Height : 2048f;

        public float Distance()
        {
            float h = Screen.height > 0 ? Screen.height : 600f;
            return h / (2f * Mathf.Tan(Mathf.Clamp(C.fov, 10f, 120f) * Mathf.Deg2Rad / 2f) * Mathf.Max(0.02f, Zoom));
        }

        public float WorldPerScreenPx() => 1f / Mathf.Max(0.02f, Zoom);

        float GroundH(float x, float y) => Location && Location.Terrain ? Location.Terrain.HeightAt(x, y) : 0f;

        bool Limited => C.limits > 0;

        float ClampZoom(float z) => Mathf.Clamp(float.IsNaN(z) ? 1f : z, C.zoomMin, Mathf.Max(C.zoomMin, C.zoomMax));

        void ClampTarget()
        {
            if (!Limited) return;
            Target.x = Mathf.Clamp(Target.x, 0f, Width);
            Target.y = Mathf.Clamp(Target.y, 0f, Height);
        }

        float ClampLift(float v) => Limited ? Mathf.Min(Mathf.Max(0f, C.liftMax), v) : v;

        float ClampPitch(float p)
        {
            const float D = Mathf.Deg2Rad;
            if (!Limited) return Mathf.Clamp(p, FREE_PITCH_MIN * D, FREE_PITCH_MAX * D);
            float top = Mathf.Clamp(C.pitchMax, 1f, 89f) * D;
            float floor = Mathf.Min(top, Mathf.Max(1f, C.pitchMin) * D);
            return Mathf.Max(EdgePitchMin(floor, top), Mathf.Min(top, p));
        }

        // The limited camera's lowest pitch: the far frame corners land on the ground closer than the
        // edge of the ring beyond the location — the ground cutoff stays out of the frame.
        float EdgePitchMin(float floor, float top)
        {
            var t = Location ? Location.Terrain : null;
            if (!t || !(t.OuterRing > 0) || !Cam) return floor;
            float reach = t.OuterRing * 0.85f, dist = Distance();
            float drop = Mathf.Max(0f, Target.z - t.HMin);
            float tV = Mathf.Tan(Cam.fieldOfView * Mathf.Deg2Rad / 2f), tH = tV * Cam.aspect;
            float Far(float p)
            {
                float sp = Mathf.Sin(p), cp = Mathf.Cos(p), fall = sp - tV * cp;
                if (fall <= 1e-4f) return float.PositiveInfinity;
                float s = (dist * sp + drop) / fall;
                float a = s * (cp + tV * sp) - dist * cp, b = s * tH;
                return Mathf.Sqrt(a * a + b * b);
            }
            if (Far(floor) <= reach) return floor;
            if (Far(top) > reach) return top;
            float lo = floor, hi = top;
            for (int i = 0; i < 16; i++)
            {
                float mid = (lo + hi) / 2f;
                if (Far(mid) > reach) lo = mid; else hi = mid;
            }
            return hi;
        }

        // Camera position from target, azimuth, pitch and zoom (map x, y, h).
        Vector3 Eye()
        {
            float d = Distance(), cp = Mathf.Cos(Pitch);
            return new Vector3(Target.x - Mathf.Cos(Azimuth) * cp * d, Target.y - Mathf.Sin(Azimuth) * cp * d, Target.z + Mathf.Sin(Pitch) * d);
        }

        void SetTarget3(float x, float y, float h)
        {
            Target.x = x;
            Target.y = y;
            ClampTarget();
            float ground = GroundH(Target.x, Target.y);
            Lift = ClampLift(h - ground);
            Target.z = ground + Lift;
        }

        void FloorEye()
        {
            var e = Eye();
            float low = GroundH(e.x, e.y) + EYE_MIN - e.z;
            if (low > 0) { Lift += low; Target.z += low; }
        }

        void Fly(float fwd, float right, float up, float step)
        {
            float ca = Mathf.Cos(Azimuth), sa = Mathf.Sin(Azimuth), cp = Mathf.Cos(Pitch), sp = Mathf.Sin(Pitch);
            float vx = ca * cp * fwd - sa * right, vy = sa * cp * fwd + ca * right, vh = up - sp * fwd;
            float len = Mathf.Sqrt(vx * vx + vy * vy + vh * vh);
            if (len < 1e-6f) return;
            float k = step / len;
            SetTarget3(Target.x + vx * k, Target.y + vy * k, Target.z + vh * k);
            FloorEye();
            FollowObj = null;
        }

        void Look(float dAzimuth, float dPitch)
        {
            var e = Eye();
            Azimuth += dAzimuth;
            Pitch = ClampPitch(Pitch + dPitch);
            float d = Distance(), cp = Mathf.Cos(Pitch);
            SetTarget3(e.x + Mathf.Cos(Azimuth) * cp * d, e.y + Mathf.Sin(Azimuth) * cp * d, e.z - Mathf.Sin(Pitch) * d);
        }

        // Every frame after the location (ArcApp): input, zoom and follow smoothing, the camera.
        public void Tick(float dt)
        {
            dt = Mathf.Clamp(dt, 0f, 0.1f);
            float f60 = dt * 60f;
            ReadInput(dt);
            if (Mathf.Abs(Zoom - ZoomTarget) > 1e-4f) Zoom += (ZoomTarget - Zoom) * (1f - Mathf.Pow(1f - C.zoomLerp, f60));
            else Zoom = ZoomTarget;
            var f = FollowObj;
            if (f != null)
            {
                float k = 1f - Mathf.Pow(1f - C.followLerp, f60);
                Target.x += (f.X - Target.x) * k;
                Target.y += (f.Y - Target.y) * k;
                Lift -= Lift * k;
                ClampTarget();
            }
            Target.z = GroundH(Target.x, Target.y) + Lift;
            Pitch = ClampPitch(Pitch);
            Sync();
        }

        // The Unity camera: back from the target along the azimuth, no lower than ground + EYE_MIN.
        public void Sync()
        {
            if (!Cam) Cam = GetComponent<Camera>();
            if (!Cam) return;
            var e = Eye();
            float h = Mathf.Max(e.z, GroundH(e.x, e.y) + EYE_MIN);
            var shake = Vector3.zero;
            if (_shakeUntil > Time.time)
            {
                float amp = _shakeAmp * Mathf.Min(1f, (_shakeUntil - Time.time) / 0.2f);
                shake = new Vector3(Random.Range(-amp, amp), Random.Range(-amp, amp), Random.Range(-amp, amp) * 0.5f);
            }
            else _shakeAmp = 0f;
            var eye = ArcSpace.ToWorld(e.x + shake.x, e.y + shake.y, h + shake.z);
            var look = ArcSpace.ToWorld(Target.x + shake.x, Target.y + shake.y, Target.z + shake.z);
            Cam.transform.position = eye;
            if ((look - eye).sqrMagnitude > 1e-10f) Cam.transform.rotation = Quaternion.LookRotation(look - eye, Vector3.up);
        }

        // The kit's FLY_KEYS: [forward along the view, right, up along the world vertical].
        void ReadInput(float dt)
        {
#if ARC_INPUT_SYSTEM
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            if (kb != null)
            {
                float fwd = 0, right = 0, up = 0;
                if (kb.wKey.isPressed || kb.upArrowKey.isPressed) fwd += 1;
                if (kb.sKey.isPressed || kb.downArrowKey.isPressed) fwd -= 1;
                if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) right += 1;
                if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) right -= 1;
                if (kb.eKey.isPressed) up += 1;
                if (kb.qKey.isPressed) up -= 1;
                if (fwd != 0 || right != 0 || up != 0) Fly(fwd, right, up, C.flySpeed * WorldPerScreenPx() * dt);
                if (kb.rKey.wasPressedThisFrame) Home();
            }
            if (mouse != null)
            {
                if (mouse.rightButton.isPressed && C.orbit > 0)
                {
                    // Screen y goes up in Unity, down in the browser: −delta.y is the kit's dy.
                    var d = mouse.delta.ReadValue();
                    float k = C.orbitDegPerPx * Mathf.Deg2Rad;
                    if (FollowObj != null)
                    {
                        Azimuth += d.x * k;
                        Pitch = ClampPitch(Pitch - d.y * k);
                    }
                    else Look(d.x * k, -d.y * k);
                }
                float wheel = mouse.scroll.ReadValue().y;
                if (wheel != 0)
                {
                    float notches = -Mathf.Sign(wheel);   // one wheel event — one notch, like the kit's clamp
                    ZoomTarget = ClampZoom(ZoomTarget * Mathf.Pow(1f + C.wheelStep, -notches));
                }
            }
#endif
        }
    }
}
