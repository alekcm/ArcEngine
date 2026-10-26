// UIElement.cs — one interface element: its record (def) + what the game has set at run time
// (text, value, visibility, click handler), like UIElement in js/UI.js.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ArcEngine
{
    public class UIElement : MonoBehaviour
    {
        public UIRecord def = new UIRecord();
        public TMP_Text label;            // text and button: the label
        public Image body;                // panel, bar, button: the fill (the border color when def.border)
        public RectTransform valueBar;    // bar: the filled part
        public Button button;

        string _text;
        float? _value;
        bool? _shown;
        Action<UIElement> _click;

        public UIElement SetText(string text)
        {
            _text = text ?? "";
            Apply();
            return this;
        }

        // Bar fill 0..1.
        public UIElement SetValue(float v)
        {
            _value = Mathf.Clamp01(v);
            Apply();
            return this;
        }

        public UIElement Show(bool on = true)
        {
            _shown = on;
            Apply();
            return this;
        }

        public UIElement OnClick(Action fn)
        {
            _click = fn == null ? (Action<UIElement>)null : _ => fn();
            return this;
        }

        public UIElement OnClick(Action<UIElement> fn)
        {
            _click = fn;
            return this;
        }

        public bool Visible => _shown ?? def.visible != 0;

        void Awake()
        {
            if (button) button.onClick.AddListener(() => { if (_click != null) _click(this); });
        }

        // Run-time state -> uGUI. The look itself (anchors, colors, sizes) is the record's, built once.
        public void Apply()
        {
            if (label) label.text = _text ?? def.text;
            if (valueBar)
            {
                float v = _value ?? Mathf.Clamp01(def.value);
                valueBar.anchorMax = new Vector2(v, 1f);
            }
            if (gameObject.activeSelf != Visible) gameObject.SetActive(Visible);
        }
    }
}
