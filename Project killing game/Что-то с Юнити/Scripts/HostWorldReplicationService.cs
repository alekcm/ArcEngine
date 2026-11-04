using UnityEngine;

namespace MapEditorPrototype
{
    public class HostWorldReplicationService : MonoBehaviour
    {
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private NetworkSessionManager networkSessionManager;

        private readonly WorldPatchApplyService patchApplyService = new WorldPatchApplyService();

        public WorldState AuthoritativeWorldState { get; private set; }

        public WorldSnapshotDto BuildSnapshotDto()
        {
            CaptureAuthoritativeStateFromScene();
            return WorldNetworkDtoMapper.ToSnapshotDto(AuthoritativeWorldState);
        }

        public WorldPatchDto CommitPatchAndBuildDto(WorldPatch patch)
        {
            if (patch == null || !patch.HasAnyChanges) return null;

            if (AuthoritativeWorldState == null) CaptureAuthoritativeStateFromScene();
            if (AuthoritativeWorldState == null) return null;

            // 1. Применяем изменения к данным сервера
            patchApplyService.Apply(AuthoritativeWorldState, patch);
            
            // 2. ВАЖНО: Физически обновляем сцену Хоста, чтобы он увидел новые объекты клиента
            mapSaveSystem?.ApplyPatch(patch);

            if (networkSessionManager != null && AuthoritativeWorldState.Versions != null)
            {
                networkSessionManager.UpdateVersions(AuthoritativeWorldState.Versions.BuildVersion, AuthoritativeWorldState.Versions.RuntimeVersion);
            }

            return WorldNetworkDtoMapper.ToPatchDto(patch);
        }

        public void CaptureAuthoritativeStateFromScene()
        {
            if (mapSaveSystem == null) return;
            AuthoritativeWorldState = mapSaveSystem.CaptureCurrentWorldState();
        }
    }
}
