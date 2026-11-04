using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using Unity.Netcode;

namespace MapEditorPrototype
{
    public class BuildUiController : MonoBehaviour
    {
        private class SpawnedItemButtonInfo { public Button button; public string itemId; }

        [Header("References")]
        [SerializeField] private BuildSystem buildSystem;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathCatalog pathCatalog;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private EditorUndoRedoSystem undoRedoSystem;
        [SerializeField] private NetworkSessionManager networkSessionManager;

        [Header("Tool Buttons")]
        [SerializeField] private Button objectToolButton;
        [SerializeField] private Button wallToolButton;
        [SerializeField] private Button doorToolButton;
        [SerializeField] private Button windowToolButton;
        [SerializeField] private Button pathToolButton;

        [Header("Layer Buttons")]
        [SerializeField] private Button floorLayerButton;
        [SerializeField] private Button furnitureLayerButton;
        [SerializeField] private Button decorLayerButton;

        [Header("Paint Mode Buttons")]
        [SerializeField] private Button singlePaintModeButton;
        [SerializeField] private Button brushPaintModeButton;
        [SerializeField] private Button rectanglePaintModeButton;

        [Header("History Buttons")]
        [SerializeField] private Button undoButton;
        [SerializeField] private Button redoButton;

        [Header("Path Buttons")]
        [SerializeField] private Button deleteSelectedPathButton;

        [Header("Draft Buttons")]
        [SerializeField] private Button beginDraftButton;
        [SerializeField] private Button applyDraftButton;
        [SerializeField] private Button cancelDraftButton;

        [Header("Save Buttons")]
        [SerializeField] private Button saveButton;
        [SerializeField] private Button loadButton;

        [Header("Dynamic List")]
        [SerializeField] private RectTransform itemButtonContainer;
        [SerializeField] private Button itemButtonPrefab;

        [Header("Labels")]
        [SerializeField] private TMP_Text currentToolLabel;
        [SerializeField] private TMP_Text currentSelectionLabel;
        [SerializeField] private TMP_Text currentLayerLabel;
        [SerializeField] private TMP_Text currentPaintModeLabel;
        [SerializeField] private TMP_Text draftStatusLabel;
        [SerializeField] private TMP_Text savePathLabel;
        [SerializeField] private TMP_Text sessionCodeLabel;
        [SerializeField] private TMP_Text networkDebugLabel;

        private static string lastDebugMsg = "";
        private static List<string> logQueue = new List<string>();

        [Header("Colors")]
        [SerializeField] private Color activeButtonColor = new Color(0.18f, 0.62f, 1f, 1f);
        [SerializeField] private Color inactiveButtonColor = new Color(0.2f, 0.2f, 0.2f, 0.95f);
        [SerializeField] private Color activeTextColor = Color.white;
        [SerializeField] private Color inactiveTextColor = new Color(0.85f, 0.85f, 0.85f, 1f);

        private readonly List<SpawnedItemButtonInfo> spawnedButtons = new List<SpawnedItemButtonInfo>();

        private void Awake() { if (networkSessionManager == null) networkSessionManager = FindObjectOfType<NetworkSessionManager>(); if (buildSystem == null) buildSystem = FindObjectOfType<BuildSystem>(); }

        private void OnEnable()
        {
            Application.logMessageReceived += HandleLog;
            if (buildSystem != null) buildSystem.StateChanged += HandleBuildStateChanged;
            if (buildCatalog != null) { buildCatalog.CatalogChanged += RebuildList; buildCatalog.SelectionChanged += RefreshUi; }
            if (wallCatalog != null) wallCatalog.SelectionChanged += RefreshUi;
            if (pathCatalog != null) pathCatalog.SelectionChanged += RefreshUi;
            if (undoRedoSystem != null) undoRedoSystem.StateChanged += RefreshUi;
            if (networkSessionManager != null) networkSessionManager.SessionChanged += RefreshUi;
        }

