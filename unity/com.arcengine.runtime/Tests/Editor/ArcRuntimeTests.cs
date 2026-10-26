// ArcRuntimeTests.cs — the C# twins against the kit's own numbers: the cases are the ones the kit's
// node tests use (tests/sound.test.mjs, tests/ui.test.mjs), the coordinates — the export's rule.
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using ArcEngine.Editor;

namespace ArcEngine.Tests
{
    public class ArcSpaceTests
    {
        [Test]
        public void MapToWorld_IsMetersWithMapYAsMinusZ()
        {
            Assert.AreEqual(new Vector3(10.5f, 0.3f, -8.25f), ArcSpace.ToWorld(1050f, 825f, 30f));
            var back = ArcSpace.ToMap(ArcSpace.ToWorld(123f, 456f, 7f));
            Assert.That((back - new Vector3(123f, 456f, 7f)).magnitude, Is.LessThan(1e-3f));
        }

        [Test]
        public void HeadingZeroLooksAlongPlusX_NinetyDownTheMap()
        {
            // A model whose nose is the object's +X (the kit's convention after the fit node).
            var nose0 = ArcSpace.Rotation(new float[] { 0, 0, 0 }) * Vector3.right;
            var nose90 = ArcSpace.Rotation(new float[] { 0, 90, 0 }) * Vector3.right;
            Assert.That((nose0 - ArcSpace.Direction(1, 0)).magnitude, Is.LessThan(1e-5f));
            Assert.That((nose90 - ArcSpace.Direction(0, 1)).magnitude, Is.LessThan(1e-5f), "90° — down the map (+y)");
            var h = ArcSpace.Heading(Mathf.Atan2(1f, 0f)) * Vector3.right;
            Assert.That((h - ArcSpace.Direction(0, 1)).magnitude, Is.LessThan(1e-5f), "heading = atan2(vy, vx)");
        }
    }

    public class SoundTests
    {
        const float FULL = 300, MAX = 1500;
        static Vector2 At(float sx, float sy, float lx = 0, float ly = 0, float az = 0) =>
            Sound3D.Spatial(new Vector3(sx, sy, 0), new Vector3(lx, ly, 0), az, FULL, MAX, 1f);

        [Test]
        public void Gain_FullInsideMin_LinearToZeroAtMax()
        {
            Assert.AreEqual(1f, At(0, 0).x);
            Assert.AreEqual(1f, At(FULL, 0).x);
            Assert.AreEqual(0f, At(MAX, 0).x);
            Assert.AreEqual(0f, At(MAX + 5000, 0).x);
            Assert.AreEqual(0.5f, At((FULL + MAX) / 2, 0).x, 1e-3f);
            Assert.AreEqual(0.5f, Sound3D.Spatial(new Vector3(400, 0, 0), Vector3.zero, 0, 300, 500, 1).x, 1e-3f);
            Assert.AreEqual(0f, Sound3D.Spatial(new Vector3(10, 0, 0), Vector3.zero, 0, 100, 0, 1).x, "zero max — silence, no division by zero");
        }

        [Test]
        public void Pan_BySideOfTheScreen()
        {
            // Azimuth −90° (north up): +x is on the right of the screen.
            float az = -Mathf.PI / 2;
            Assert.That(At(1000, 0, 0, 0, az).y, Is.GreaterThan(0.5f));
            Assert.That(At(-1000, 0, 0, 0, az).y, Is.LessThan(-0.5f));
            Assert.AreEqual(0f, At(0, -1000, 0, 0, az).y, 1e-4f, "straight ahead — center");
        }
    }

