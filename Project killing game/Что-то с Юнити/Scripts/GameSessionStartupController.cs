using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MapEditorPrototype
{
    public class GameSessionStartupController : MonoBehaviour
    {
        [SerializeField] private string fallbackMainMenuSceneName = "MainMenu";
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private MultiplayerBootstrapService multiplayerBootstrapService;
        [SerializeField] private NetworkSessionManager networkSessionManager;
        [SerializeField] private TMP_Text statusLabel;

        private void Awake()
        {
            if (multiplayerBootstrapService == null) multiplayerBootstrapService = FindObjectOfType<MultiplayerBootstrapService>();
            if (networkSessionManager == null) networkSessionManager = FindObjectOfType<NetworkSessionManager>();
            if (mapSaveSystem == null) mapSaveSystem = FindObjectOfType<MapSaveSystem>();
        }

        private async void Start()
        {
            await InitializeAsync();
        }

        public async Task InitializeAsync()
        {
            GameLaunchConfig config = GameLaunchContext.Current;
            Debug.Log($"[Startup] Initializing session. Mode: {config?.Mode}, WorldId: {config?.WorldId}");

            if (config == null || config.Mode == SessionLaunchMode.None)
            {
                SetStatus("No launch config. Returning to main menu.");
                await Task.Delay(1000);
                SceneManager.LoadScene(fallbackMainMenuSceneName);
                return;
            }

            switch (config.Mode)
            {
                case SessionLaunchMode.SoloEdit:
                    LoadWorldFromConfig(config);
                    networkSessionManager?.StartSoloSession(config.WorldId);
                    SetStatus($"Loaded solo world: {config.WorldId}");
                    break;
                case SessionLaunchMode.HostRelay:
                    LoadWorldFromConfig(config);
                    SetStatus("Starting relay host...");
                    if (multiplayerBootstrapService != null)
                    {
                        Debug.Log("[Startup] Calling HostRelaySessionAsync...");
                        bool hostStarted = await multiplayerBootstrapService.HostRelaySessionAsync();
                        if (hostStarted && networkSessionManager != null)
                        {
                            SetStatus($"Relay host started. Code: {networkSessionManager.CurrentSession.JoinCode}");
                        }
                        else
                        {
                            SetStatus(hostStarted ? "Relay host started." : "Failed to start relay host.");
                        }
                    }
                    else
                    {
                        Debug.LogError("[Startup] multiplayerBootstrapService is NULL!");
                    }
                    break;
                case SessionLaunchMode.JoinRelay:
                    SetStatus("Joining relay...");
                    if (multiplayerBootstrapService != null)
                    {
                        bool joined = await multiplayerBootstrapService.JoinRelaySessionAsync(config.JoinCode);
                        SetStatus(joined ? "Joined relay session." : "Failed to join relay session.");
                    }
                    break;
                case SessionLaunchMode.HostLan:
                    LoadWorldFromConfig(config);
                    SetStatus("Starting LAN host...");
                    if (multiplayerBootstrapService != null)
                    {
                        bool lanHostStarted = multiplayerBootstrapService.HostLanSession(config.Port);
                        SetStatus(lanHostStarted ? "LAN host started." : "Failed to start LAN host.");
                    }
                    break;
                case SessionLaunchMode.JoinLan:
                    SetStatus("Joining LAN session...");
                    if (multiplayerBootstrapService != null)
                    {
                        bool lanJoined = multiplayerBootstrapService.JoinLanSession(config.Address, config.Port);
                        SetStatus(lanJoined ? "Joined LAN session." : "Failed to join LAN session.");
                    }
                    break;
            }
        }

        public void ReturnToMainMenu()
        {
            multiplayerBootstrapService?.ShutdownSession();
            GameLaunchContext.Clear();
            SceneManager.LoadScene(fallbackMainMenuSceneName);
        }

        private void LoadWorldFromConfig(GameLaunchConfig config)
        {
            Debug.Log("[Startup] Loading world from config...");
            if (mapSaveSystem == null)
            {
                Debug.LogError("[Startup] mapSaveSystem is NULL!");
                return;
            }

            if (!string.IsNullOrWhiteSpace(config.WorldId))
            {
                mapSaveSystem.SetCurrentWorldContext(config.WorldId);
            }

            if (!string.IsNullOrWhiteSpace(config.WorldFileName) && WorldLibraryService.Exists(config.WorldFileName))
            {
                mapSaveSystem.Load(config.WorldFileName);
            }
            else
            {
                Debug.Log("[Startup] Creating new world state (no file found or provided).");
                mapSaveSystem.ApplyWorldState(new WorldState { WorldId = string.IsNullOrWhiteSpace(config.WorldId) ? System.Guid.NewGuid().ToString("N") : config.WorldId });
            }
        }

        private void SetStatus(string message)
        {
            Debug.Log($"[Status] {message}");
            if (statusLabel != null)
            {
                statusLabel.text = message;
            }
        }
    }
}
