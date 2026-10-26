// ArcImporter.cs — builds the Unity scene from the kit's export (Assets/ArcExport, written by
// `node tools/export-unity.mjs <project>` in the ArcEngine project):
//   constants -> Assets/Arc/ArcConstants.asset (Arc.Const reads it; re-import overwrites the values)
//   assets    -> Assets/Arc/ArcAssets.asset: the kit path -> the imported asset (models, clips, sounds)
//   objects   -> prefab instances with LocationObject under Location (placed by Location3D, like the kit)
//   UI        -> uGUI under a Canvas scaled by UI_REF_HEIGHT (UIBuilder)
//   + the ground (Terrain3D from terrain.bytes), the sun, the camera, the EventSystem, ArcApp
// into Assets/Arc/Scene.unity. The ArcApp object is REBUILT on every import — put your own scene
// objects outside it; its gameClass survives. Then the import checks itself against the export's
// golden numbers (terrain heights, positions, model bounds) — a mismatch is an error, not a warning:
// a model mirrored or turned by the fit is exactly what it catches.
// Menu: ArcEngine > Import export. Batchmode:
//   Unity.exe -batchmode -quit -projectPath <p> -executeMethod ArcEngine.Editor.ArcImporter.ImportCli
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.UI;

namespace ArcEngine.Editor
{
    public static class ArcImporter
    {
        public const string ExportDir = "Assets/ArcExport";
        public const string OutDir = "Assets/Arc";
        public const string ScenePath = OutDir + "/Scene.unity";
        public const int Format = 1;

        [Serializable] public class TerrainMeta { public string file; public float width, height; public Terrain3D.Grid grid, ring; }
        [Serializable] public class BoundsRec { public int index; public float[] min, max, centroid; }
        [Serializable] public class Golden { public float[] heights; public float[] space; public BoundsRec[] bounds; }

        [Serializable]
        public class ExportData
        {
            public int format;
            public float pxPerMeter;
            public List<ArcConstants.Number> constants;
            public List<ArcConstants.Text> strings;
            public TerrainMeta terrain;
            public string[] grounds;
            public LocationObjectDef[] objects;
            public UIRecord[] ui;
            public string[] assets;
            public Golden golden;
        }

        [MenuItem("ArcEngine/Import export")]
        public static void ImportMenu()
        {
            int errors = Import();
            if (errors > 0) EditorUtility.DisplayDialog("ArcEngine", "Импорт: ошибок " + errors + " — см. Console", "OK");
        }

        public static void ImportCli()
        {
            int code = 1;
            try { code = Import() > 0 ? 1 : 0; }
            catch (Exception e) { Debug.LogException(e); }
            EditorApplication.Exit(code);
        }

        public static ExportData Load()
        {
            var file = ExportDir + "/arc-export.json";
            if (!File.Exists(file)) throw new FileNotFoundException("нет " + file + " — сначала node tools/export-unity.mjs <этот проект>");
            var data = JsonUtility.FromJson<ExportData>(File.ReadAllText(file));
            if (data.format != Format) throw new InvalidDataException("arc-export.json формата " + data.format + ", импорт знает " + Format);
            return data;
        }

        // Returns the number of errors (the self-check included).
        public static int Import()
        {
            AssetDatabase.Refresh();
            var data = Load();
            Directory.CreateDirectory(OutDir);
            int tmpErrors = EnsureTmp();

            var constants = LoadOrCreate<ArcConstants>(OutDir + "/ArcConstants.asset");
            constants.numbers = data.constants ?? new List<ArcConstants.Number>();
            constants.strings = data.strings ?? new List<ArcConstants.Text>();
            EditorUtility.SetDirty(constants);

            var assets = LoadOrCreate<ArcAssets>(OutDir + "/ArcAssets.asset");
            assets.entries.Clear();
            foreach (var path in data.assets ?? new string[0]) RegisterAsset(assets, path);
            assets.Put(UIBuilder.RoundedPath, RoundedSprite());
            EditorUtility.SetDirty(assets);
            AssetDatabase.SaveAssets();
            Arc.Constants = constants;
            Arc.Assets = assets;

            var scene = File.Exists(ScenePath)
                ? EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single)
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            string gameClass = "Game";
            foreach (var old in scene.GetRootGameObjects().Where(g => g.GetComponent<ArcApp>()))
            {
                gameClass = old.GetComponent<ArcApp>().gameClass;
                UnityEngine.Object.DestroyImmediate(old);
            }
            foreach (var old in scene.GetRootGameObjects().Where(g => g.GetComponent<EventSystem>())) UnityEngine.Object.DestroyImmediate(old);

