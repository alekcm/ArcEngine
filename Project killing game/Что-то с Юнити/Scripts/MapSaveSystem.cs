using System;
using System.IO;
using UnityEngine;

namespace MapEditorPrototype
{
    public class MapSaveSystem : MonoBehaviour
    {
        [Header("World References")]
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallSystem wallSystem;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathSystem pathSystem;
        [SerializeField] private PathCatalog pathCatalog;
        [SerializeField] private ExplorerController explorerController;
        [SerializeField] private BuildSystem buildSystem;

        [Header("Persistence")]
        [SerializeField] private string defaultFileName = "map_save.json";
        [SerializeField] private bool prettyPrintJson = true;
        [SerializeField] private string currentWorldId = "default_world";
        [SerializeField] private int currentBuildVersion;
        [SerializeField] private int currentRuntimeVersion;

        private WorldStateCaptureService captureService;
        private WorldStateApplyService applyService;
        private WorldStateSerializationService serializationService;

        public event Action WorldReset; // Событие для синхронизации при Load/Undo

        public string DefaultSavePath => GetPath(defaultFileName);
        public string CurrentWorldId => currentWorldId;
        public int CurrentBuildVersion => currentBuildVersion;
        public int CurrentRuntimeVersion => currentRuntimeVersion;

        private void Awake() { RebuildServices(); }
        private void OnValidate() { if (Application.isPlaying) RebuildServices(); }

        public void SaveDefault() { Save(defaultFileName); }
        public void LoadDefault() { Load(defaultFileName); }

        public void Save(string fileName) { string json = CaptureCurrentStateJson(); string path = GetPath(fileName); File.WriteAllText(path, json); Debug.Log($"Map saved to: {path}"); }
        public void Load(string fileName) { string path = GetPath(fileName); if (!File.Exists(path)) return; string json = File.ReadAllText(path); LoadFromJson(json); Debug.Log($"Map loaded from: {path}"); }

        public string SerializeStateToJson(WorldState state) => state == null ? "" : serializationService.Serialize(state);
        public string CaptureCurrentStateJson() => serializationService.Serialize(CaptureCurrentWorldState());
        public MapSaveData CaptureCurrentStateData() => WorldStateDtoMapper.ToSaveData(CaptureCurrentWorldState());
        public WorldState CaptureCurrentWorldState() { EnsureServices(); return captureService.Capture(currentWorldId, currentBuildVersion, currentRuntimeVersion); }

        public void LoadFromJson(string json)
        {
            EnsureServices();
            if (string.IsNullOrWhiteSpace(json)) return;
            WorldState worldState = serializationService.Deserialize(json);
            if (worldState != null) ApplyWorldState(worldState);
        }

        public async void ApplyWorldState(WorldState worldState)
        {
            EnsureServices();
            if (worldState == null) return;
            currentWorldId = string.IsNullOrWhiteSpace(worldState.WorldId) ? currentWorldId : worldState.WorldId;
            currentBuildVersion = worldState.Versions?.BuildVersion ?? 0;
            currentRuntimeVersion = worldState.Versions?.RuntimeVersion ?? 0;
            
            applyService.Apply(worldState);
            
            // Ждем завершения кадра, чтобы Unity успела создать/удалить объекты
            await System.Threading.Tasks.Task.Delay(50);
            
            WorldReset?.Invoke();
        }

        public void ApplyPatch(WorldPatch patch)
        {
            EnsureServices();
            if (patch == null) return;
            currentBuildVersion = patch.NewBuildVersion;
            applyService.ApplyIncremental(patch);
        }

        public void SetCurrentWorldContext(string id, int bV = 0, int rV = 0) { currentWorldId = id; currentBuildVersion = bV; currentRuntimeVersion = rV; }
        public void IncrementBuildVersion() { currentBuildVersion++; }
        public void IncrementRuntimeVersion() { currentRuntimeVersion++; }

        private void EnsureServices() { if (captureService == null || applyService == null || serializationService == null) RebuildServices(); }
        private void RebuildServices() { captureService = new WorldStateCaptureService(gridBuildingSystem, wallSystem, pathSystem, explorerController); applyService = new WorldStateApplyService(gridBuildingSystem, buildCatalog, wallSystem, wallCatalog, pathSystem, pathCatalog, explorerController, buildSystem); serializationService = new WorldStateSerializationService(prettyPrintJson); }
        private string GetPath(string fileName) => Path.Combine(Application.persistentDataPath, string.IsNullOrWhiteSpace(fileName) ? defaultFileName : fileName);
    }
}
