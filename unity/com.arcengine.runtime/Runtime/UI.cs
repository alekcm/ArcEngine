// UI.cs — the twin of js/UI.js: game code takes an element by id and feeds it data —
// UI.Get("score").SetText("10"), SetValue(0.7f), Show(false), OnClick(() => …). The elements are
// uGUI objects the importer built from UILayout.js (a Canvas scaled by UI_REF_HEIGHT, anchors and
// stretch as RectTransform anchors, parent as the hierarchy): move them in Unity's own editor.
// Record fields keep the file's names (UIRecord), so UI.Def / UI.Add port as they are.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    // A UILayout.js record; every field is present (the export fills in the kind's defaults).
    [Serializable]
    public class UIRecord
    {
        public string id = "", kind = "panel", parent = "", anchor = "top-left", stretch = "";
        public float x, y, w, h;
        public string text = "";
        public float fontSize = 20;
        public string color = "", shadow = "", fill = "", border = "";
        public float radius, value, alpha = 1, visible = 1;

        public UIRecord Copy() => (UIRecord)MemberwiseClone();
    }

    public static class UI
    {
        public static readonly string[] Anchors = { "top-left", "top-center", "top-right", "middle-left", "middle-center",
            "middle-right", "bottom-left", "bottom-center", "bottom-right" };
        public static readonly string[] Kinds = { "text", "panel", "bar", "button" };

        static readonly Dictionary<string, UIElement> _elements = new Dictionary<string, UIElement>();
        static RectTransform _root;

        public static RectTransform Root => _root;

        // root — the Canvas; every UIElement under it (hidden ones too) is found by its id.
        public static void Init(RectTransform root)
        {
            _root = root;
            _elements.Clear();
            if (!root) return;
            foreach (var e in root.GetComponentsInChildren<UIElement>(true)) _elements[e.def.id] = e;
        }

        // null for a missing id — guard it: the user may delete an element in the editor.
        public static UIElement Get(string id)
        {
            return id != null && _elements.TryGetValue(id, out var e) && e ? e : null;
        }

        public static IEnumerable<UIElement> Elements => _elements.Values;

        // A copy of the element's record: the template of run-time copies (UI.Add).
        public static UIRecord Def(string id)
        {
            var e = Get(id);
            return e ? e.def.Copy() : null;
        }

        // A run-time element from a record that is not in UILayout.js (a copy of a template).
        public static UIElement Add(UIRecord def)
        {
            if (!_root || def == null || string.IsNullOrEmpty(def.id)) return null;
            Remove(def.id);
            var parent = Get(def.parent);
            var e = UIBuilder.Build(def, parent ? (RectTransform)parent.transform : _root);
            _elements[def.id] = e;
            return e;
        }

        // Removes the element together with everything nested in it.
        public static void Remove(string id)
        {
            var e = Get(id);
            if (!e) return;
            foreach (var c in e.GetComponentsInChildren<UIElement>(true)) _elements.Remove(c.def.id);
            if (Application.isPlaying) UnityEngine.Object.Destroy(e.gameObject);
            else UnityEngine.Object.DestroyImmediate(e.gameObject);
        }

        // Screen size in layout px (the Canvas is scaled by UI_REF_HEIGHT).
        public static Vector2 Size() => _root ? _root.rect.size : Vector2.zero;

        // The element def sits in; null — the screen.
        public static UIElement ParentOf(UIRecord def)
        {
            return string.IsNullOrEmpty(def.parent) ? null : Get(def.parent);
        }

        // --- Anchor math, no uGUI (the kit's UI.resolve) — tests compare it with JS -----------------

        public static (string v, string h) ParseAnchor(string anchor)
        {
            var a = Array.IndexOf(Anchors, anchor) >= 0 ? anchor : "top-left";
            var p = a.Split('-');
            return (p[0], p[1]);
        }

        public static (bool h, bool v) StretchOf(UIRecord def)
        {
            var s = def.kind == "text" ? "" : def.stretch;
            return (s == "h" || s == "both", s == "v" || s == "both");
        }

        // Record -> the top left corner of an element w × h in a container W × H (layout px, y down).
        public static Vector2 Resolve(UIRecord def, float w, float h, float W, float H)
        {
            var a = ParseAnchor(def.anchor);
            var st = StretchOf(def);
            float left = st.h ? def.x : a.h == "right" ? W - def.x - w : a.h == "center" ? W / 2 + def.x - w / 2 : def.x;
            float top = st.v ? def.y : a.v == "bottom" ? H - def.y - h : a.v == "middle" ? H / 2 + def.y - h / 2 : def.y;
            return new Vector2(left, top);
        }
    }
}
