using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace MapEditorPrototype
{
    public static class InputHelper
    {
        private const float MouseDeltaScale = 0.05f;

        public static bool GetKey(KeyCode keyCode)
        {
#if ENABLE_INPUT_SYSTEM
            if (Keyboard.current != null && TryMapKeyCode(keyCode, out Key key))
            {
                return Keyboard.current[key].isPressed;
            }

            return false;
#else
            return Input.GetKey(keyCode);
#endif
        }

        public static bool GetKeyDown(KeyCode keyCode)
        {
#if ENABLE_INPUT_SYSTEM
            if (Keyboard.current != null && TryMapKeyCode(keyCode, out Key key))
            {
                return Keyboard.current[key].wasPressedThisFrame;
            }

            return false;
#else
            return Input.GetKeyDown(keyCode);
#endif
        }

        public static bool GetMouseButton(int button)
        {
#if ENABLE_INPUT_SYSTEM
            if (Mouse.current == null)
            {
                return false;
            }

            switch (button)
            {
                case 0: return Mouse.current.leftButton.isPressed;
                case 1: return Mouse.current.rightButton.isPressed;
                case 2: return Mouse.current.middleButton.isPressed;
                default: return false;
            }
#else
            return Input.GetMouseButton(button);
#endif
        }

        public static bool GetMouseButtonDown(int button)
        {
#if ENABLE_INPUT_SYSTEM
            if (Mouse.current == null)
            {
                return false;
            }

            switch (button)
            {
                case 0: return Mouse.current.leftButton.wasPressedThisFrame;
                case 1: return Mouse.current.rightButton.wasPressedThisFrame;
                case 2: return Mouse.current.middleButton.wasPressedThisFrame;
                default: return false;
            }
#else
            return Input.GetMouseButtonDown(button);
#endif
        }

        public static bool GetMouseButtonUp(int button)
        {
#if ENABLE_INPUT_SYSTEM
            if (Mouse.current == null)
            {
                return false;
            }

            switch (button)
            {
                case 0: return Mouse.current.leftButton.wasReleasedThisFrame;
                case 1: return Mouse.current.rightButton.wasReleasedThisFrame;
                case 2: return Mouse.current.middleButton.wasReleasedThisFrame;
                default: return false;
            }
#else
            return Input.GetMouseButtonUp(button);
#endif
        }

        public static float GetHorizontalRaw()
        {
#if ENABLE_INPUT_SYSTEM
            float value = 0f;
            if (GetKey(KeyCode.A) || GetKey(KeyCode.LeftArrow)) value -= 1f;
            if (GetKey(KeyCode.D) || GetKey(KeyCode.RightArrow)) value += 1f;
            return Mathf.Clamp(value, -1f, 1f);
#else
            return Input.GetAxisRaw("Horizontal");
#endif
        }

        public static float GetVerticalRaw()
        {
#if ENABLE_INPUT_SYSTEM
            float value = 0f;
            if (GetKey(KeyCode.S) || GetKey(KeyCode.DownArrow)) value -= 1f;
            if (GetKey(KeyCode.W) || GetKey(KeyCode.UpArrow)) value += 1f;
            return Mathf.Clamp(value, -1f, 1f);
#else
            return Input.GetAxisRaw("Vertical");
#endif
        }

        public static Vector2 MousePosition
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
#else
                return Input.mousePosition;
#endif
            }
        }

        public static Vector2 MouseDelta
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                if (Mouse.current == null)
                {
                    return Vector2.zero;
                }

                return Mouse.current.delta.ReadValue() * MouseDeltaScale;
#else
                return new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y"));
#endif
            }
        }

        public static float MouseScrollY
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                if (Mouse.current == null)
                {
                    return 0f;
                }

                float value = Mouse.current.scroll.ReadValue().y;
                if (Mathf.Abs(value) > 10f)
                {
                    value /= 120f;
                }

                return value;
#else
                return Input.mouseScrollDelta.y;
#endif
            }
        }