    public class UITests
    {
        static RectTransform Container(float W, float H)
        {
            var go = new GameObject("container", typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.sizeDelta = new Vector2(W, H);
            return rt;
        }

        // The top left corner of a built element in the container's layout px (y down).
        static Vector2 TopLeft(RectTransform el, RectTransform box)
        {
            var c = new Vector3[4];
            el.GetLocalCorners(c);
            var tl = (Vector2)el.localPosition + (Vector2)c[1];
            return new Vector2(tl.x - box.rect.xMin, box.rect.yMax - tl.y);
        }

        [Test]
        public void Layout_MatchesTheKitsResolve_ForEveryAnchorAndStretch()
        {
            float W = 1280, H = 720;
            var box = Container(W, H);
            try
            {
                foreach (var anchor in UI.Anchors)
                {
                    foreach (var stretch in new[] { "", "h", "v", "both" })
                    {
                        var def = new UIRecord { id = "e", kind = "panel", anchor = anchor, stretch = stretch, x = 20, y = 12, w = 200, h = 50 };
                        var go = new GameObject("e", typeof(RectTransform));
                        var rt = (RectTransform)go.transform;
                        rt.SetParent(box, false);
                        UIBuilder.Layout(rt, def);
                        var st = UI.StretchOf(def);
                        float w = st.h ? W - 2 * def.x : def.w, h = st.v ? H - 2 * def.y : def.h;
                        Assert.That((rt.rect.size - new Vector2(w, h)).magnitude, Is.LessThan(1e-3f), anchor + " " + stretch + ": size");
                        var want = UI.Resolve(def, w, h, W, H);
                        Assert.That((TopLeft(rt, box) - want).magnitude, Is.LessThan(1e-3f), anchor + " " + stretch + ": position");
                        Object.DestroyImmediate(go);
                    }
                }
            }
            finally { Object.DestroyImmediate(box.gameObject); }
        }

        [Test]
        public void Resolve_BottomRightCornerKeepsItsInset()
        {
            var def = new UIRecord { anchor = "bottom-right", x = 20, y = 20 };
            Assert.AreEqual(new Vector2(1280 - 20 - 100, 720 - 20 - 40), UI.Resolve(def, 100, 40, 1280, 720));
        }
    }

    // The imported scene against the export's golden numbers: heights, positions, model bounds.
    public class ImportTests
    {
        [Test]
        public void ImportedScene_MatchesTheExport()
        {
            if (!File.Exists(ArcImporter.ExportDir + "/arc-export.json") || !File.Exists(ArcImporter.ScenePath))
                Assert.Ignore("нет экспорта или сцены — сначала export-unity.mjs и импорт");
            var data = ArcImporter.Load();
            var scene = EditorSceneManager.OpenScene(ArcImporter.ScenePath);
            var app = scene.GetRootGameObjects().Select(g => g.GetComponent<ArcApp>()).First(a => a);
            app.Bind();
            Assert.AreEqual(0, ArcImporter.Validate(data, app));
            Assert.AreEqual(data.objects.Length, app.Location.Objects.Count);
            foreach (var r in data.ui) Assert.IsNotNull(UI.Get(r.id), "элемент " + r.id);
        }

        // The check is worth something only if it catches a wrong fit: turn every model by 180° or
        // mirror it — each must fail, even a near-symmetric one.
        [Test]
        public void SelfCheck_CatchesATurnedOrMirroredModel()
        {
            if (!File.Exists(ArcImporter.ExportDir + "/arc-export.json") || !File.Exists(ArcImporter.ScenePath))
                Assert.Ignore("нет экспорта или сцены");
            var data = ArcImporter.Load();
            int checkedModels = data.golden.bounds.Length;
            LogAssert.ignoreFailingMessages = true;   // the errors are the point here
            foreach (var spoil in new System.Action<Transform>[] { m => m.localRotation *= Quaternion.Euler(0, 180, 0), m => m.localScale = new Vector3(-1, 1, 1) })
            {
                var scene = EditorSceneManager.OpenScene(ArcImporter.ScenePath);
                var app = scene.GetRootGameObjects().Select(g => g.GetComponent<ArcApp>()).First(a => a);
                app.Bind();
                foreach (var rec in app.Location.Objects) spoil(rec.transform.Find("model"));
                Assert.AreEqual(checkedModels, ArcImporter.Validate(data, app), "каждая испорченная модель — ошибка");
            }
            EditorSceneManager.OpenScene(ArcImporter.ScenePath);
        }
    }
}
