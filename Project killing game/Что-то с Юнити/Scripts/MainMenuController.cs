using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace MapEditorPrototype
{
    public class MainMenuController : MonoBehaviour
    {
        [Header("Scenes")]
        [SerializeField] private string worldMenuSceneName = "WorldMenu";
        [SerializeField] private string gameSessionSceneName = "GameSession";

        [Header("Panels")]
        [SerializeField] private GameObject mainPanel;
        [SerializeField] private GameObject multiplayerPanel;

        [Header("Multiplayer Host UI")]
        [SerializeField] private TMP_Dropdown hostWorldDropdown;
        [SerializeField] private TMP_InputField lanPortInput;

        [Header("Multiplayer Join UI")]
        [SerializeField] private TMP_InputField relayJoinCodeInput;
        [SerializeField] private TMP_InputField lanAddressInput;
        [SerializeField] private TMP_InputField lanJoinPortInput;

        [Header("Status")]
        [SerializeField] private TMP_Text statusLabel;

        private readonly List<WorldSaveSlotInfo> cachedWorlds = new List<WorldSaveSlotInfo>();

        private void Start()
        {
            RefreshWorldDropdown();
            ShowMainPanel();
        }

        public void ShowMainPanel()
        {
            SetPanelState(true, false);
        }

        public void ShowMultiplayerPanel()
        {
            RefreshWorldDropdown();
            SetPanelState(false, true);
        }

        public void OpenWorldMenu()
        {
            GameLaunchContext.Clear();
            SceneManager.LoadScene(worldMenuSceneName);
        }

        public void HostRelaySelectedWorld()
        {
            WorldSaveSlotInfo slot = GetSelectedHostWorld();
            if (slot == null)
            {
                SetStatus("No world selected for host.");
                return;
            }

            GameLaunchContext.SetHostRelay(slot);
            SceneManager.LoadScene(gameSessionSceneName);
        }

        public void JoinRelayByCode()
        {
            string joinCode = relayJoinCodeInput != null ? relayJoinCodeInput.text.Trim() : string.Empty;
            if (string.IsNullOrWhiteSpace(joinCode))
            {
                SetStatus("Enter relay join code.");
                return;
            }

            GameLaunchContext.SetJoinRelay(joinCode);
            SceneManager.LoadScene(gameSessionSceneName);
        }

        public void HostLanSelectedWorld()
        {
            WorldSaveSlotInfo slot = GetSelectedHostWorld();
            if (slot == null)
            {
                SetStatus("No world selected for LAN host.");
                return;
            }

            ushort port = ParsePort(lanPortInput != null ? lanPortInput.text : string.Empty, 7777);
            GameLaunchContext.SetHostLan(slot, port);
            SceneManager.LoadScene(gameSessionSceneName);
        }

        public void JoinLan()
        {
            string address = lanAddressInput != null ? lanAddressInput.text.Trim() : string.Empty;
            if (string.IsNullOrWhiteSpace(address))
            {
                SetStatus("Enter LAN address.");
                return;
            }

            ushort port = ParsePort(lanJoinPortInput != null ? lanJoinPortInput.text : string.Empty, 7777);
            GameLaunchContext.SetJoinLan(address, port);
            SceneManager.LoadScene(gameSessionSceneName);
        }

        public void QuitGame()
        {
            Application.Quit();
        }

        public void RefreshWorldDropdown()
        {
            cachedWorlds.Clear();
            cachedWorlds.AddRange(WorldLibraryService.GetWorlds());

            if (hostWorldDropdown == null)
            {
                return;
            }

            hostWorldDropdown.ClearOptions();
            List<string> options = new List<string>();
            for (int i = 0; i < cachedWorlds.Count; i++)
            {
                options.Add(cachedWorlds[i].DisplayName);
            }

            if (options.Count == 0)
            {
                options.Add("No saved worlds");
            }

            hostWorldDropdown.AddOptions(options);
            hostWorldDropdown.value = 0;
            hostWorldDropdown.RefreshShownValue();
        }

        private WorldSaveSlotInfo GetSelectedHostWorld()
        {
            if (cachedWorlds.Count == 0 || hostWorldDropdown == null)
            {
                return null;
            }

            int index = Mathf.Clamp(hostWorldDropdown.value, 0, cachedWorlds.Count - 1);
            return cachedWorlds[index];
        }

        private void SetPanelState(bool showMain, bool showMultiplayer)
        {
            if (mainPanel != null)
            {
                mainPanel.SetActive(showMain);
            }

            if (multiplayerPanel != null)
            {
                multiplayerPanel.SetActive(showMultiplayer);
            }
        }

        private ushort ParsePort(string input, ushort fallback)
        {
            return ushort.TryParse(input, out ushort parsed) ? parsed : fallback;
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