        private void Start() { BindStaticButtons(); RebuildList(); RefreshUi(); }

        private void OnDisable() { Application.logMessageReceived -= HandleLog; if (buildSystem != null) buildSystem.StateChanged -= HandleBuildStateChanged; }

        private void BindStaticButtons() {
            BindButton(objectToolButton, () => { buildSystem?.SetTool(BuildToolMode.Object); RebuildList(); });
            BindButton(wallToolButton, () => { buildSystem?.SetTool(BuildToolMode.Wall); RebuildList(); });
            BindButton(doorToolButton, () => { buildSystem?.SetTool(BuildToolMode.Door); RebuildList(); });
            BindButton(windowToolButton, () => { buildSystem?.SetTool(BuildToolMode.Window); RebuildList(); });
            BindButton(pathToolButton, () => { buildSystem?.SetTool(BuildToolMode.Path); RebuildList(); });
            BindButton(floorLayerButton, () => { buildSystem?.SetLayer(BuildLayer.Floor); RebuildList(); });
            BindButton(furnitureLayerButton, () => { buildSystem?.SetLayer(BuildLayer.Furniture); RebuildList(); });
            BindButton(decorLayerButton, () => { buildSystem?.SetLayer(BuildLayer.Decor); RebuildList(); });
            BindButton(singlePaintModeButton, () => { buildSystem?.SetPaintMode(PlacementPaintMode.Single); RefreshUi(); });
            BindButton(brushPaintModeButton, () => { buildSystem?.SetPaintMode(PlacementPaintMode.Brush); RefreshUi(); });
            BindButton(rectanglePaintModeButton, () => { buildSystem?.SetPaintMode(PlacementPaintMode.Rectangle); RefreshUi(); });
            BindButton(undoButton, () => buildSystem?.TriggerUndo());
            BindButton(redoButton, () => buildSystem?.TriggerRedo());
            BindButton(deleteSelectedPathButton, () => buildSystem?.DeleteSelectedPath());
            BindButton(beginDraftButton, () => buildSystem?.BeginEditDraftSession());
            BindButton(applyDraftButton, () => buildSystem?.ApplyEditDraftSessionAsync());
            BindButton(cancelDraftButton, () => buildSystem?.CancelEditDraftSession());
            BindButton(saveButton, () => mapSaveSystem?.SaveDefault());
            BindButton(loadButton, () => { if (NetworkManager.Singleton?.IsClient == true && !NetworkManager.Singleton.IsHost) return; undoRedoSystem?.RecordStateBeforeChange(); mapSaveSystem?.LoadDefault(); });
        }

        private void HandleBuildStateChanged() => RebuildList();

        public void RebuildList() {
            foreach (var b in spawnedButtons) if (b?.button != null) Destroy(b.button.gameObject);
            spawnedButtons.Clear();
            if (itemButtonContainer == null || itemButtonPrefab == null || buildSystem == null) { RefreshUi(); return; }
            switch (buildSystem.CurrentTool) {
                case BuildToolMode.Wall: BuildWallButtons(); break;
                case BuildToolMode.Door: BuildDoorButtons(); break;
                case BuildToolMode.Window: BuildWindowButtons(); break;
                case BuildToolMode.Path: BuildPathButtons(); break;
                default: BuildObjectButtons(); break;
            }
            RefreshUi();
        }

        private void HandleLog(string l, string s, LogType t) { logQueue.Add($"[{t}] {l}"); if (logQueue.Count > 10) logQueue.RemoveAt(0); lastDebugMsg = string.Join("\n", logQueue); }
        private void Update() { if (networkDebugLabel == null) { var go = GameObject.Find("DebugLogText"); if (go != null) networkDebugLabel = go.GetComponent<TMP_Text>(); } if (networkDebugLabel != null) networkDebugLabel.text = lastDebugMsg; if (networkSessionManager?.SessionActive == true && sessionCodeLabel != null && (sessionCodeLabel.text.Contains("None") || sessionCodeLabel.text.Contains("N/A"))) RefreshUi(); }

