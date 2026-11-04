using System.Text;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Изолированная проверка StampWorldStateEmitter (MVP-3, первый шаг).
    ///
    /// НЕ зависит от ClusteredMansionMapGenerator: берёт штамп из
    /// StampLibraryService по id, эмитит его в свежий WorldState через
    /// MapGenerationWorldStateBuilder + StampWorldStateEmitter и применяет
    /// результат существующим MapSaveSystem.ApplyWorldState.
    ///
    /// Так можно убедиться, что эмиттер ставит объекты/стены/дорожки
    /// идентично ручной вставке, ещё до подключения его в генератор.
    ///
    /// Как пользоваться:
    ///  1. Повесить компонент на объект сцены.
    ///  2. Назначить MapSaveSystem, StampLibraryService, BuildCatalog,
    ///     WallCatalog, PathCatalog, GridBuildingSystem.
    ///  3. В Play Mode вызвать контекстное меню "Emit Stamp Into World".
    /// </summary>
    public class StampEmitterSmokeTestController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private StampLibraryService stampLibrary;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathCatalog pathCatalog;
        [SerializeField] private GridBuildingSystem grid;

        [Header("Emit Settings")]
        [SerializeField] private string stampId = "core.stamp.bed_nightstand_basic";
        [SerializeField] private Vector2Int originCell = new Vector2Int(2, 2);
        [SerializeField, Range(0, 3)] private int rotationSteps = 0;
        [SerializeField] private int floor = 0;
        [SerializeField] private bool applyToScene = true;

        private string lastReport;
        public string LastReport => lastReport;

        [ContextMenu("Emit Stamp Into World")]
        public void EmitStampIntoWorld()
        {
            ResolveReferences();

            if (stampLibrary == null)
            {
                SetReport("FAILED: StampLibraryService не назначен.", true);
                return;
            }
            if (buildCatalog == null)
            {
                SetReport("FAILED: BuildCatalog не назначен.", true);
                return;
            }

            StampData stamp = stampLibrary.FindById(stampId);
            if (stamp == null)
            {
                SetReport($"FAILED: штамп '{stampId}' не найден в библиотеке " +
                          "(проверь StreamingAssets/MapGen/Stamps и валидность файла).", true);
                return;
            }

            float cellSize = grid != null ? grid.CellSize : 1f;
            float decorCellSize = grid != null ? grid.DecorCellSize : 0.2f;
            Vector3 gridOrigin = grid != null ? grid.GridOrigin : Vector3.zero;

            var builder = new MapGenerationWorldStateBuilder(
                worldId: "stamp_emit_smoke",
                buildVersion: 1,
                cellSize: cellSize,
                gridOrigin: gridOrigin);

            var emitter = new StampWorldStateEmitter(
                builder, buildCatalog, wallCatalog, pathCatalog,
                cellSize, decorCellSize, gridOrigin);

            StampWorldStateEmitter.EmitResult emit = emitter.Emit(stamp, originCell, rotationSteps, floor);

            var sb = new StringBuilder();
            sb.AppendLine($"[StampEmitter SMOKE] штамп '{stamp.id}' ({stamp.name})");
            sb.AppendLine($"  origin={originCell}, rot={rotationSteps}, floor={floor}");
            sb.AppendLine($"  эмитировано: {emit}");
            sb.AppendLine($"  WorldState: objects={builder.State.Build.PlacedObjects.Count}, " +
                          $"walls={builder.State.Build.Walls.Count}, paths={builder.State.Build.PathStrokes.Count}");

            bool ok = emit.Total > 0 && emit.SkippedUnknownDefinition == 0;

            if (applyToScene)
            {
                if (mapSaveSystem == null)
                {
                    sb.AppendLine("  ВНИМАНИЕ: MapSaveSystem не назначен — применить к сцене нельзя.");
                    ok = false;
                }
                else
                {
                    mapSaveSystem.ApplyWorldState(builder.State);
                    sb.AppendLine("  применено к сцене через MapSaveSystem.ApplyWorldState.");
                }
            }

            SetReport(sb.ToString(), !ok);
        }

        private void ResolveReferences()
        {
            if (mapSaveSystem == null) mapSaveSystem = FindObjectOfType<MapSaveSystem>();
            if (stampLibrary == null) stampLibrary = FindObjectOfType<StampLibraryService>();
            if (buildCatalog == null) buildCatalog = FindObjectOfType<BuildCatalog>();
            if (wallCatalog == null) wallCatalog = FindObjectOfType<WallCatalog>();
            if (pathCatalog == null) pathCatalog = FindObjectOfType<PathCatalog>();
            if (grid == null) grid = FindObjectOfType<GridBuildingSystem>();
        }

        private void SetReport(string report, bool isError)
        {
            lastReport = report;
            if (isError) Debug.LogError(report, this);
            else Debug.Log(report, this);
        }
    }
}
