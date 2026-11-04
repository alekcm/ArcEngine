using UnityEngine;

namespace MapEditorPrototype
{
    public class WorldNetworkSerializationService
    {
        private readonly bool prettyPrint;

        public WorldNetworkSerializationService(bool prettyPrint = false)
        {
            this.prettyPrint = prettyPrint;
        }

        public string SerializeSnapshot(WorldSnapshotDto dto)
        {
            return JsonUtility.ToJson(dto, prettyPrint);
        }

        public WorldSnapshotDto DeserializeSnapshot(string json)
        {
            return string.IsNullOrWhiteSpace(json) ? null : JsonUtility.FromJson<WorldSnapshotDto>(json);
        }

        public string SerializePatch(WorldPatchDto dto)
        {
            return JsonUtility.ToJson(dto, prettyPrint);
        }

        public WorldPatchDto DeserializePatch(string json)
        {
            return string.IsNullOrWhiteSpace(json) ? null : JsonUtility.FromJson<WorldPatchDto>(json);
        }

        public string SerializeApplyRequest(EditApplyRequestDto dto)
        {
            return JsonUtility.ToJson(dto, prettyPrint);
        }

        public EditApplyRequestDto DeserializeApplyRequest(string json)
        {
            return string.IsNullOrWhiteSpace(json) ? null : JsonUtility.FromJson<EditApplyRequestDto>(json);
        }

        public string SerializeApplyResult(EditApplyResultDto dto)
        {
            return JsonUtility.ToJson(dto, prettyPrint);
        }

        public EditApplyResultDto DeserializeApplyResult(string json)
        {
            return string.IsNullOrWhiteSpace(json) ? null : JsonUtility.FromJson<EditApplyResultDto>(json);
        }
    }
}