#if ENABLE_INPUT_SYSTEM
        private static bool TryMapKeyCode(KeyCode keyCode, out Key key)
        {
            switch (keyCode)
            {
                case KeyCode.A: key = Key.A; return true;
                case KeyCode.B: key = Key.B; return true;
                case KeyCode.C: key = Key.C; return true;
                case KeyCode.D: key = Key.D; return true;
                case KeyCode.E: key = Key.E; return true;
                case KeyCode.F: key = Key.F; return true;
                case KeyCode.G: key = Key.G; return true;
                case KeyCode.H: key = Key.H; return true;
                case KeyCode.I: key = Key.I; return true;
                case KeyCode.J: key = Key.J; return true;
                case KeyCode.K: key = Key.K; return true;
                case KeyCode.L: key = Key.L; return true;
                case KeyCode.M: key = Key.M; return true;
                case KeyCode.N: key = Key.N; return true;
                case KeyCode.O: key = Key.O; return true;
                case KeyCode.P: key = Key.P; return true;
                case KeyCode.Q: key = Key.Q; return true;
                case KeyCode.R: key = Key.R; return true;
                case KeyCode.S: key = Key.S; return true;
                case KeyCode.T: key = Key.T; return true;
                case KeyCode.U: key = Key.U; return true;
                case KeyCode.V: key = Key.V; return true;
                case KeyCode.W: key = Key.W; return true;
                case KeyCode.X: key = Key.X; return true;
                case KeyCode.Y: key = Key.Y; return true;
                case KeyCode.Z: key = Key.Z; return true;

                case KeyCode.Alpha0: key = Key.Digit0; return true;
                case KeyCode.Alpha1: key = Key.Digit1; return true;
                case KeyCode.Alpha2: key = Key.Digit2; return true;
                case KeyCode.Alpha3: key = Key.Digit3; return true;
                case KeyCode.Alpha4: key = Key.Digit4; return true;
                case KeyCode.Alpha5: key = Key.Digit5; return true;
                case KeyCode.Alpha6: key = Key.Digit6; return true;
                case KeyCode.Alpha7: key = Key.Digit7; return true;
                case KeyCode.Alpha8: key = Key.Digit8; return true;
                case KeyCode.Alpha9: key = Key.Digit9; return true;

                case KeyCode.Space: key = Key.Space; return true;
                case KeyCode.Tab: key = Key.Tab; return true;
                case KeyCode.Return: key = Key.Enter; return true;
                case KeyCode.Backspace: key = Key.Backspace; return true;
                case KeyCode.Delete: key = Key.Delete; return true;
                case KeyCode.LeftBracket: key = Key.LeftBracket; return true;
                case KeyCode.RightBracket: key = Key.RightBracket; return true;
                case KeyCode.Escape: key = Key.Escape; return true;
                case KeyCode.LeftShift: key = Key.LeftShift; return true;
                case KeyCode.RightShift: key = Key.RightShift; return true;
                case KeyCode.LeftControl: key = Key.LeftCtrl; return true;
                case KeyCode.RightControl: key = Key.RightCtrl; return true;
                case KeyCode.LeftAlt: key = Key.LeftAlt; return true;
                case KeyCode.RightAlt: key = Key.RightAlt; return true;
                case KeyCode.UpArrow: key = Key.UpArrow; return true;
                case KeyCode.DownArrow: key = Key.DownArrow; return true;
                case KeyCode.LeftArrow: key = Key.LeftArrow; return true;
                case KeyCode.RightArrow: key = Key.RightArrow; return true;
                case KeyCode.F1: key = Key.F1; return true;
                case KeyCode.F2: key = Key.F2; return true;
                case KeyCode.F3: key = Key.F3; return true;
                case KeyCode.F4: key = Key.F4; return true;
                case KeyCode.F5: key = Key.F5; return true;
                case KeyCode.F6: key = Key.F6; return true;
                case KeyCode.F7: key = Key.F7; return true;
                case KeyCode.F8: key = Key.F8; return true;
                case KeyCode.F9: key = Key.F9; return true;
                case KeyCode.F10: key = Key.F10; return true;
                case KeyCode.F11: key = Key.F11; return true;
                case KeyCode.F12: key = Key.F12; return true;

                default:
                    key = Key.None;
                    return false;
            }
        }
#endif
    }
}
