using UnityEngine;

namespace MapEditorPrototype
{
    public enum ExploreViewMode
    {
        FirstPerson,
        TopDown
    }

    [RequireComponent(typeof(CharacterController))]
    public class ExplorerController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Camera firstPersonCamera;
        [SerializeField] private Camera topDownCamera;
        [SerializeField] private TopDownFollowCamera topDownFollowCamera;
        [SerializeField] private Transform cameraPivot;

        [Header("Movement")]
        [SerializeField] private float moveSpeed = 5f;
        [SerializeField] private float sprintMultiplier = 1.5f;
        [SerializeField] private float jumpHeight = 1.25f;
        [SerializeField] private float gravity = -20f;

        [Header("First Person Look")]
        [SerializeField] private float mouseSensitivity = 2.5f;
        [SerializeField] private float minPitch = -80f;
        [SerializeField] private float maxPitch = 80f;
        [SerializeField] private KeyCode jumpKey = KeyCode.Space;

        [Header("Default State")]
        [SerializeField] private ExploreViewMode startView = ExploreViewMode.FirstPerson;

        public Camera ActiveCamera => currentView == ExploreViewMode.FirstPerson ? firstPersonCamera : topDownCamera;
        public ExploreViewMode CurrentView => currentView;

        private CharacterController characterController;
        private ExploreViewMode currentView;
        private float pitch;
        private float verticalVelocity;
        private bool inputEnabled;
        private bool gameplayEnabled;

        private void Awake()
        {
            characterController = GetComponent<CharacterController>();
            currentView = startView;

            if (topDownFollowCamera != null)
            {
                topDownFollowCamera.SetTarget(transform);
            }

            ApplyGameplayState(false);
        }

        private void Update()
        {
            if (!gameplayEnabled || !inputEnabled)
            {
                return;
            }

            HandleMovement();

            if (currentView == ExploreViewMode.FirstPerson)
            {
                HandleFirstPersonLook();
            }
        }

        public void SetInputEnabled(bool enabled)
        {
            inputEnabled = enabled;
        }

        public void SetGameplayEnabled(bool enabled)
        {
            gameplayEnabled = enabled;
            ApplyGameplayState(enabled);
        }

        public void ToggleView()
        {
            SetView(currentView == ExploreViewMode.FirstPerson ? ExploreViewMode.TopDown : ExploreViewMode.FirstPerson);
        }

        public void SetView(ExploreViewMode viewMode)
        {
            currentView = viewMode;
            ApplyGameplayState(gameplayEnabled);
        }

        public void TeleportTo(Vector3 worldPosition, Quaternion worldRotation)
        {
            bool controllerWasEnabled = characterController != null && characterController.enabled;
            if (characterController != null && controllerWasEnabled)
            {
                characterController.enabled = false;
            }

            transform.SetPositionAndRotation(worldPosition, Quaternion.Euler(0f, worldRotation.eulerAngles.y, 0f));
            verticalVelocity = 0f;

            if (characterController != null && controllerWasEnabled)
            {
                characterController.enabled = true;
            }
        }

        private void ApplyGameplayState(bool enabled)
        {
            if (characterController != null)
            {
                characterController.enabled = enabled;
            }

            if (firstPersonCamera != null)
            {
                firstPersonCamera.gameObject.SetActive(enabled && currentView == ExploreViewMode.FirstPerson);
            }

            if (topDownCamera != null)
            {
                topDownCamera.gameObject.SetActive(enabled && currentView == ExploreViewMode.TopDown);
            }
        }

        private void HandleMovement()
        {
            float horizontal = InputHelper.GetHorizontalRaw();
            float vertical = InputHelper.GetVerticalRaw();

            Vector3 moveDirection;

            if (currentView == ExploreViewMode.FirstPerson)
            {
                moveDirection = transform.right * horizontal + transform.forward * vertical;
            }
            else
            {
                moveDirection = new Vector3(horizontal, 0f, vertical);

                if (moveDirection.sqrMagnitude > 0.001f)
                {
                    transform.forward = moveDirection.normalized;
                }
            }

            moveDirection = Vector3.ClampMagnitude(moveDirection, 1f);

            if (characterController.isGrounded && verticalVelocity < 0f)
            {
                verticalVelocity = -2f;
            }

            if (InputHelper.GetKeyDown(jumpKey) && characterController.isGrounded)
            {
                verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
            }

            verticalVelocity += gravity * Time.deltaTime;

            float currentMoveSpeed = moveSpeed * (InputHelper.GetKey(KeyCode.LeftShift) ? sprintMultiplier : 1f);
            Vector3 velocity = moveDirection * currentMoveSpeed;
            velocity.y = verticalVelocity;

            characterController.Move(velocity * Time.deltaTime);
        }

        private void HandleFirstPersonLook()
        {
            Vector2 mouseDelta = InputHelper.MouseDelta;
            float mouseX = mouseDelta.x * mouseSensitivity;
            float mouseY = mouseDelta.y * mouseSensitivity;

            transform.Rotate(0f, mouseX, 0f);

            pitch -= mouseY;
            pitch = Mathf.Clamp(pitch, minPitch, maxPitch);

            if (cameraPivot != null)
            {
                cameraPivot.localRotation = Quaternion.Euler(pitch, 0f, 0f);
            }
        }
    }
}
