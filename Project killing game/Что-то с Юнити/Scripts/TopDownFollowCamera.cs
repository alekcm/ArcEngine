using UnityEngine;

namespace MapEditorPrototype
{
    public class TopDownFollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private Vector3 offset = new Vector3(0f, 12f, -2f);
        [SerializeField] private Vector3 fixedEulerAngles = new Vector3(70f, 0f, 0f);
        [SerializeField] private float followSmoothness = 12f;
        [SerializeField] private float zoomSpeed = 3f;
        [SerializeField] private Vector2 zoomRange = new Vector2(6f, 20f);

        private float currentHeight;

        private void Awake()
        {
            currentHeight = offset.y;
        }

        public void SetTarget(Transform newTarget)
        {
            target = newTarget;
        }

        private void LateUpdate()
        {
            if (target == null)
            {
                return;
            }

            float scroll = InputHelper.MouseScrollY;
            if (Mathf.Abs(scroll) > 0.01f)
            {
                currentHeight = Mathf.Clamp(currentHeight - scroll * zoomSpeed, zoomRange.x, zoomRange.y);
            }

            Vector3 desiredPosition = target.position + new Vector3(offset.x, currentHeight, offset.z);
            float lerpFactor = 1f - Mathf.Exp(-followSmoothness * Time.deltaTime);

            transform.position = Vector3.Lerp(transform.position, desiredPosition, lerpFactor);
            transform.rotation = Quaternion.Euler(fixedEulerAngles);
        }
    }
}
