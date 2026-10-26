// UIBuilder.cs — a UILayout.js record -> uGUI objects. The importer builds the whole layout with it
// (edit time — the elements are real objects of the scene), UI.Add — run-time copies of a template.
// Geometry: anchor — one of 9 points of the container, x/y from it to the same point of the element
// (inward from an edge, signed from the center; layout y goes DOWN, Unity's up); stretch — the axis
// spans the container with inset x (y) from both edges. Numbers are px of a UI_REF_HEIGHT-tall
// screen: the Canvas scales by height (CanvasScaler, match = 1), like the kit's root.
// Look: fill / border (2 px) / radius — a 9-sliced rounded sprite ('arc:rounded' in Arc.Assets),
// alpha — a CanvasGroup (it fades the children too, like CSS opacity), a sized element clips its
// children (RectMask2D, square — not by the radius), text — TextMeshPro, bold, no wrap.
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ArcEngine
{
    public static class UIBuilder
    {
        public const string RoundedPath = "arc:rounded";
        public const float RoundedRadius = 32f;    // px: the corner of the sprite in RoundedPath
        public const float BorderWidth = 2f;

        public static UIElement Build(UIRecord def, RectTransform parent)
        {
            var go = new GameObject(def.id, typeof(RectTransform));
            go.layer = 5;   // UI
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            var e = go.AddComponent<UIElement>();
            e.def = def;
            go.AddComponent<CanvasGroup>().alpha = Mathf.Clamp01(def.alpha);
            Layout(rt, def);

            if (def.kind == "text")
            {
                e.label = Text(go, def, false);
                var fit = go.AddComponent<ContentSizeFitter>();
                fit.horizontalFit = ContentSizeFitter.FitMode.PreferredSize;
                fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            }
            else
            {
                e.body = Box(go, def, def.border != "" ? def.border : def.fill, def.radius);
                if (def.border != "")
                {
                    var inner = Child(rt, "fill");
                    Inset(inner, BorderWidth);
                    Box(inner.gameObject, def, def.fill, Mathf.Max(0f, def.radius - BorderWidth));
                }
                go.AddComponent<RectMask2D>();
                if (def.kind == "bar")
                {
                    var bar = e.valueBar = Child(rt, "value");
                    bar.anchorMin = Vector2.zero;
                    bar.anchorMax = new Vector2(Mathf.Clamp01(def.value), 1f);
                    bar.offsetMin = bar.offsetMax = Vector2.zero;
                    var img = bar.gameObject.AddComponent<Image>();
                    img.color = Arc.Css(def.color) ?? new Color(0.35f, 0.82f, 0.35f);
                    img.raycastTarget = false;
                }
                else if (def.kind == "button")
                {
                    e.body.raycastTarget = true;
                    e.button = go.AddComponent<Button>();
                    e.button.targetGraphic = e.body;
                    var label = Child(rt, "label");
                    label.anchorMin = Vector2.zero;
                    label.anchorMax = Vector2.one;
                    label.offsetMin = label.offsetMax = Vector2.zero;
                    e.label = Text(label.gameObject, def, true);
                }
            }
            e.Apply();
            return e;
        }

        // The record's anchor, offsets and size -> RectTransform (see the header).
        public static void Layout(RectTransform rt, UIRecord def)
        {
            var a = UI.ParseAnchor(def.anchor);
            var st = UI.StretchOf(def);
            float ax = a.h == "left" ? 0f : a.h == "center" ? 0.5f : 1f;
            float ay = a.v == "top" ? 1f : a.v == "middle" ? 0.5f : 0f;
            rt.anchorMin = new Vector2(st.h ? 0f : ax, st.v ? 0f : ay);
            rt.anchorMax = new Vector2(st.h ? 1f : ax, st.v ? 1f : ay);
            rt.pivot = new Vector2(ax, ay);
            rt.anchoredPosition = new Vector2(
                st.h ? def.x * (1f - 2f * ax) : a.h == "right" ? -def.x : def.x,
                st.v ? def.y * (1f - 2f * ay) : a.v == "bottom" ? def.y : -def.y);
            rt.sizeDelta = new Vector2(st.h ? -2f * def.x : def.w, st.v ? -2f * def.y : def.h);
        }

        static RectTransform Child(RectTransform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            return rt;
        }

        static void Inset(RectTransform rt, float px)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(px, px);
            rt.offsetMax = new Vector2(-px, -px);
        }

        static Image Box(GameObject go, UIRecord def, string color, float radius)
        {
            var img = go.AddComponent<Image>();
            var c = Arc.Css(color);
            img.color = c ?? Color.clear;
            img.raycastTarget = false;
            var sprite = radius > 0 && Arc.Assets ? Arc.Assets.Get<Sprite>(RoundedPath) : null;
            if (sprite)
            {
                img.sprite = sprite;
                img.type = Image.Type.Sliced;
                img.pixelsPerUnitMultiplier = RoundedRadius / radius;
            }
            return img;
        }

        static TMP_Text Text(GameObject go, UIRecord def, bool centered)
        {
            var t = go.AddComponent<TextMeshProUGUI>();
            t.text = def.text;
            t.fontSize = def.fontSize > 0 ? def.fontSize : 20f;
            t.fontStyle = FontStyles.Bold;
            t.color = Arc.Css(def.color) ?? Color.white;
            t.textWrappingMode = TextWrappingModes.NoWrap;
            t.raycastTarget = false;
            var h = UI.ParseAnchor(def.anchor).h;
            t.alignment = centered ? TextAlignmentOptions.Center
                : h == "center" ? TextAlignmentOptions.Top : h == "right" ? TextAlignmentOptions.TopRight : TextAlignmentOptions.TopLeft;
            return t;
        }
    }
}
