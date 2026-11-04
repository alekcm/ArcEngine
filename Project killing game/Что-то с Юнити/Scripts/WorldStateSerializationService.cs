using UnityEngine;

namespace MapEditorPrototype
{
    public class WorldStateSerializationService
    {
        private readonly bool prettyPrintJson;

        public WorldStateSerializationService(bool prettyPrintJson)
        {
            this.prettyPrintJson = prettyPrintJson;
        }

        public string Serialize(WorldState worldState)
        {
            MapSaveData dto = WorldStateDtoMapper.ToSaveData(worldState);
            return JsonUtility.ToJson(dto, prettyPrintJson);
        }

        public WorldState Deserialize(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            MapSaveData dto = JsonUtility.FromJson<MapSaveData>(json);
            return dto != null ? WorldStateDtoMapper.FromSaveData(dto) : null;
        }
    }
}
