using System.Collections;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Runtime smoke checks for the MVP-2 generation pipeline.
    ///
    /// This is not a formal unit test framework. It is a practical play-mode helper:
    /// generate -> validate -> apply -> save -> load -> capture -> compare basic counts.
    /// Use it from the component context menu while the scene is running.
    /// </summary>
    public class MapGenerationSmokeTestController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private ClusteredMansionMapGenerator generator;
        [SerializeField] private MapSaveSystem mapSaveSystem;

        [Header("Smoke Test")]
        [SerializeField] private string smokeTestFileName = "map_generation_smoke_test.json";
        [SerializeField] private float waitAfterApplySeconds = 0.15f;
        [SerializeField] private float waitAfterLoadSeconds = 0.25f;
        [SerializeField] private bool requirePlacedObjects = true;
        [SerializeField] private bool requireWalls = true;
        [SerializeField] private bool requirePaths;
        [SerializeField] private bool compareExactCounts = true;

        private string lastSmokeTestReport;
        public string LastSmokeTestReport => lastSmokeTestReport;

        [ContextMenu("Run Generate Save Load Smoke Test")]
        public void RunGenerateSaveLoadSmokeTest()
        {
            if (!Application.isPlaying)
            {
                Debug.LogError("MapGenerationSmokeTestController can run only in Play Mode.", this);
                return;
            }

            StartCoroutine(RunGenerateSaveLoadSmokeTestCoroutine());
        }

        public IEnumerator RunGenerateSaveLoadSmokeTestCoroutine()
        {
            ResolveReferences();

            if (generator == null)
            {
                SetReport("SMOKE TEST FAILED: ClusteredMansionMapGenerator is not assigned.", true);
                yield break;
            }

            if (mapSaveSystem == null)
            {
                SetReport("SMOKE TEST FAILED: MapSaveSystem is not assigned.", true);
                yield break;
            }

            generator.GenerateAndApply();
            yield return new WaitForSeconds(Mathf.Max(0f, waitAfterApplySeconds));

            if (generator.LastValidation != null && !generator.LastValidation.IsValid)
            {
                SetReport("SMOKE TEST FAILED: generated map is invalid.\n" + generator.LastValidationReport, true);
                yield break;
            }

            WorldState beforeSave = mapSaveSystem.CaptureCurrentWorldState();
            WorldStateCounts beforeCounts = WorldStateCounts.From(beforeSave);
            string precheckError = ValidateCounts("before save", beforeCounts);
            if (!string.IsNullOrWhiteSpace(precheckError))
            {
                SetReport("SMOKE TEST FAILED: " + precheckError + "\n" + FormatCounts("Before save", beforeCounts), true);
                yield break;
            }

            mapSaveSystem.Save(smokeTestFileName);
            mapSaveSystem.Load(smokeTestFileName);
            yield return new WaitForSeconds(Mathf.Max(0f, waitAfterLoadSeconds));

            WorldState afterLoad = mapSaveSystem.CaptureCurrentWorldState();
            WorldStateCounts afterCounts = WorldStateCounts.From(afterLoad);
            string postcheckError = ValidateCounts("after load", afterCounts);
            if (!string.IsNullOrWhiteSpace(postcheckError))
            {
                SetReport("SMOKE TEST FAILED: " + postcheckError + "\n" + FormatCounts("Before save", beforeCounts) + "\n" + FormatCounts("After load", afterCounts), true);
                yield break;
            }

            if (compareExactCounts && !beforeCounts.Equals(afterCounts))
            {
                SetReport(
                    "SMOKE TEST FAILED: captured counts changed after save/load.\n" +
                    FormatCounts("Before save", beforeCounts) + "\n" +
                    FormatCounts("After load", afterCounts),
                    true);
                yield break;
            }

            SetReport(
                "SMOKE TEST PASSED\n" +
                FormatCounts("Before save", beforeCounts) + "\n" +
                FormatCounts("After load", afterCounts) + "\n" +
                "Generator report:\n" + generator.LastValidationReport,
                false);
        }

        private void ResolveReferences()
        {
            if (generator == null) generator = FindObjectOfType<ClusteredMansionMapGenerator>();
            if (mapSaveSystem == null) mapSaveSystem = FindObjectOfType<MapSaveSystem>();
        }

        private string ValidateCounts(string phase, WorldStateCounts counts)
        {
            if (requirePlacedObjects && counts.PlacedObjects <= 0)
            {
                return $"No placed objects captured {phase}.";
            }

            if (requireWalls && counts.Walls <= 0)
            {
                return $"No walls captured {phase}.";
            }

            if (requirePaths && counts.PathStrokes <= 0)
            {
                return $"No path strokes captured {phase}.";
            }

            return null;
        }

        private void SetReport(string report, bool error)
        {
            lastSmokeTestReport = report;
            if (error)
            {
                Debug.LogError(report, this);
            }
            else
            {
                Debug.Log(report, this);
            }
        }

        private static string FormatCounts(string label, WorldStateCounts counts)
        {
            return $"{label}: objects={counts.PlacedObjects}, walls={counts.Walls}, paths={counts.PathStrokes}";
        }

        private struct WorldStateCounts
        {
            public int PlacedObjects;
            public int Walls;
            public int PathStrokes;

            public static WorldStateCounts From(WorldState state)
            {
                if (state == null || state.Build == null)
                {
                    return default;
                }

                return new WorldStateCounts
                {
                    PlacedObjects = state.Build.PlacedObjects != null ? state.Build.PlacedObjects.Count : 0,
                    Walls = state.Build.Walls != null ? state.Build.Walls.Count : 0,
                    PathStrokes = state.Build.PathStrokes != null ? state.Build.PathStrokes.Count : 0
                };
            }

            public bool Equals(WorldStateCounts other)
            {
                return PlacedObjects == other.PlacedObjects && Walls == other.Walls && PathStrokes == other.PathStrokes;
            }
        }
    }
}
