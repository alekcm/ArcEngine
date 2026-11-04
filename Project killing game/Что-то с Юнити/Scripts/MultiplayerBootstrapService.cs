using System.Threading.Tasks;
using UnityEngine;
using Unity.Netcode;

namespace MapEditorPrototype
{
    public class MultiplayerBootstrapService : MonoBehaviour
    {
        [SerializeField] private NetworkSessionManager networkSessionManager;
        [SerializeField] private RelayConnectionService relayConnectionService;
        [SerializeField] private NgoTransportAdapter ngoTransportAdapter;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private WorldReplicationMessageRouter worldReplicationMessageRouter;
        [SerializeField] private int defaultMaxPlayers = 8;
        [SerializeField] private string localPlayerId = "local_player";

        private void Awake()
        {
            Debug.Log("[Bootstrap] Awake triggered.");
            if (networkSessionManager == null) networkSessionManager = FindObjectOfType<NetworkSessionManager>();
            if (relayConnectionService == null) relayConnectionService = FindObjectOfType<RelayConnectionService>();
            if (ngoTransportAdapter == null) ngoTransportAdapter = FindObjectOfType<NgoTransportAdapter>();
            if (mapSaveSystem == null) mapSaveSystem = FindObjectOfType<MapSaveSystem>();
            if (worldReplicationMessageRouter == null) worldReplicationMessageRouter = FindObjectOfType<WorldReplicationMessageRouter>();
        }

        private void Start()
        {
            Debug.Log("[Bootstrap] Start triggered. Registering network callbacks...");
            if (NetworkManager.Singleton != null)
            {
                NetworkManager.Singleton.OnClientConnectedCallback += (id) => {
                    Debug.Log($"[Network] CONNECTED: Client {id}. LocalId: {NetworkManager.Singleton.LocalClientId}");
                };
            }
            else
            {
                Debug.LogError("[Bootstrap] NetworkManager.Singleton is NULL in Start!");
            }
            
            Debug.Log("[Bootstrap] Starting MonitorNetworkStatus loop...");
            InvokeRepeating(nameof(MonitorNetworkStatus), 1f, 2f);
        }

        private void MonitorNetworkStatus()
        {
            if (NetworkManager.Singleton == null)
            {
                Debug.Log("[Network Status] CRITICAL: NetworkManager Singleton is missing!");
                return;
            }

            if (!NetworkManager.Singleton.IsListening)
            {
                Debug.Log("[Network Status] STOPPED: Network is not running. Did you start Host/Client?");
                return;
            }

            int connectedCount = NetworkManager.Singleton.ConnectedClientsIds.Count;
            ulong myId = NetworkManager.Singleton.LocalClientId;
            string role = NetworkManager.Singleton.IsHost ? "HOST" : "CLIENT";

            // Выводим именно то, что тебе нужно: реальный список ID игроков
            string ids = string.Join(", ", NetworkManager.Singleton.ConnectedClientsIds);
            Debug.Log($"[Network Status] {role} (ID:{myId}) | Connected Players: {connectedCount} | IDs: [{ids}]");

            // Проверка префабов игрока на сцене
            var playerObjects = GameObject.FindObjectsByType<NetworkObject>(FindObjectsSortMode.None);
            int playersFound = 0;
            foreach (var netObj in playerObjects)
            {
                if (netObj.IsPlayerObject) playersFound++;
            }
            
            if (playersFound < connectedCount)
            {
                Debug.LogWarning($"[Network] Logic Error: {connectedCount} players connected, but only {playersFound} player objects spawned!");
            }
        }

