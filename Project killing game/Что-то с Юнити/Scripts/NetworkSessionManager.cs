using System;
using UnityEngine;

namespace MapEditorPrototype
{
    public enum NetworkSessionRole
    {
        None,
        Solo,
        Host,
        Client
    }

    [Serializable]
    public class SessionMetadata
    {
        public string SessionId;
        public string JoinCode;
        public string WorldId;
        public string HostPlayerId;
        public int BuildVersion;
        public int RuntimeVersion;
        public int MaxPlayers = 8;
    }

    public class NetworkSessionManager : MonoBehaviour
    {
        [SerializeField] private NetworkSessionRole currentRole = NetworkSessionRole.None;
        [SerializeField] private SessionMetadata currentSession = new SessionMetadata();
        [SerializeField] private bool sessionActive;

        public event Action SessionChanged;

        public NetworkSessionRole CurrentRole => currentRole;
        public SessionMetadata CurrentSession => currentSession;
        public bool SessionActive => sessionActive;
        public bool IsHost => currentRole == NetworkSessionRole.Host;
        public bool IsClient => currentRole == NetworkSessionRole.Client;
        public bool IsSolo => currentRole == NetworkSessionRole.Solo;

        public void StartSoloSession(string worldId)
        {
            currentRole = NetworkSessionRole.Solo;
            sessionActive = true;
            currentSession = new SessionMetadata
            {
                SessionId = Guid.NewGuid().ToString("N"),
                WorldId = worldId,
                JoinCode = string.Empty
            };
            SessionChanged?.Invoke();
        }

        public void StartHostSession(string worldId, string joinCode, string hostPlayerId, int buildVersion, int runtimeVersion, int maxPlayers = 8)
        {
            currentRole = NetworkSessionRole.Host;
            sessionActive = true;
            currentSession = new SessionMetadata
            {
                SessionId = Guid.NewGuid().ToString("N"),
                JoinCode = joinCode,
                WorldId = worldId,
                HostPlayerId = hostPlayerId,
                BuildVersion = buildVersion,
                RuntimeVersion = runtimeVersion,
                MaxPlayers = maxPlayers
            };
            SessionChanged?.Invoke();
        }

        public void JoinClientSession(string worldId, string joinCode, string hostPlayerId, int buildVersion, int runtimeVersion, int maxPlayers = 8)
        {
            currentRole = NetworkSessionRole.Client;
            sessionActive = true;
            currentSession = new SessionMetadata
            {
                SessionId = Guid.NewGuid().ToString("N"),
                JoinCode = joinCode,
                WorldId = worldId,
                HostPlayerId = hostPlayerId,
                BuildVersion = buildVersion,
                RuntimeVersion = runtimeVersion,
                MaxPlayers = maxPlayers
            };
            SessionChanged?.Invoke();
        }

        public void UpdateVersions(int buildVersion, int runtimeVersion)
        {
            if (currentSession == null)
            {
                currentSession = new SessionMetadata();
            }

            currentSession.BuildVersion = buildVersion;
            currentSession.RuntimeVersion = runtimeVersion;
            SessionChanged?.Invoke();
        }

        public void EndSession()
        {
            currentRole = NetworkSessionRole.None;
            sessionActive = false;
            currentSession = new SessionMetadata();
            SessionChanged?.Invoke();
        }
    }
}
