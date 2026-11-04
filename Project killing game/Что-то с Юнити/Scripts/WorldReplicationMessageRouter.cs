using UnityEngine;
using Unity.Netcode;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MapEditorPrototype
{
    public class WorldReplicationMessageRouter : MonoBehaviour
    {
        [SerializeField] private NgoNamedMessageBridge messageBridge;
        [SerializeField] private NgoTransportAdapter transportAdapter;
        [SerializeField] private HostWorldReplicationService hostWorldReplicationService;
        [SerializeField] private ClientWorldReplicationService clientWorldReplicationService;
        [SerializeField] private MultiplayerEditApplyService multiplayerEditApplyService;
        [SerializeField] private NetworkSessionManager networkSessionManager;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private EditorUndoRedoSystem undoRedoSystem;

        private readonly WorldNetworkSerializationService serializationService = new WorldNetworkSerializationService(false);

        private void Awake()
        {
            if (messageBridge == null) messageBridge = FindObjectOfType<NgoNamedMessageBridge>();
            if (transportAdapter == null) transportAdapter = FindObjectOfType<NgoTransportAdapter>();
            if (networkSessionManager == null) networkSessionManager = FindObjectOfType<NetworkSessionManager>();
            if (mapSaveSystem == null) mapSaveSystem = FindObjectOfType<MapSaveSystem>();
            if (undoRedoSystem == null) undoRedoSystem = FindObjectOfType<EditorUndoRedoSystem>();
        }

        private void OnEnable()
        {
            if (messageBridge != null)
            {
                messageBridge.SnapshotRequestReceived += HandleSnapshotRequestReceived;
                messageBridge.SnapshotReceived += HandleSnapshotReceived;
                messageBridge.PatchReceived += HandlePatchReceived;
                messageBridge.EditApplyRequestReceived += HandleEditApplyRequestReceived;
            }

            if (multiplayerEditApplyService != null)
            {
                multiplayerEditApplyService.PatchSubmissionRequested += HandleLocalPatchSubmissionRequested;
                multiplayerEditApplyService.PatchAppliedLocally += HandleLocalPatchApplied;
            }

            if (mapSaveSystem != null) mapSaveSystem.WorldReset += BroadcastCurrentWorldToAll;
        }

        private void OnDisable()
        {
            if (messageBridge != null)
            {
                messageBridge.SnapshotRequestReceived -= HandleSnapshotRequestReceived;
                messageBridge.SnapshotReceived -= HandleSnapshotReceived;
                messageBridge.PatchReceived -= HandlePatchReceived;
                messageBridge.EditApplyRequestReceived -= HandleEditApplyRequestReceived;
            }
            if (mapSaveSystem != null) mapSaveSystem.WorldReset -= BroadcastCurrentWorldToAll;
        }

        public async void BroadcastCurrentWorldToAll()
        {
            if (networkSessionManager == null || !networkSessionManager.IsHost || hostWorldReplicationService == null || messageBridge == null) return;
            WorldSnapshotDto snapshotDto = hostWorldReplicationService.BuildSnapshotDto();
            if (snapshotDto == null) return;
            string json = await Task.Run(() => serializationService.SerializeSnapshot(snapshotDto));
            messageBridge.BroadcastSnapshot(json);
        }

        public async void RequestWorldSnapshotFromHost()
        {
            if (messageBridge == null) return;
            for (int i = 0; i < 5; i++)
            {
                messageBridge.RequestSnapshotFromServer();
                await Task.Delay(1000);
                if (clientWorldReplicationService?.LocalReplicatedWorldState != null) break;
            }
        }

        private async void HandleSnapshotRequestReceived(ulong id)
        {
            if (!networkSessionManager.IsHost || hostWorldReplicationService == null) return;
            WorldSnapshotDto snapshotDto = hostWorldReplicationService.BuildSnapshotDto();
            string json = await Task.Run(() => serializationService.SerializeSnapshot(snapshotDto));
            messageBridge.SendSnapshotToClient(id, json);
        }

        private async void HandleSnapshotReceived(ulong id, string payload)
        {
            if (networkSessionManager.IsHost || clientWorldReplicationService == null) return;
            WorldSnapshotDto snapshotDto = await Task.Run(() => serializationService.DeserializeSnapshot(payload));
            if (snapshotDto != null) clientWorldReplicationService.ApplySnapshotDto(snapshotDto);
        }

        private async void HandleEditApplyRequestReceived(ulong senderClientId, string payload)
        {
            if (networkSessionManager == null || !networkSessionManager.IsHost) return;
            
            // Совместимость с Undo (хотя в новой системе это делает сам BuildCommandService)
            undoRedoSystem?.RecordStateBeforeChange();

            EditApplyRequestDto requestDto = await Task.Run(() => serializationService.DeserializeApplyRequest(payload));
            if (requestDto?.patch == null) return;

            WorldPatch patch = WorldNetworkDtoMapper.FromPatchDto(requestDto.patch);
            WorldPatchDto appliedPatchDto = hostWorldReplicationService.CommitPatchAndBuildDto(patch);
            
            if (appliedPatchDto != null)
            {
                string resJson = await Task.Run(() => serializationService.SerializePatch(appliedPatchDto));
                messageBridge.BroadcastPatch(resJson, transportAdapter);
            }
        }

        private async void HandlePatchReceived(ulong id, string payload)
        {
            if (networkSessionManager.IsHost || clientWorldReplicationService == null) return;
            WorldPatchDto patchDto = await Task.Run(() => serializationService.DeserializePatch(payload));
            if (patchDto != null) clientWorldReplicationService.ApplyPatchDto(patchDto);
        }

        private async void HandleLocalPatchSubmissionRequested(EditApplyRequestDto r)
        {
            if (messageBridge == null) return;
            string json = await Task.Run(() => serializationService.SerializeApplyRequest(r));
            messageBridge.SendEditApplyRequestToServer(json);
        }

        private async void HandleLocalPatchApplied(EditApplyResultDto r)
        {
            if (!networkSessionManager.IsHost || r?.appliedPatch == null || messageBridge == null) return;
            string json = await Task.Run(() => serializationService.SerializePatch(r.appliedPatch));
            messageBridge.BroadcastPatch(json, transportAdapter);
        }
    }
}