        public async Task<bool> HostRelaySessionAsync()
        {
            Debug.Log("[Bootstrap] Starting HostRelaySessionAsync...");
            if (relayConnectionService == null || ngoTransportAdapter == null || mapSaveSystem == null || networkSessionManager == null)
            {
                Debug.LogError($"[Bootstrap] Missing components! Relay:{relayConnectionService != null}, NGO:{ngoTransportAdapter != null}, Map:{mapSaveSystem != null}, Session:{networkSessionManager != null}");
                return false;
            }

            RelayAllocationData relayData = await relayConnectionService.CreateRelayHostAsync(defaultMaxPlayers - 1);
            if (relayData == null)
            {
                Debug.LogError($"[Bootstrap] Relay allocation failed: {relayConnectionService.LastError}");
                return false;
            }

            Debug.Log($"[Bootstrap] Relay allocated. JoinCode: {relayData.JoinCode}");

            bool started = ngoTransportAdapter.StartHostWithRelay(relayData);
            if (!started)
            {
                Debug.LogError("[Bootstrap] NGO failed to start host with relay.");
                return false;
            }

            networkSessionManager.StartHostSession(
                mapSaveSystem.CurrentWorldId,
                relayData.JoinCode,
                localPlayerId,
                mapSaveSystem.CurrentBuildVersion,
                mapSaveSystem.CurrentRuntimeVersion,
                defaultMaxPlayers);

            Debug.Log("[Bootstrap] Host session started successfully in NetworkSessionManager.");
            return true;
        }

        public async Task<bool> JoinRelaySessionAsync(string joinCode)
        {
            Debug.Log($"[Bootstrap] Attempting to join relay with code: {joinCode}");
            if (relayConnectionService == null || ngoTransportAdapter == null || networkSessionManager == null)
            {
                Debug.LogError("[Bootstrap] Join failed: Missing components.");
                return false;
            }

            RelayAllocationData relayData = await relayConnectionService.JoinRelayAsync(joinCode);
            if (relayData == null)
            {
                Debug.LogError($"[Bootstrap] Relay join failed: {relayConnectionService.LastError}");
                return false;
            }

            bool started = ngoTransportAdapter.StartClientWithRelay(relayData);
            if (!started)
            {
                Debug.LogError("[Bootstrap] NGO failed to start client.");
                return false;
            }

            networkSessionManager.JoinClientSession(string.Empty, joinCode, string.Empty, 0, 0, defaultMaxPlayers);
            Debug.Log("[Bootstrap] Joined session successfully. Initializing world state...");
            
            // Даем системе 0.5с на регистрацию всех мостов и только потом просим карту
            await Task.Delay(500);
            if (worldReplicationMessageRouter != null)
            {
                worldReplicationMessageRouter.RequestWorldSnapshotFromHost();
            }
            return true;
        }

        public bool HostLanSession(ushort port, string listenAddress = "0.0.0.0")
        {
            if (ngoTransportAdapter == null || mapSaveSystem == null || networkSessionManager == null)
            {
                return false;
            }

            bool started = ngoTransportAdapter.StartHostLan(port, listenAddress);
            if (!started)
            {
                return false;
            }

            networkSessionManager.StartHostSession(
                mapSaveSystem.CurrentWorldId,
                string.Empty,
                localPlayerId,
                mapSaveSystem.CurrentBuildVersion,
                mapSaveSystem.CurrentRuntimeVersion,
                defaultMaxPlayers);
            return true;
        }

        public bool JoinLanSession(string address, ushort port)
        {
            if (ngoTransportAdapter == null || networkSessionManager == null)
            {
                return false;
            }

            bool started = ngoTransportAdapter.StartClientLan(address, port);
            if (!started)
            {
                return false;
            }

            networkSessionManager.JoinClientSession(string.Empty, string.Empty, string.Empty, 0, 0, defaultMaxPlayers);
            worldReplicationMessageRouter?.RequestWorldSnapshotFromHost();
            return true;
        }

        public void ShutdownSession()
        {
            ngoTransportAdapter?.Shutdown();
            networkSessionManager?.EndSession();
        }

        public void SetLocalPlayerId(string playerId)
        {
            localPlayerId = string.IsNullOrWhiteSpace(playerId) ? localPlayerId : playerId;
        }
    }
}
