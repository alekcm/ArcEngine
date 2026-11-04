using UnityEngine;
using UnityEngine.EventSystems;

namespace MapEditorPrototype
{
    public class EditorCameraController : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField] private float moveSpeed = 12f;
        [SerializeField] private float fastMultiplier = 2.5f;
        [SerializeField] private float verticalSpeed = 8f;

        [Header("Look")]
        [SerializeField] private float lookSensitivity = 3f;
        [SerializeField] private bool requireRightMouseToLook = true;
        [SerializeField] private float minPitch = 20f;
        [SerializeField] private float maxPitch = 85f;

        [Header("Zoom")]
        [SerializeField] private float zoomSpeed = 12f;
        [SerializeField] private float minHeight = 3f;
        [SerializeField] private float maxHeight = 50f;

        private float yaw;
        private float pitch;

        private void Start()
        {
            Vector3 euler = transform.rotation.eulerAngles;
            yaw = euler.y;
            pitch = NormalizeAngle(euler.x);
            pitch = Mathf.Clamp(pitch, minPitch, maxPitch);
        }

        private void Update()
        {
            HandleMovement();
            HandleLook();
            HandleZoom();
            ClampHeight();
        }

        private void HandleMovement()
        {
            Vector3 input = new Vector3(InputHelper.GetHorizontalRaw(), 0f, InputHelper.GetVerticalRaw());
            input = Vector3.ClampMagnitude(input, 1f);

            Quaternion flatRotation = Quaternion.Euler(0f, yaw, 0f);
            float speed = moveSpeed * (InputHelper.GetKey(KeyCode.LeftShift) ? fastMultiplier : 1f);

            Vector3 move = flatRotation * input * speed;

            float vertical = 0f;
            if (InputHelper.GetKey(KeyCode.E)) vertical += 1f;
            if (InputHelper.GetKey(KeyCode.Q)) vertical -= 1f;

            move += Vector3.up * (vertical * verticalSpeed);
            transform.position += move * Time.deltaTime;
        }

        private void HandleLook()
        {
            if (requireRightMouseToLook && !InputHelper.GetMouseButton(1))
            {
                return;
            }

            Vector2 mouseDelta = InputHelper.MouseDelta;
            yaw += mouseDelta.x * lookSensitivity;
            pitch -= mouseDelta.y * lookSensitivity;
            pitch = Mathf.Clamp(pitch, minPitch, maxPitch);

            transform.rotation = Quaternion.Euler(pitch, yaw, 0f);
        }

        private void HandleZoom()
        {
            // Колесо занято UI (скролл списка тегов/библиотеки штампов
            // или canvas-элемент под курсором) — камера не зумит.
            if (UiInputGuard.IsScrollBlocked || IsPointerOverCanvasUi())
            {
                return;
            }

            float scroll = InputHelper.MouseScrollY;
            if (Mathf.Abs(scroll) < 0.01f)
            {
                return;
            }

            transform.position += transform.forward * (scroll * zoomSpeed);
        }

        private bool IsPointerOverCanvasUi()
        {
            return EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
        }

        private void ClampHeight()
        {
            Vector3 position = transform.position;
            position.y = Mathf.Clamp(position.y, minHeight, maxHeight);
            transform.position = position;
        }

        private float NormalizeAngle(float angle)
        {
            if (angle > 180f)
            {
                angle -= 360f;
            }

            return angle;
        }
    }
}
