// ArcApp.cs — the kit's main.js on the Unity side: window.app = { location, camera, game } and the
// frame loop in the kit's order — game.Update(dt) -> location.Tick(dt) -> camera.Tick(dt) ->
// Sound3D.Update(camera). The game is a plain C# class, like the JS one it was ported from:
//     public class Game : IArcGame { public Game(ArcApp app) { … } public void Update(float dt) { … } }
// ArcApp finds it by name (gameClass, "Game" by default) in any assembly. Render constants
// (light, sky, fog) are applied on Awake from ArcConstants — tune them there and press Play.
using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace ArcEngine
{
    public interface IArcGame
    {
        void Update(float dt);
    }

    [DefaultExecutionOrder(-100)]
    public class ArcApp : MonoBehaviour
    {
        public ArcConstants constants;
        public ArcAssets assets;
        public Location3D Location;
        public CameraController Camera;
        public RectTransform uiRoot;
        public Light sun;
        public string gameClass = "Game";

        public IArcGame Game { get; private set; }

        void Awake()
        {
            Bind();
            ApplyRenderConstants();
            if (Camera) Camera.Home();
        }

        // Globals for the code that runs before Start (and for the importer in edit mode).
        public void Bind()
        {
            Arc.Constants = constants;
            Arc.Assets = assets;
            Arc.App = this;
            UI.Init(uiRoot);
        }

        void Start()
        {
            Game = CreateGame();
        }

        void Update()
        {
            float dt = Mathf.Min(0.1f, Time.deltaTime);
            World3D.Tick(Time.unscaledDeltaTime);
            Game?.Update(dt);
            if (Location) Location.Tick(dt);
            if (Camera) Camera.Tick(dt);
            Sound3D.Update(Camera);
        }

        void OnDestroy()
        {
            Sound3D.StopAll();
            if (Arc.App == this) Arc.App = null;
        }

        IArcGame CreateGame()
        {
            if (string.IsNullOrEmpty(gameClass)) return null;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type;
                try { type = asm.GetType(gameClass, false); } catch (Exception) { continue; }
                if (type == null || !typeof(IArcGame).IsAssignableFrom(type)) continue;
                var ctor = type.GetConstructor(new[] { typeof(ArcApp) });
                if (ctor != null) return (IArcGame)ctor.Invoke(new object[] { this });
                Debug.LogError("ArcApp: у " + gameClass + " нет конструктора " + gameClass + "(ArcApp app)");
                return null;
            }
            Debug.Log("ArcApp: класса игры " + gameClass + " нет — локация без логики");
            return null;
        }

        // Light, sky, fog from WORLD3D_* — the kit's View3D.applyLighting in Unity terms: the sun is
        // the directional light (azimuth — where the shadow falls on the map, elevation), the sky light
        // is the trilight ambient, the fog is EXP2 per px -> per meter. Toon bands, ink and outline
        // have no twin here (the report says so).
        public void ApplyRenderConstants()
        {
            var sky = Arc.Hex(Arc.Const("WORLD3D_SKY_COLOR", 0x8fc3e0));
            if (sun)
            {
                float az = Arc.Const("WORLD3D_SUN_AZIMUTH_DEG", 32f) * Mathf.Deg2Rad;
                float el = Arc.Const("WORLD3D_SUN_ELEVATION_DEG", 41f) * Mathf.Deg2Rad;
                // The kit's sunDirection (Babylon: x, height, map y) with map y -> −Z.
                var dir = new Vector3(Mathf.Cos(az) * Mathf.Cos(el), -Mathf.Sin(el), -Mathf.Sin(az) * Mathf.Cos(el));
                sun.type = LightType.Directional;
                sun.transform.rotation = Quaternion.LookRotation(dir);
                sun.color = Arc.Hex(Arc.Const("WORLD3D_SUN_COLOR", 0xffedc7));
                sun.intensity = Mathf.Max(0f, Arc.Const("WORLD3D_SUN_INTENSITY", 0.8f));
                sun.shadows = Arc.Const("WORLD3D_SHADOW_SOFT", 2f) > 0 ? LightShadows.Soft : LightShadows.Hard;
                sun.shadowStrength = Mathf.Clamp01(Arc.Const("WORLD3D_SHADOW_STRENGTH", 0.52f));
            }
            float skyI = Mathf.Max(0f, Arc.Const("WORLD3D_SKYLIGHT_INTENSITY", 0.45f));
            var skyLight = Arc.Hex(Arc.Const("WORLD3D_SKYLIGHT_COLOR", 0xb1d8f7)) * skyI;
            var groundLight = Arc.Hex(Arc.Const("WORLD3D_GROUNDLIGHT_COLOR", 0xc2c7ad)) * skyI;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = skyLight;
            RenderSettings.ambientEquatorColor = Color.Lerp(skyLight, groundLight, 0.5f);
            RenderSettings.ambientGroundColor = groundLight;
            float fog = Arc.Const("WORLD3D_FOG_DENSITY", 0.00032f);
            RenderSettings.fog = fog > 0;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = fog * ArcSpace.PxPerMeter;
            RenderSettings.fogColor = sky;
            if (Camera && Camera.Cam)
            {
                Camera.Cam.clearFlags = CameraClearFlags.SolidColor;
                Camera.Cam.backgroundColor = sky;
                Camera.ApplyConstants();
            }
        }
    }
}
