// Arc.cs — the kit's globals on the Unity side. Constants with a default: Arc.Const("NAME", 8) is
// the twin of `typeof NAME !== 'undefined' ? NAME : 8` — the numbers live in the ArcConstants asset
// (the importer fills it from Constants.js; tune it in the inspector). Assets by their kit path:
// Sound3D.Play("assets/sounds/step.wav") finds the clip the importer registered under that path.
// ArcApp fills Arc.Constants / Arc.Assets / Arc.App on Awake; the importer — while it builds.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    public static class Arc
    {
        public static ArcConstants Constants;
        public static ArcAssets Assets;
        public static ArcApp App;

        public static float Const(string name, float fallback)
        {
            return Constants != null && Constants.TryGet(name, out var v) ? v : fallback;
        }

        public static string Text(string name, string fallback)
        {
            return Constants != null && Constants.TryGetText(name, out var v) ? v : fallback;
        }

        // IS_MOBILE: a phone or a tablet.
        public static bool IsMobile => Application.isMobilePlatform;

        // 0xRRGGBB from Constants.js -> Color.
        public static Color Hex(float rgb)
        {
            int n = (int)rgb & 0xffffff;
            return new Color(((n >> 16) & 255) / 255f, ((n >> 8) & 255) / 255f, (n & 255) / 255f, 1f);
        }

        // '#rrggbb' from UILayout.js -> Color; '' or garbage — null.
        public static Color? Css(string s)
        {
            if (string.IsNullOrEmpty(s)) return null;
            return ColorUtility.TryParseHtmlString(s, out var c) ? c : (Color?)null;
        }
    }

    // A point on the map with live x, y (px): Sound3D's `at`, CameraController.Follow.
    public interface IMapPoint
    {
        float X { get; }
        float Y { get; }
    }

    // localStorage through Store -> PlayerPrefs.
    public static class Store
    {
        public static string Get(string key) => PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null;

        public static bool Set(string key, string value)
        {
            PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
            return true;
        }

        public static void Remove(string key) => PlayerPrefs.DeleteKey(key);

        // A broken value = as if there were no save.
        public static T GetJSON<T>(string key, T fallback)
        {
            var raw = Get(key);
            if (raw == null) return fallback;
            try
            {
                var parsed = JsonUtility.FromJson<T>(raw);
                return parsed != null ? parsed : fallback;
            }
            catch (Exception)
            {
                Debug.LogWarning("Store: повреждённое значение \"" + key + "\", сбрасываю.");
                Remove(key);
                return fallback;
            }
        }
    }

    // What game code takes from World3D besides the scene: the frame rate.
    public static class World3D
    {
        static float _avg = 1f / 60f;

        // Frames per second, averaged like Babylon's engine.getFps().
        public static float GetFps() => _avg > 0f ? 1f / _avg : 0f;

        internal static void Tick(float dt)
        {
            if (dt > 0f) _avg += (dt - _avg) * 0.05f;
        }
    }
}
