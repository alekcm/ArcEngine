using UnityEngine;

namespace MapEditorPrototype
{
    public class ClientWorldReplicationService : MonoBehaviour
    {
        [SerializeField] private MapSaveSystem mapSaveSystem;

        private readonly WorldPatchApplyService patchApplyService = new WorldPatchApplyService();

        public WorldState LocalReplicatedWorldState { get; private set; }

        public void ApplySnapshotDto(WorldSnapshotDto snapshotDto)
        {
            if (snapshotDto == null || mapSaveSystem == null) return;

            Debug.Log($"[ClientReplication] Applying full snapshot. Objects: {snapshotDto.placedObjects.Count}, Walls: {snapshotDto.walls.Count}");
            LocalReplicatedWorldState = WorldNetworkDtoMapper.FromSnapshotDto(snapshotDto);
            mapSaveSystem.ApplyWorldState(LocalReplicatedWorldState);
        }

        public void ApplyPatchDto(WorldPatchDto patchDto)
        {
            if (patchDto == null || mapSaveSystem == null) return;

            if (LocalReplicatedWorldState == null)
                LocalReplicatedWorldState = mapSaveSystem.CaptureCurrentWorldState();

            WorldPatch patch = WorldNetworkDtoMapper.FromPatchDto(patchDto);
            
            // 1. Обновляем данные в памяти
            patchApplyService.Apply(LocalReplicatedWorldState, patch);
            
            // 2. Обновляем ФИЗИЧЕСКУЮ СЦЕНУ инкрементально (без удаления всего мира!)
            mapSaveSystem.ApplyPatch(patch);
        }
    }
}