            var root = new GameObject("ArcApp");
            var app = root.AddComponent<ArcApp>();
            app.constants = constants;
            app.assets = assets;
            app.gameClass = gameClass;

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.transform.SetParent(root.transform, false);
            sun.type = LightType.Directional;
            app.sun = sun;

            app.Location = BuildLocation(data, root.transform);
            app.Camera = BuildCamera(app.Location, root.transform);
            app.uiRoot = BuildUI(data, root.transform);
            BuildEventSystem();
            app.Bind();
            app.ApplyRenderConstants();
            app.Camera.Home();

            int errors = Validate(data, app) + tmpErrors;
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            var list = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
            list.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = list.ToArray();
            AssetDatabase.SaveAssets();
            Debug.Log("ArcEngine: импорт — объектов " + app.Location.Objects.Count + ", элементов UI " + (data.ui?.Length ?? 0) +
                ", ошибок " + errors + " -> " + ScenePath);
            return errors;
        }

        // --- Assets --------------------------------------------------------------------------------

        static T LoadOrCreate<T>(string path) where T : ScriptableObject
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a) return a;
            a = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(a, path);
            return a;
        }

        // A kit path -> the imported asset; a model's clips — 'path#clip' entries.
        static void RegisterAsset(ArcAssets reg, string path)
        {
            var unityPath = ExportDir + "/" + path;
            var main = AssetDatabase.LoadMainAssetAtPath(unityPath);
            if (!main)
            {
                Debug.LogError("ArcEngine: ассет не импортирован: " + unityPath +
                    (Model3D.IsGltf(path) ? " (нужен пакет com.unity.cloud.gltfast)" : ""));
                return;
            }
            reg.Put(path, main);
            if (!(main is GameObject)) return;
            foreach (var clip in AssetDatabase.LoadAllAssetsAtPath(unityPath).OfType<AnimationClip>())
            {
                if (clip.name.StartsWith("__preview__")) continue;
                reg.Put(path + "#" + clip.name, clip);
            }
        }

        // TextMeshPro needs its essentials (default font, shaders) in the project once — without them
        // every text is invisible. The package lives in Library/PackageCache: its real path is asked.
        static int EnsureTmp()
        {
            if (TmpReady()) return 0;
            var ugui = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.unity.ugui/package.json");
            var pkg = ugui != null ? Path.Combine(ugui.resolvedPath, "Package Resources", "TMP Essential Resources.unitypackage") : null;
            if (pkg == null || !File.Exists(pkg)) { Debug.LogError("ArcEngine: нет TMP Essential Resources (пакет com.unity.ugui)"); return 1; }
            // AssetDatabase.ImportPackage is queued and never runs in a batchmode call — unpack by hand.
            ExtractUnityPackage(pkg);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            if (TmpReady()) { Debug.Log("ArcEngine: импортированы TMP Essential Resources"); return 0; }
            Debug.LogError("ArcEngine: TMP Essential Resources не встали — Window > TextMeshPro > Import TMP Essential Resources");
            return 1;
        }

        // A .unitypackage is a gzipped tar of <guid>/{asset, asset.meta, pathname}: each asset goes to
        // its pathname with its own .meta (the GUIDs the package's assets reference each other by).
        static void ExtractUnityPackage(string file)
        {
            byte[] tar;
            using (var gz = new System.IO.Compression.GZipStream(File.OpenRead(file), System.IO.Compression.CompressionMode.Decompress))
            using (var ms = new MemoryStream()) { gz.CopyTo(ms); tar = ms.ToArray(); }
            var items = new Dictionary<string, Dictionary<string, byte[]>>();
            string Ascii(int at, int len) { int n = 0; while (n < len && tar[at + n] != 0) n++; return System.Text.Encoding.ASCII.GetString(tar, at, n); }
            for (int at = 0; at + 512 <= tar.Length;)
            {
                string name = Ascii(at, 100);
                if (name.Length == 0) break;
                string prefix = Ascii(at + 345, 155);
                if (prefix.Length > 0) name = prefix + "/" + name;
                long size = Convert.ToInt64(Ascii(at + 124, 12).Trim() is var s && s.Length > 0 ? s : "0", 8);
                var parts = name.TrimStart('.', '/').Split('/');
                if (parts.Length == 2 && tar[at + 156] != (byte)'5')
                {
                    if (!items.TryGetValue(parts[0], out var item)) items[parts[0]] = item = new Dictionary<string, byte[]>();
                    var data = new byte[size];
                    Array.Copy(tar, at + 512, data, 0, size);
                    item[parts[1]] = data;
                }
                at += 512 + (int)((size + 511) / 512 * 512);
            }
            foreach (var item in items.Values)
            {
                if (!item.TryGetValue("pathname", out var p)) continue;
                var path = System.Text.Encoding.UTF8.GetString(p).Split('\n')[0].Trim();
                if (item.TryGetValue("asset", out var asset))
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    File.WriteAllBytes(path, asset);
                }
                else Directory.CreateDirectory(path);
                if (item.TryGetValue("asset.meta", out var meta)) File.WriteAllBytes(path + ".meta", meta);
            }
        }

        static bool TmpReady()
        {
            var s = Resources.Load<TMP_Settings>("TMP Settings");
            return s && TMP_Settings.defaultFontAsset;
        }

        // The 9-sliced rounded corner of panels and buttons: 96 px, corners of RoundedRadius px.
        static Sprite RoundedSprite()
        {
            var path = OutDir + "/rounded.png";
            if (!File.Exists(path))
            {
                const int N = 96;
                float r = UIBuilder.RoundedRadius;
                var tex = new Texture2D(N, N, TextureFormat.RGBA32, false);
                var px = new Color32[N * N];
                for (int y = 0; y < N; y++)
                {
                    for (int x = 0; x < N; x++)
                    {
                        float cx = Mathf.Clamp(x + 0.5f, r, N - r), cy = Mathf.Clamp(y + 0.5f, r, N - r);
                        float d = Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy));
                        px[y * N + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(r - d + 0.5f) * 255));
                    }
                }
                tex.SetPixels32(px);
                File.WriteAllBytes(path, tex.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(tex);
                AssetDatabase.ImportAsset(path);
            }
            var ti = (TextureImporter)AssetImporter.GetAtPath(path);
            if (ti.textureType != TextureImporterType.Sprite || ti.spriteBorder.x != UIBuilder.RoundedRadius)
            {
                ti.textureType = TextureImporterType.Sprite;
                ti.spriteImportMode = SpriteImportMode.Single;
                ti.spriteBorder = Vector4.one * UIBuilder.RoundedRadius;
                ti.mipmapEnabled = false;
                ti.alphaIsTransparency = true;
                ti.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        static Material Mat(string path, Texture tex, Color color)
        {
            var urp = GraphicsSettings.currentRenderPipeline != null;
            var shader = Shader.Find(urp ? "Universal Render Pipeline/Lit" : "Standard");
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!m) { m = new Material(shader); AssetDatabase.CreateAsset(m, path); }
            else m.shader = shader;
            m.mainTexture = tex;
            m.color = color;
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0f);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0f);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
            EditorUtility.SetDirty(m);
            return m;
        }

        // --- Scene ---------------------------------------------------------------------------------

        static Location3D BuildLocation(ExportData data, Transform parent)
        {
            var go = new GameObject("Location");
            go.transform.SetParent(parent, false);
            var loc = go.AddComponent<Location3D>();

            var grounds = data.grounds ?? new string[0];
            int gi = Mathf.Clamp(Mathf.RoundToInt(Arc.Const("LOCATION_GROUND", 0f)), 0, Mathf.Max(0, grounds.Length - 1));
            var tex = grounds.Length > 0 ? AssetDatabase.LoadAssetAtPath<Texture2D>(ExportDir + "/" + grounds[gi]) : null;
            var plain = new Color(0.25f, 0.4f, 0.18f);
            float tint = Arc.Const("WORLD3D_OUTER_TINT", 1f);
            var ground = Mat(OutDir + "/Ground.mat", tex, tex ? Color.white : plain);
            var outer = Mat(OutDir + "/GroundOuter.mat", tex, (tex ? Color.white : plain) * new Color(tint, tint, tint, 1f));

            var tgo = new GameObject("Terrain");
            tgo.transform.SetParent(go.transform, false);
            var t = tgo.AddComponent<Terrain3D>();
            var m = data.terrain;
            t.data = AssetDatabase.LoadAssetAtPath<TextAsset>(ExportDir + "/" + m.file);
            t.worldW = m.width;
            t.worldH = m.height;
            t.grid = m.grid;
            t.ring = m.ring;
            t.tileSize = Arc.Const("GROUND_TILE_SIZE", 512f);
            t.material = ground;
            t.outerMaterial = outer;
            t.Build();
            loc.Terrain = t;

            var objects = new GameObject("Objects").transform;
            objects.SetParent(go.transform, false);
            loc.ObjectsRoot = objects;
            foreach (var def in data.objects ?? new LocationObjectDef[0])
            {
                var ogo = new GameObject(string.IsNullOrEmpty(def.name) ? "object" : def.name);
                ogo.transform.SetParent(objects, false);
                var rec = ogo.AddComponent<LocationObject>();
                rec.Def = def;
                var prefab = Arc.Assets.Get<GameObject>(def.model);
                if (prefab)
                {
                    var fit = Model3D.FitNode(def.model, ogo.transform);
                    var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab, fit);
                    Model3D.AttachClips(inst, def.model);
                }
                else
                {
                    rec.Error = "нет модели " + def.model;
                    Debug.LogError("ArcEngine: " + def.name + " — " + rec.Error);
                }
                loc.Objects.Add(rec);
                loc.PlaceObject(rec);
                loc.ApplyHidden(rec);
            }
            return loc;
        }

        static CameraController BuildCamera(Location3D loc, Transform parent)
        {
            var go = new GameObject("Main Camera") { tag = "MainCamera" };
            go.transform.SetParent(parent, false);
            var cam = go.AddComponent<Camera>();
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 1000f;
            go.AddComponent<AudioListener>();
            var cc = go.AddComponent<CameraController>();
            cc.Cam = cam;
            cc.Location = loc;
            return cc;
        }

        // UILayout.js: records in drawing order; a child may stand before its parent in the file —
        // first every element on the Canvas, then each into its parent, keeping the record order.
        static RectTransform BuildUI(ExportData data, Transform parent)
        {
            var go = new GameObject("UI", typeof(RectTransform));
            go.layer = 5;
            go.transform.SetParent(parent, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.AddComponent<CanvasScaler>();
            float refH = Arc.Const("UI_REF_HEIGHT", 720f);
            if (refH > 0)
            {
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.referenceResolution = new Vector2(Mathf.Round(refH * 16f / 9f), refH);
                scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
                scaler.matchWidthOrHeight = 1f;
            }
            go.AddComponent<GraphicRaycaster>();
            var root = (RectTransform)go.transform;
            UI.Init(root);
            var records = data.ui ?? new UIRecord[0];
            var built = new Dictionary<string, UIElement>();
            foreach (var r in records) built[r.id] = UIBuilder.Build(r, root);
            foreach (var r in records)
            {
                var e = built[r.id];
                var p = ValidParent(r, records) ? built[r.parent] : null;
                if (p) e.transform.SetParent(p.transform, false);
                UIBuilder.Layout((RectTransform)e.transform, r);
                e.transform.SetAsLastSibling();
            }
            return root;
        }

        // A missing parent, itself or a cycle — the screen, like the kit's UI.parentOf.
        static bool ValidParent(UIRecord r, UIRecord[] all)
        {
            var seen = new HashSet<string> { r.id };
            for (var id = r.parent; !string.IsNullOrEmpty(id);)
            {
                var p = Array.Find(all, x => x.id == id);
                if (p == null || !seen.Add(id)) return false;
                id = p.parent;
            }
            return !string.IsNullOrEmpty(r.parent);
        }

        static void BuildEventSystem()
        {
            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
#if ARC_INPUT_SYSTEM
            go.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#else
            go.AddComponent<StandaloneInputModule>();
#endif
        }

        // --- The self-check ------------------------------------------------------------------------

        public static int Validate(ExportData data, ArcApp app)
        {
            int errors = 0;
            void Fail(string msg) { errors++; Debug.LogError("ArcEngine check: " + msg); }
            var g = data.golden;
            var t = app.Location.Terrain;
            if (g?.heights != null)
            {
                for (int i = 0; i + 2 < g.heights.Length; i += 3)
                {
                    float got = t.HeightAt(g.heights[i], g.heights[i + 1]);
                    if (Mathf.Abs(got - g.heights[i + 2]) > 0.01f)
                        Fail("высота в (" + g.heights[i] + ", " + g.heights[i + 1] + "): " + got + " вместо " + g.heights[i + 2]);
                }
            }
            var objs = app.Location.Objects;
            if (g?.space != null)
            {
                for (int i = 0, k = 0; i + 5 < g.space.Length; i += 6, k++)
                {
                    var want = new Vector3(g.space[i + 3], g.space[i + 4], g.space[i + 5]);
                    var map = ArcSpace.ToWorld(g.space[i], g.space[i + 1], g.space[i + 2]);
                    if ((map - want).magnitude > 1e-3f) Fail("ArcSpace.ToWorld расходится с экспортом: " + map + " вместо " + want);
                    if (k < objs.Count && (objs[k].transform.position - want).magnitude > 1e-3f)
                        Fail(objs[k].name + " стоит в " + objs[k].transform.position + " вместо " + want);
                }
            }
            // The box catches scale and placement; the centroid of the distinct vertices — a turn or a
            // mirror (a symmetric-looking box hides them, the centroid moves by the model's asymmetry).
            foreach (var b in g?.bounds ?? new BoundsRec[0])
            {
                if (b.index >= objs.Count || !objs[b.index]) continue;
                var rec = objs[b.index];
                if (!ModelPoints(rec.gameObject, out var got, out var centroid)) { Fail(rec.name + ": у модели нет мешей"); continue; }
                var want = new Bounds();
                want.SetMinMax(new Vector3(b.min[0], b.min[1], b.min[2]), new Vector3(b.max[0], b.max[1], b.max[2]));
                var wantC = b.centroid != null && b.centroid.Length == 3 ? new Vector3(b.centroid[0], b.centroid[1], b.centroid[2]) : want.center;
                float diag = want.size.magnitude, tolBox = diag * 0.015f + 0.01f, tolC = diag * 0.005f + 0.002f;
                var ds = got.size - want.size;
                bool size = Mathf.Abs(ds.x) <= tolBox && Mathf.Abs(ds.y) <= tolBox && Mathf.Abs(ds.z) <= tolBox;
                bool place = (got.center - want.center).magnitude <= tolBox && (centroid - wantC).magnitude <= tolC;
                if (!size || !place)
                    Fail(rec.name + ": модель " + Fmt(got, centroid) + " вместо " + Fmt(want, wantC) + (!size
                        ? " — не тот размер (масштаб, единицы файла)"
                        : " — сдвинута, повёрнута или отражена: Model3D.FitRotation не совпал с осями файла"));
                else Debug.Log("ArcEngine check: " + rec.name + " — габариты и ориентация совпали (" + Fmt(got, centroid) + ")");
            }
            return errors;
        }

        static string Fmt(Bounds b, Vector3 c) => "[центр " + b.center.ToString("F3") + ", размер " + b.size.ToString("F3") + ", центр вершин " + c.ToString("F3") + "]";

        // World bounds of every mesh vertex and the centroid of the distinct ones (0.1 mm grid);
        // a skinned mesh — in its rest pose.
        public static bool ModelPoints(GameObject go, out Bounds bounds, out Vector3 centroid)
        {
            var seen = new Dictionary<Vector3Int, Vector3>();
            void AddMesh(Mesh mesh, Matrix4x4 m)
            {
                if (!mesh) return;
                Vector3[] v = null;
                try { v = mesh.vertices; } catch (Exception) { /* not readable */ }
                if (v == null) return;
                foreach (var p in v)
                {
                    var w = m.MultiplyPoint3x4(p);
                    seen[Vector3Int.RoundToInt(w * 10000f)] = w;
                }
            }
            foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true)) AddMesh(mf.sharedMesh, mf.transform.localToWorldMatrix);
            foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true)) AddMesh(smr.sharedMesh, smr.transform.localToWorldMatrix);
            bounds = new Bounds();
            centroid = Vector3.zero;
            if (seen.Count == 0) return false;
            bool first = true;
            foreach (var w in seen.Values)
            {
                if (first) { bounds = new Bounds(w, Vector3.zero); first = false; } else bounds.Encapsulate(w);
                centroid += w / seen.Count;
            }
            return true;
        }
    }
}
