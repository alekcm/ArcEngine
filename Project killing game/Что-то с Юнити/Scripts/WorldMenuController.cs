using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MapEditorPrototype
{
    public class WorldMenuController : MonoBehaviour
    {
        [SerializeField] private string mainMenuSceneName = "MainMenu";
        [SerializeField] private string gameSessionSceneName = "GameSession";
        [SerializeField] private TMP_Dropdown worldDropdown;
        [SerializeField] private TMP_InputField newWorldNameInput;
        [SerializeField] private TMP_Text statusLabel;

        private readonly List<WorldSaveSlotInfo> cachedWorlds = new List<WorldSaveSlotInfo>();

        private void Start()
        {
            RefreshWorldList();
        }

        public void RefreshWorldList()
        {
            cachedWorlds.Clear();
            cachedWorlds.AddRange(WorldLibraryService.GetWorlds());

            if (worldDropdown == null)
            {
                return;
            }

            worldDropdown.ClearOptions();
            List<string> options = new List<string>();
            for (int i = 0; i < cachedWorlds.Count; i++)
            {
                options.Add(cachedWorlds[i].DisplayName);
            }

            if (options.Count == 0)
            {
                options.Add("No worlds");
            }

            worldDropdown.AddOptions(options);
            worldDropdown.value = 0;
            worldDropdown.RefreshShownValue();
        }

        public void CreateWorldAndEdit()
        {
            string worldName = newWorldNameInput != null ? newWorldNameInput.text.Trim() : string.Empty;
            WorldSaveSlotInfo slot = WorldLibraryService.CreateWorld(string.IsNullOrWhiteSpace(worldName) ? "NewWorld" : worldName);
            if (slot == null)
            {
                SetStatus("Failed to create world.");
                return;
            }

            GameLaunchContext.SetSoloEdit(slot);
            SceneManager.LoadScene(gameSessionSceneName);
        }

        public void EditSelectedWorld()
        {
            WorldSaveSlotInfo slot = GetSelectedWorld();
            if (slot == null)
            {
                SetStatus("No world selected.");
                return;
            }

            GameLaunchContext.SetSoloEdit(slot);
            SceneManager.LoadScene(gameSessionSceneName);
        }

        public void DeleteSelectedWorld()
        {
            WorldSaveSlotInfo slot = GetSelectedWorld();
            if (slot == null)
            {
                SetStatus("No world selected.");
                return;
            }

            if (WorldLibraryService.DeleteWorld(slot))
            {
                SetStatus($"Deleted world: {slot.DisplayName}");
                RefreshWorldList();
            }
            else
            {
                SetStatus("Failed to delete world.");
            }
        }

        public void ReturnToMainMenu()
        {
            GameLaunchContext.Clear();
            SceneManager.LoadScene(mainMenuSceneName);
        }

        private WorldSaveSlotInfo GetSelectedWorld()
        {
            if (cachedWorlds.Count == 0 || worldDropdown == null)
            {
                return null;
            }

            int index = Mathf.Clamp(worldDropdown.value, 0, cachedWorlds.Count - 1);
            return cachedWorlds[index];
        }

        private void SetStatus(string message)
        {
            if (statusLabel != null)
            {
                statusLabel.text = message;
            }
        }
    }
}
