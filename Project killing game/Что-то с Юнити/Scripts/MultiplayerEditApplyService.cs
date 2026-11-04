using System;
using UnityEngine;
using System.Threading.Tasks;

namespace MapEditorPrototype
{
    public class MultiplayerEditApplyService : MonoBehaviour
    {
        [SerializeField] private EditDraftSessionController editDraftSessionController;
        [SerializeField] private NetworkSessionManager networkSessionManager;
        [SerializeField] private HostWorldReplicationService hostWorldReplicationService;
        [SerializeField] private ClientWorldReplicationService clientWorldReplicationService;

        public event Action<EditApplyRequestDto> PatchSubmissionRequested;
        public event Action<EditApplyResultDto> PatchAppliedLocally;

        public async Task SubmitPatchDirectAsync(WorldPatch patch)
        {
            if (patch == null || !patch.HasAnyChanges) return;

            EditApplyRequestDto request = await Task.Run(() => new EditApplyRequestDto
            {
                worldId = patch.WorldId,
                authorPlayerId = "local_player",
                patch = WorldNetworkDtoMapper.ToPatchDto(patch)
            });

            if (networkSessionManager != null && networkSessionManager.IsHost && hostWorldReplicationService != null)
            {
                WorldPatch realPatch = WorldNetworkDtoMapper.FromPatchDto(request.patch);
                WorldPatchDto appliedPatchDto = hostWorldReplicationService.CommitPatchAndBuildDto(realPatch);
                if (appliedPatchDto != null)
                {
                    clientWorldReplicationService?.ApplyPatchDto(appliedPatchDto);
                    PatchAppliedLocally?.Invoke(new EditApplyResultDto { accepted = true, appliedPatch = appliedPatchDto });
                }
            }
            else
            {
                PatchSubmissionRequested?.Invoke(request);
            }
        }

        public async Task SubmitCurrentDraftAsync(string authorPlayerId)
        {
            if (editDraftSessionController == null) return;
            WorldPatch patch = await editDraftSessionController.ApplyDraftSessionAsync();
            await SubmitPatchDirectAsync(patch);
        }
    }
}
