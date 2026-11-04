using System;
using UnityEngine;
using Unity.Netcode;
using Unity.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MapEditorPrototype
{
    public class NgoNamedMessageBridge : MonoBehaviour
    {
        public const string SnapshotRequestMessage = "world_snapshot_request";
        public const string SnapshotMessage = "world_snapshot";
        public const string PatchMessage = "world_patch";
        public const string EditApplyRequestMessage = "edit_apply_request";
        public const string EditApplyResultMessage = "edit_apply_result";

        public event Action<ulong> SnapshotRequestReceived;
        public event Action<ulong, string> SnapshotReceived;
        public event Action<ulong, string> PatchReceived;
        public event Action<ulong, string> EditApplyRequestReceived;
        public event Action<ulong, string> EditApplyResultReceived;

        private bool isRegistered = false;

        private void OnEnable()
        {
            if (NetworkManager.Singleton != null)
            {
                NetworkManager.Singleton.OnClientConnectedCallback += HandleClientConnected;
                NetworkManager.Singleton.OnClientDisconnectCallback += HandleClientDisconnected;
            }
        }

        private void OnDisable()
        {
            if (NetworkManager.Singleton != null)
            {
                NetworkManager.Singleton.OnClientConnectedCallback -= HandleClientConnected;
                NetworkManager.Singleton.OnClientDisconnectCallback -= HandleClientDisconnected;
            }
        }

        private void HandleClientConnected(ulong id)
        {
            Debug.Log($"[Bridge] CLIENT CONNECTED: {id}. Total clients: {NetworkManager.Singleton.ConnectedClientsIds.Count}");
            if (!isRegistered && NetworkManager.Singleton.IsListening) 
                RegisterHandlers(NetworkManager.Singleton.CustomMessagingManager);
        }

        private void HandleClientDisconnected(ulong id)
        {
            Debug.Log($"[Bridge] CLIENT DISCONNECTED: {id}");
        }

        private void Update()
        {
            if (!isRegistered && NetworkManager.Singleton != null && NetworkManager.Singleton.IsListening)
            {
                var messenger = NetworkManager.Singleton.CustomMessagingManager;
                if (messenger != null) RegisterHandlers(messenger);
            }
        }

        private void RegisterHandlers(CustomMessagingManager messenger)
        {
            if (messenger == null) return;

            messenger.RegisterNamedMessageHandler(SnapshotRequestMessage, (id, reader) => { SnapshotRequestReceived?.Invoke(id); });
            messenger.RegisterNamedMessageHandler(SnapshotMessage, (id, reader) => ReceiveLargeMessage(id, reader, SnapshotReceived));
            messenger.RegisterNamedMessageHandler(PatchMessage, (id, reader) => ReceiveLargeMessage(id, reader, PatchReceived));
            messenger.RegisterNamedMessageHandler(EditApplyRequestMessage, (id, reader) => ReceiveLargeMessage(id, reader, EditApplyRequestReceived));
            messenger.RegisterNamedMessageHandler(EditApplyResultMessage, (id, reader) => ReceiveLargeMessage(id, reader, EditApplyResultReceived));

            isRegistered = true;
            Debug.Log("[Bridge] REGISTERED: Ready for large data transfers.");
        }

        private void ReceiveLargeMessage(ulong senderId, FastBufferReader reader, Action<ulong, string> callback)
        {
            try {
                reader.ReadValueSafe(out int byteCount);
                byte[] bytes = new byte[byteCount];
                reader.ReadBytesSafe(ref bytes, byteCount);
                string json = System.Text.Encoding.UTF8.GetString(bytes);
                callback?.Invoke(senderId, json);
            } catch (Exception e) {
                Debug.LogError($"[Bridge] Error receiving large message: {e.Message}");
            }
        }

        public void RequestSnapshotFromServer() { SendToServer(SnapshotRequestMessage, ""); }
        public void SendSnapshotToClient(ulong clientId, string json) { SendToClient(clientId, SnapshotMessage, json); }

        public void BroadcastPatch(string json, NgoTransportAdapter transportAdapter)
        {
            if (NetworkManager.Singleton == null) return;
            foreach (var id in NetworkManager.Singleton.ConnectedClientsIds)
            {
                if (id != NetworkManager.Singleton.LocalClientId) SendToClient(id, PatchMessage, json);
            }
        }

        public void BroadcastSnapshot(string json)
        {
            if (NetworkManager.Singleton == null) return;
            foreach (var id in NetworkManager.Singleton.ConnectedClientsIds)
            {
                if (id != NetworkManager.Singleton.LocalClientId) SendToClient(id, SnapshotMessage, json);
            }
        }

        public void SendEditApplyRequestToServer(string json) { SendToServer(EditApplyRequestMessage, json); }
        public void SendEditApplyResultToClient(ulong clientId, string json) { SendToClient(clientId, EditApplyResultMessage, json); }

        private void SendToServer(string name, string json)
        {
            if (NetworkManager.Singleton != null && NetworkManager.Singleton.IsConnectedClient)
                SendToClient(NetworkManager.ServerClientId, name, json);
        }

        private async void SendToClient(ulong clientId, string messageName, string json)
        {
            var messenger = NetworkManager.Singleton?.CustomMessagingManager;
            if (messenger == null) return;

            byte[] bytes = await Task.Run(() => System.Text.Encoding.UTF8.GetBytes(json ?? ""));
            int totalSize = bytes.Length + 4;

            using (var writer = new FastBufferWriter(totalSize, Allocator.Temp, 1024 * 1024))
            {
                try {
                    writer.WriteValueSafe(bytes.Length);
                    writer.WriteBytesSafe(bytes);
                    messenger.SendNamedMessage(messageName, clientId, writer, NetworkDelivery.ReliableFragmentedSequenced);
                } catch (Exception e) {
                    Debug.LogError($"[Bridge] Send Error: {e.Message}");
                }
            }
        }
    }
}