        public void RefreshUi() {
            if (buildSystem != null) {
                if (currentToolLabel != null) currentToolLabel.text = $"Tool: {buildSystem.CurrentTool}";
                if (currentSelectionLabel != null) currentSelectionLabel.text = buildSystem.SelectedObject != null ? $"Selected: {buildSystem.SelectedObject.Definition.SafeDisplayName}" : "";
                if (currentLayerLabel != null) currentLayerLabel.text = $"Layer: {buildCatalog?.CurrentLayer}";
                if (currentPaintModeLabel != null) currentPaintModeLabel.text = $"Paint: {buildSystem.CurrentPaintMode}";
            }
            if (draftStatusLabel != null) draftStatusLabel.text = buildSystem?.HasActiveEditDraft == true ? "Draft: Active" : "Draft: Inactive";
            if (savePathLabel != null && mapSaveSystem != null) savePathLabel.text = mapSaveSystem.DefaultSavePath;
            if (sessionCodeLabel == null) { var go = GameObject.Find("JoinCodeText"); if (go != null) sessionCodeLabel = go.GetComponent<TMP_Text>(); }
            if (sessionCodeLabel != null && networkSessionManager != null) {
                string r = networkSessionManager.CurrentRole.ToString(), c = string.IsNullOrEmpty(networkSessionManager.CurrentSession.JoinCode) ? "Wait..." : networkSessionManager.CurrentSession.JoinCode;
                sessionCodeLabel.text = networkSessionManager.SessionActive ? $"Session: {r} | Code: {c}" : "Session: None";
            }
            if (undoButton != null) undoButton.interactable = undoRedoSystem?.CanUndo == true;
            if (redoButton != null) redoButton.interactable = undoRedoSystem?.CanRedo == true;

            // ВОЗВРАЩАЕМ ПОДСВЕТКУ
            UpdateStaticButtonHighlights();
            UpdateSpawnedButtonHighlights();
        }

        private void BuildObjectButtons() { if (buildCatalog == null) return; foreach (var item in buildCatalog.FilteredItems) if (item != null) SpawnButton(item.SafeDisplayName, item.id).onClick.AddListener(() => { buildCatalog.Select(item); buildSystem?.SetTool(BuildToolMode.Object); RefreshUi(); }); }
        private void BuildWallButtons() { if (wallCatalog == null) return; for (int i = 0; i < wallCatalog.Walls.Count; i++) { int idx = i; SpawnButton(wallCatalog.Walls[idx].SafeDisplayName, wallCatalog.Walls[idx].id).onClick.AddListener(() => { wallCatalog.SelectWall(idx); buildSystem?.SetTool(BuildToolMode.Wall); RefreshUi(); }); } }
        private void BuildDoorButtons() { if (wallCatalog == null) return; for (int i = 0; i < wallCatalog.Doors.Count; i++) { int idx = i; SpawnButton(wallCatalog.Doors[idx].SafeDisplayName, wallCatalog.Doors[idx].id).onClick.AddListener(() => { wallCatalog.SelectDoor(idx); buildSystem?.SetTool(BuildToolMode.Door); RefreshUi(); }); } }
        private void BuildWindowButtons() { if (wallCatalog == null) return; for (int i = 0; i < wallCatalog.Windows.Count; i++) { int idx = i; SpawnButton(wallCatalog.Windows[idx].SafeDisplayName, wallCatalog.Windows[idx].id).onClick.AddListener(() => { wallCatalog.SelectWindow(idx); buildSystem?.SetTool(BuildToolMode.Window); RefreshUi(); }); } }
        private void BuildPathButtons() { if (pathCatalog == null) return; for (int i = 0; i < pathCatalog.Paths.Count; i++) { int idx = i; SpawnButton(pathCatalog.Paths[idx].SafeDisplayName, pathCatalog.Paths[idx].id).onClick.AddListener(() => { pathCatalog.Select(idx); buildSystem?.SetTool(BuildToolMode.Path); RefreshUi(); }); } }

