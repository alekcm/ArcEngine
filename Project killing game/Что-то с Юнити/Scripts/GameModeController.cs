using UnityEngine;

namespace MapEditorPrototype
{
    public enum GameMode
    {
        Edit,
        Explore
    }

    public class GameModeController : MonoBehaviour
    {
        [Header("Scene References")]
        [SerializeField] private Camera editorCamera;
        [SerializeField] private EditorCameraController editorCameraController;
        [SerializeField] private GameObject explorerRoot;
        [SerializeField] private ExplorerController explorerController;
        [SerializeField] private Transform exploreSpawnPoint;

        [Header("Input")]
        [SerializeField] private KeyCode toggleModeKey = KeyCode.Tab;
        [SerializeField] private KeyCode toggleViewKey = KeyCode.V;
        [SerializeField] private bool moveExplorerToSpawnWhenEnteringExplore;
        [SerializeField] private bool keepExplorerActiveInEditMode = true;

        public GameMode CurrentMode { get; private set; } = GameMode.Edit;
        public Camera ActiveCamera => CurrentMode == GameMode.Edit ? editorCamera : explorerController != null ? explorerController.ActiveCamera : null;

        private void Start()
        {
            ApplyMode(forceSpawn: false);
        }

        private void Update()
        {
            if (InputHelper.GetKeyDown(toggleModeKey))
            {
                ToggleMode();
            }

            if (CurrentMode == GameMode.Explore && explorerController != null && InputHelper.GetKeyDown(toggleViewKey))
            {
                explorerController.ToggleView();
            }
        }

        public void ToggleMode()
        {
            CurrentMode = CurrentMode == GameMode.Edit ? GameMode.Explore : GameMode.Edit;
            bool shouldMoveToSpawn = CurrentMode == GameMode.Explore && moveExplorerToSpawnWhenEnteringExplore;
            ApplyMode(shouldMoveToSpawn);
        }

        public void SetMode(GameMode mode)
        {
            CurrentMode = mode;
            ApplyMode(CurrentMode == GameMode.Explore && moveExplorerToSpawnWhenEnteringExplore);
        }

        private void ApplyMode(bool forceSpawn)
        {
            bool isEditMode = CurrentMode == GameMode.Edit;

            if (editorCamera != null)
            {
                editorCamera.gameObject.SetActive(isEditMode);
            }

            if (editorCameraController != null)
            {
                editorCameraController.enabled = isEditMode;
            }

            if (explorerRoot != null)
            {
                explorerRoot.SetActive(keepExplorerActiveInEditMode || !isEditMode);
            }

            if (explorerController != null)
            {
                explorerController.SetGameplayEnabled(!isEditMode);
                explorerController.SetInputEnabled(!isEditMode);

                if (!isEditMode && forceSpawn && exploreSpawnPoint != null)
                {
                    explorerController.TeleportTo(exploreSpawnPoint.position, exploreSpawnPoint.rotation);
                }
            }

            Cursor.lockState = isEditMode ? CursorLockMode.None : CursorLockMode.Locked;
            Cursor.visible = isEditMode;
        }
    }
}