        private Button SpawnButton(string label, string itemId) {
            Button button = Instantiate(itemButtonPrefab, itemButtonContainer);
            TMP_Text t = button.GetComponentInChildren<TMP_Text>(true);
            if (t != null) t.text = label;
            spawnedButtons.Add(new SpawnedItemButtonInfo { button = button, itemId = itemId });
            return button;
        }

        private void UpdateStaticButtonHighlights() {
            if (buildSystem == null) return;
            SetButtonHighlighted(objectToolButton, buildSystem.CurrentTool == BuildToolMode.Object || buildSystem.CurrentTool == BuildToolMode.Move);
            SetButtonHighlighted(wallToolButton, buildSystem.CurrentTool == BuildToolMode.Wall);
            SetButtonHighlighted(doorToolButton, buildSystem.CurrentTool == BuildToolMode.Door);
            SetButtonHighlighted(windowToolButton, buildSystem.CurrentTool == BuildToolMode.Window);
            SetButtonHighlighted(pathToolButton, buildSystem.CurrentTool == BuildToolMode.Path);

            bool isWallFamily = buildSystem.CurrentTool == BuildToolMode.Wall || buildSystem.CurrentTool == BuildToolMode.Door || buildSystem.CurrentTool == BuildToolMode.Window;
            SetButtonHighlighted(floorLayerButton, !isWallFamily && buildCatalog?.CurrentLayer == BuildLayer.Floor);
            SetButtonHighlighted(furnitureLayerButton, !isWallFamily && buildCatalog?.CurrentLayer == BuildLayer.Furniture);
            SetButtonHighlighted(decorLayerButton, !isWallFamily && buildCatalog?.CurrentLayer == BuildLayer.Decor);

            SetButtonHighlighted(singlePaintModeButton, buildSystem.CurrentPaintMode == PlacementPaintMode.Single);
            SetButtonHighlighted(brushPaintModeButton, buildSystem.CurrentPaintMode == PlacementPaintMode.Brush);
            SetButtonHighlighted(rectanglePaintModeButton, buildSystem.CurrentPaintMode == PlacementPaintMode.Rectangle);
        }

        private void UpdateSpawnedButtonHighlights() {
            string selectedId = null;
            if (buildSystem.CurrentTool == BuildToolMode.Wall) selectedId = wallCatalog?.CurrentWall?.id;
            else if (buildSystem.CurrentTool == BuildToolMode.Door) selectedId = wallCatalog?.CurrentDoor?.id;
            else if (buildSystem.CurrentTool == BuildToolMode.Window) selectedId = wallCatalog?.CurrentWindow?.id;
            else if (buildSystem.CurrentTool == BuildToolMode.Path) selectedId = pathCatalog?.Current?.id;
            else selectedId = buildCatalog?.Current?.id;

            foreach (var info in spawnedButtons) {
                if (info?.button != null) SetButtonHighlighted(info.button, !string.IsNullOrWhiteSpace(selectedId) && info.itemId == selectedId);
            }
        }

        private void SetButtonHighlighted(Button button, bool highlighted) {
            if (button == null) return;
            Color bg = highlighted ? activeButtonColor : inactiveButtonColor;
            Color txt = highlighted ? activeTextColor : inactiveTextColor;
            ColorBlock colors = button.colors;
            colors.normalColor = bg;
            colors.selectedColor = bg;
            button.colors = colors;
            if (button.targetGraphic != null) button.targetGraphic.color = bg;
            TMP_Text t = button.GetComponentInChildren<TMP_Text>(true);
            if (t != null) t.color = txt;
        }

        private void BindButton(Button b, UnityEngine.Events.UnityAction a) { if (b != null) { b.onClick.RemoveAllListeners(); b.onClick.AddListener(a); } }
    }
}
