// ОБНОВЛЕНО для этажей: курсор и базовая высота учитывают активный этаж.
// ЗАМЕНЯЕТ Assets/Scripts/BuildSystem.cs.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.EventSystems;
using Unity.Netcode;

namespace MapEditorPrototype
{
    public class BuildSystem : MonoBehaviour
    {
        [Serializable]
        private class PendingMoveState
        {
            public BuildingDefinition definition;
            public Vector2Int originCell;
            public int rotationSteps;
            public float rotationY;
            public bool useGridPlacement;
            public float baseY;
            public Vector3 worldPosition;
            public string undoSnapshotJson;
        }

        private struct CursorContext
        {
            public Ray ray;
            public Vector3 planePoint;
            public bool hasPhysicsHit;
            public RaycastHit physicsHit;
            public PlacedObject hoveredPlacedObject;
            public PathStroke hoveredPathStroke;
            public PathHandleMarker hoveredPathHandleMarker;
        }

        private struct ObjectPlacementPreview
        {
            public bool useGridPlacement;
            public Vector2Int originCell;
            public Vector3 worldPosition;
            public float baseY;
            public float yRotation;
            public bool canPlace;
        }

        [Header("References")]
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private WallSystem wallSystem;
        [SerializeField] private PathSystem pathSystem;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathCatalog pathCatalog;
        [SerializeField] private BuildPreview buildPreview;
        [SerializeField] private WallLinePreviewManager wallLinePreviewManager;
        [SerializeField] private GridObjectPreviewManager gridObjectPreviewManager;
        [SerializeField] private PathPreviewRenderer pathPreviewRenderer;
        [SerializeField] private PathEditingHandlesRenderer pathEditingHandlesRenderer;
        [SerializeField] private EditDraftSessionController editDraftSessionController;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private EditorUndoRedoSystem undoRedoSystem;
        [SerializeField] private MultiplayerEditApplyService multiplayerEditApplyService;

        [Header("Input")]
        [SerializeField] private KeyCode rotateKey = KeyCode.R;
        [SerializeField] private KeyCode deleteKey = KeyCode.X;
        [SerializeField] private KeyCode moveSelectedKey = KeyCode.M;
        [SerializeField] private KeyCode cancelKey = KeyCode.Escape;
        [SerializeField] private KeyCode objectToolKey = KeyCode.F1;
        [SerializeField] private KeyCode wallToolKey = KeyCode.F2;
        [SerializeField] private KeyCode doorToolKey = KeyCode.F3;
        [SerializeField] private KeyCode windowToolKey = KeyCode.F4;
        [SerializeField] private KeyCode pathToolKey = KeyCode.F6;
        [SerializeField] private KeyCode saveKey = KeyCode.F5;
        [SerializeField] private KeyCode loadKey = KeyCode.F9;
        [SerializeField] private LayerMask placementRaycastMask = ~0;

        [Header("Settings")]
        [SerializeField] private float stackedSurfacePadding = 0.01f;
        [SerializeField] private float pathWidthStep = 0.25f;
        [SerializeField] private KeyCode increasePathWidthKey = KeyCode.RightBracket;
        [SerializeField] private KeyCode decreasePathWidthKey = KeyCode.LeftBracket;
        [SerializeField] private KeyCode deleteSelectedPathKey = KeyCode.Delete;

        private int rotationSteps;
        private PlacedObject selectedObject;
        private PendingMoveState pendingMove;
        private BuildToolMode activeTool = BuildToolMode.Object;
        private PlacementPaintMode paintMode = PlacementPaintMode.Single;

        private bool isObjectBrushPainting, isObjectRectanglePainting, isWallBrushPainting, isWallRectanglePainting;
        private Vector2Int objectPaintStartCell, wallRectangleStartCell, objectPaintLastCell;
        private WallEdge wallPaintLastEdge;
        private float objectPaintBaseY;

        private readonly List<Vector3> activePathPoints = new List<Vector3>();
        private bool isPathDrawing, dragSessionRecordedChange, pathDragDirty;
        private PathStroke selectedPathStroke;
        private int selectedPathPointIndex = -1, selectedPathWidthSegmentIndex = -1;
        private bool isDraggingPathPoint;

        private BuildWorldCommandService buildCommandService;
        public event Action StateChanged;

        public BuildToolMode CurrentTool => pendingMove != null ? BuildToolMode.Move : activeTool;
        public PlacementPaintMode CurrentPaintMode => paintMode;
        public PlacedObject SelectedObject => selectedObject;
        public bool HasPendingMove => pendingMove != null;
        public bool HasSelectedPath => selectedPathStroke != null;
        public bool HasActiveEditDraft => editDraftSessionController != null && editDraftSessionController.HasActiveDraft;

        private void Awake()
        {
            if (wallLinePreviewManager == null) wallLinePreviewManager = GetComponentInChildren<WallLinePreviewManager>() ?? new GameObject("WallLinePreviewManager").AddComponent<WallLinePreviewManager>();
            if (gridObjectPreviewManager == null) gridObjectPreviewManager = GetComponentInChildren<GridObjectPreviewManager>() ?? new GameObject("GridObjectPreviewManager").AddComponent<GridObjectPreviewManager>();
            if (multiplayerEditApplyService == null) multiplayerEditApplyService = FindObjectOfType<MultiplayerEditApplyService>();
            RebuildCommandService();
        }

        private void OnEnable() { if (undoRedoSystem != null) undoRedoSystem.StateChanged += HandleUndoRedoStateChanged; }
        private void OnDisable() { if (undoRedoSystem != null) undoRedoSystem.StateChanged -= HandleUndoRedoStateChanged; }
        private void Start() { RefreshPreviewDefinition(); NotifyStateChanged(); }

        private void Update()
        {
            if (gameModeController == null || gridBuildingSystem == null || buildCatalog == null || buildPreview == null) return;
            if (selectedObject == null && !ReferenceEquals(selectedObject, null)) { selectedObject = null; NotifyStateChanged(); }
            if (selectedPathStroke == null && !ReferenceEquals(selectedPathStroke, null)) { DeselectPathStroke(); NotifyStateChanged(); }

            if (gameModeController.CurrentMode != GameMode.Edit) { buildPreview.SetVisible(false); ResetInteractionStates(); return; }

            HandleGlobalInput();
            switch (CurrentTool)
            {
                case BuildToolMode.Wall: case BuildToolMode.Door: case BuildToolMode.Window: HandleWallTool(); break;
                case BuildToolMode.Path: HandlePathTool(); break;
                default: HandleObjectTool(); break;
            }
        }

        public void SetTool(BuildToolMode tool) { if (tool == BuildToolMode.Move) return; if (pendingMove != null) CancelPendingMoveAndRestore(); activeTool = tool; ResetInteractionStates(); DeselectCurrentObject(); DeselectPathStroke(); RefreshPreviewDefinition(); NotifyStateChanged(); }
        public void SetLayer(BuildLayer l) { if (pendingMove != null) CancelPendingMoveAndRestore(); buildCatalog.SetLayer(l); activeTool = BuildToolMode.Object; ResetInteractionStates(); RefreshPreviewDefinition(); NotifyStateChanged(); }
        public void SetPaintMode(PlacementPaintMode m) { if (paintMode == m) return; paintMode = m; ResetDragStates(); NotifyStateChanged(); }

        public void ResetTransientEditorState() { DeselectCurrentObject(); DeselectPathStroke(); pendingMove = null; rotationSteps = 0; activeTool = BuildToolMode.Object; paintMode = PlacementPaintMode.Single; ResetInteractionStates(); RefreshPreviewDefinition(); if (buildPreview != null) buildPreview.SetVisible(false); NotifyStateChanged(); }
        private void RebuildCommandService() { buildCommandService = new BuildWorldCommandService(gridBuildingSystem, wallSystem, pathSystem, mapSaveSystem, undoRedoSystem); }
        private void UpdateCommandServiceDraftMode() { if (buildCommandService != null) buildCommandService.SuppressBuildVersionTracking = HasActiveEditDraft; }
        private void EnsureDraftSessionStarted() { if (editDraftSessionController != null && !editDraftSessionController.HasActiveDraft) editDraftSessionController.BeginDraftSession(); UpdateCommandServiceDraftMode(); }
        public bool BeginEditDraftSession() { if (editDraftSessionController == null) return false; bool res = editDraftSessionController.BeginDraftSession(); NotifyStateChanged(); return res; }
        public async Task<WorldPatch> ApplyEditDraftSessionAsync() { if (editDraftSessionController == null || !editDraftSessionController.HasActiveDraft) return null; WorldPatch patch = await editDraftSessionController.ApplyDraftSessionAsync(); UpdateCommandServiceDraftMode(); NotifyStateChanged(); return patch; }
        public void CancelEditDraftSession() { if (editDraftSessionController == null || !editDraftSessionController.HasActiveDraft) return; editDraftSessionController.CancelDraftSession(); ResetInteractionStates(); NotifyStateChanged(); }
        public void ClearEditDraftSession() { editDraftSessionController?.ClearDraftSession(); UpdateCommandServiceDraftMode(); NotifyStateChanged(); }

        public async void TriggerUndo() { if (undoRedoSystem == null || !undoRedoSystem.CanUndo) return; WorldPatch bwd = undoRedoSystem.Undo(); if (bwd != null) { mapSaveSystem?.ApplyPatch(bwd); if (multiplayerEditApplyService != null) await multiplayerEditApplyService.SubmitPatchDirectAsync(bwd); } }
        public async void TriggerRedo() { if (undoRedoSystem == null || !undoRedoSystem.CanRedo) return; WorldPatch fwd = undoRedoSystem.Redo(); if (fwd != null) { mapSaveSystem?.ApplyPatch(fwd); if (multiplayerEditApplyService != null) await multiplayerEditApplyService.SubmitPatchDirectAsync(fwd); } }

        private void HandleGlobalInput()
        {
            if (InputHelper.GetKeyDown(objectToolKey)) SetTool(BuildToolMode.Object);
            if (InputHelper.GetKeyDown(wallToolKey)) SetTool(BuildToolMode.Wall);
            if (InputHelper.GetKeyDown(doorToolKey)) SetTool(BuildToolMode.Door);
            if (InputHelper.GetKeyDown(windowToolKey)) SetTool(BuildToolMode.Window);
            if (InputHelper.GetKeyDown(pathToolKey)) SetTool(BuildToolMode.Path);
            if (InputHelper.GetKeyDown(saveKey) && buildCommandService != null) buildCommandService.SaveWorld();
            if (InputHelper.GetKeyDown(loadKey) && buildCommandService != null) { ClearEditDraftSession(); buildCommandService.LoadWorld(); }
            if (InputHelper.GetKeyDown(cancelKey)) { if (pendingMove != null) CancelPendingMoveAndRestore(); else if (isPathDrawing) ResetPathDrawing(); }
            HandleSelectionInput();
        }

        private void HandleSelectionInput()
        {
            if (pendingMove != null) return;
            bool changed = false; float scroll = InputHelper.MouseScrollY;
            if (scroll > 0.01f) { SelectNextForCurrentTool(); changed = true; }
            else if (scroll < -0.01f) { SelectPreviousForCurrentTool(); changed = true; }
            if (changed) { RefreshPreviewDefinition(); NotifyStateChanged(); }
        }

        private void HandleObjectTool()
        {
            BuildingDefinition def = GetCurrentObjectDefinition();
            buildPreview.SetDefinition(def);
            if (!TryGetCursorContext(out CursorContext ctx)) { buildPreview.SetVisible(false); if (gridObjectPreviewManager != null) gridObjectPreviewManager.HideAll(); ResetDragStatesIfMouseReleased(); return; }
            bool hasP = TryBuildObjectPlacement(def, ctx, out ObjectPlacementPreview p);

            if (hasP && (isObjectBrushPainting || isObjectRectanglePainting) && paintMode != PlacementPaintMode.Single)
            {
                buildPreview.SetVisible(false);
                List<Vector2Int> cells = isObjectBrushPainting ? GetGridLine(objectPaintStartCell, p.originCell) : GetGridRectangle(objectPaintStartCell, p.originCell);
                gridObjectPreviewManager?.UpdatePreview(gridBuildingSystem, def, cells, rotationSteps, p.baseY);
            }
            else
            {
                gridObjectPreviewManager?.HideAll(); buildPreview.SetVisible(hasP);
                if (hasP) buildPreview.UpdatePose(p.worldPosition, Quaternion.Euler(0f, p.yRotation, 0f), p.canPlace);
            }

            if (HandleObjectPaintInput(def, hasP, p)) return;
            if (!IsPointerOverUi() && InputHelper.GetMouseButtonDown(0))
            {
                if (ShouldSelectHoveredObject(def, ctx.hoveredPlacedObject)) SelectObject(ctx.hoveredPlacedObject);
                else if (hasP && p.canPlace) { PlaceObjectFromPreview(def, p); FinalizeMassPlacement(); }
                else DeselectCurrentObject();
                NotifyStateChanged();
            }
            if (InputHelper.GetKeyDown(deleteKey))
            {
                if (selectedObject != null) { EnsureDraftSessionStarted(); buildCommandService?.DeletePlacedObject(selectedObject, true); selectedObject = null; FinalizeMassPlacement(); }
                else if (ctx.hoveredPlacedObject != null) { EnsureDraftSessionStarted(); buildCommandService?.DeletePlacedObject(ctx.hoveredPlacedObject, true); FinalizeMassPlacement(); }
                NotifyStateChanged();
            }
            if (InputHelper.GetKeyDown(rotateKey)) { if (selectedObject != null) RotateSelectedObject(); else { rotationSteps = (rotationSteps + 1) % 4; NotifyStateChanged(); } }
        }

        private void HandleWallTool()
        {
            if (wallSystem == null || wallCatalog == null || buildPreview == null) return;
            GameObject pf = (CurrentTool == BuildToolMode.Wall) ? wallCatalog.CurrentWall?.prefab : (CurrentTool == BuildToolMode.Door) ? wallCatalog.CurrentDoor?.prefab : wallCatalog.CurrentWindow?.prefab;
            buildPreview.SetPrefab(pf);
            if (!TryGetMouseWorldPosition(out Vector3 mPos) || !wallSystem.TryGetNearestEdge(mPos, out WallEdge edge, out Vector3 ePos, out Quaternion eRot)) { buildPreview.SetVisible(false); if (wallLinePreviewManager != null) wallLinePreviewManager.HideAll(); return; }

            if (isWallBrushPainting && paintMode == PlacementPaintMode.Brush)
            {
                buildPreview.SetVisible(false); var line = GetWallEdgeLine(wallPaintLastEdge, edge);
                if (wallLinePreviewManager != null) { wallLinePreviewManager.SetPrefab(pf); wallLinePreviewManager.UpdatePreview(wallSystem, line); }
            }
            else if (isWallRectanglePainting && paintMode == PlacementPaintMode.Rectangle)
            {
                buildPreview.SetVisible(false); var rect = GetWallRectangleEdges(wallRectangleStartCell, gridBuildingSystem.WorldToCell(mPos, BuildLayer.Furniture));
                if (wallLinePreviewManager != null) { wallLinePreviewManager.SetPrefab(pf); wallLinePreviewManager.UpdatePreview(wallSystem, rect); }
            }
            else { if (wallLinePreviewManager != null) wallLinePreviewManager.HideAll(); buildPreview.SetVisible(pf != null); buildPreview.UpdatePose(ePos, eRot, true); }

            if (HandleWallPaintInput(mPos, edge, true)) return;
            if (!IsPointerOverUi() && InputHelper.GetMouseButtonDown(0)) { EnsureDraftSessionStarted(); buildCommandService?.PlaceWall(wallCatalog.CurrentWall, edge, true); FinalizeMassPlacement(); }
        }

        private void HandlePathTool()
        {
            if (pathSystem == null) { buildPreview.SetVisible(false); pathPreviewRenderer?.SetVisible(false); pathEditingHandlesRenderer?.Hide(); return; }
            buildPreview.SetVisible(false); bool hasC = TryGetCursorContext(out CursorContext ctx);
            float pW = selectedPathStroke?.Width ?? pathCatalog?.Current?.defaultWidth ?? 1f, pY = pathCatalog?.Current?.yOffset ?? 0.02f;
            Vector3 curPt = hasC ? ctx.planePoint + Vector3.up * pY : Vector3.zero;

            if (pathPreviewRenderer != null && isPathDrawing && activePathPoints.Count > 0 && hasC) pathPreviewRenderer.UpdatePreview(activePathPoints, curPt, pW); else pathPreviewRenderer?.SetVisible(false);
            if (selectedPathStroke != null) pathEditingHandlesRenderer?.Show(selectedPathStroke, selectedPathPointIndex, ctx.hoveredPathHandleMarker, selectedPathWidthSegmentIndex); else pathEditingHandlesRenderer?.Hide();
            if (IsPointerOverUi()) return;
            if (selectedPathStroke != null) HandleSelectedPathShortcuts();

            if (hasC && selectedPathStroke != null && isDraggingPathPoint && selectedPathPointIndex >= 0) { selectedPathStroke.SetControlPoint(selectedPathPointIndex, new Vector3(ctx.planePoint.x, selectedPathStroke.ControlPoints[selectedPathPointIndex].y, ctx.planePoint.z)); pathSystem.NotifyStrokeChanged(); }
            if (InputHelper.GetMouseButtonUp(0)) isDraggingPathPoint = false;
            if (InputHelper.GetMouseButtonDown(0) && hasC) {
                if (isPathDrawing) { if (activePathPoints.Count == 0 || Vector3.Distance(activePathPoints[activePathPoints.Count - 1], curPt) > 0.05f) activePathPoints.Add(curPt); }
                else { if (ctx.hoveredPathHandleMarker?.TargetStroke != null) { SelectPathStroke(ctx.hoveredPathHandleMarker.TargetStroke); if (ctx.hoveredPathHandleMarker.HandleType == PathHandleType.ControlPoint) { selectedPathPointIndex = ctx.hoveredPathHandleMarker.HandleIndex; isDraggingPathPoint = true; } } else if (pathCatalog?.Current != null) { DeselectPathStroke(); activePathPoints.Clear(); activePathPoints.Add(curPt); isPathDrawing = true; } }
            }
            if (InputHelper.GetKeyDown(KeyCode.Return)) FinalizeOrCancelPath();
            if (InputHelper.GetKeyDown(KeyCode.Backspace)) { if (isPathDrawing && activePathPoints.Count > 0) activePathPoints.RemoveAt(activePathPoints.Count - 1); else if (selectedPathStroke != null && selectedPathPointIndex >= 0) RemoveSelectedPathPoint(); }
        }

        private void HandleSelectedPathShortcuts() { if (selectedPathStroke == null) return; if (InputHelper.GetKeyDown(increasePathWidthKey)) { buildCommandService?.UpdatePathWidth(selectedPathStroke, selectedPathStroke.Width + pathWidthStep, true); FinalizeMassPlacement(); } if (InputHelper.GetKeyDown(deleteSelectedPathKey) || InputHelper.GetKeyDown(deleteKey)) DeleteSelectedPath(); }
        private void FinalizeOrCancelPath() { if (!isPathDrawing) return; if (activePathPoints.Count >= 2 && pathCatalog?.Current != null) { EnsureDraftSessionStarted(); PathStroke s = buildCommandService?.CreatePath(pathCatalog.Current, activePathPoints, pathCatalog.Current.defaultWidth, true); if (s != null) { RegisterForSync(s); SelectPathStroke(s); FinalizeMassPlacement(); } } ResetPathDrawing(); NotifyStateChanged(); }
        private void ResetPathDrawing() { isPathDrawing = false; activePathPoints.Clear(); pathPreviewRenderer?.SetVisible(false); }
        public void DeleteSelectedPath() { if (selectedPathStroke == null) return; EnsureDraftSessionStarted(); RegisterForSyncDelete(selectedPathStroke); buildCommandService?.DeletePath(selectedPathStroke, true); DeselectPathStroke(); FinalizeMassPlacement(); NotifyStateChanged(); }
        private void SelectPathStroke(PathStroke s) { DeselectPathStroke(); selectedPathStroke = s; if (s != null) s.SetSelected(true); NotifyStateChanged(); }
        private void DeselectPathStroke() { if (selectedPathStroke != null) selectedPathStroke.SetSelected(false); selectedPathStroke = null; }
        private void RemoveSelectedPathPoint() { if (selectedPathStroke != null && selectedPathPointIndex >= 0) { EnsureDraftSessionStarted(); buildCommandService.RemovePathPoint(selectedPathStroke, selectedPathPointIndex, true); FinalizeMassPlacement(); NotifyStateChanged(); } }

        private void CancelPendingMoveAndRestore() { if (pendingMove == null) return; var obj = gridBuildingSystem.Place(pendingMove.definition, pendingMove.originCell, pendingMove.rotationSteps, pendingMove.baseY, pendingMove.rotationY); pendingMove = null; if (obj != null) SelectObject(obj); NotifyStateChanged(); }
        private void PlaceObjectFromPreview(BuildingDefinition def, ObjectPlacementPreview p) { EnsureDraftSessionStarted(); var obj = buildCommandService?.PlaceGridObject(def, p.originCell, rotationSteps, p.baseY, p.yRotation, true); if (obj != null) { RegisterForSync(obj); SelectObject(obj); } }
        private void RotateSelectedObject() { if (selectedObject == null) return; int nr = (selectedObject.RotationSteps + 1) % 4; if (gridBuildingSystem.TryReposition(selectedObject, selectedObject.OriginCell, nr, selectedObject.BaseY, nr * 90f)) { RegisterForSync(selectedObject); rotationSteps = nr; FinalizeMassPlacement(); NotifyStateChanged(); } }

        private bool TryBuildObjectPlacement(BuildingDefinition def, CursorContext ctx, out ObjectPlacementPreview p) {
            p = default; if (def == null) return false;
            Vector3 anchor = ctx.hasPhysicsHit ? ctx.physicsHit.point : ctx.planePoint;
            float baseY = gridBuildingSystem.GridOrigin.y + FloorContext.ActiveFloorY; if (ShouldUseSurfacePlacement(def, ctx.hoveredPlacedObject)) baseY = ctx.hoveredPlacedObject.GetWorldBounds().max.y + stackedSurfacePadding;
            p.useGridPlacement = true; p.baseY = baseY; Vector2Int rotF = GridBuildingSystem.RotateFootprint(def.Footprint, rotationSteps); p.originCell = gridBuildingSystem.WorldToCell(anchor, def.layer); p.worldPosition = gridBuildingSystem.GetPlacementPosition(p.originCell, rotF, def.worldOffset, def.layer, baseY); p.yRotation = rotationSteps * 90f; p.canPlace = gridBuildingSystem.CanPlace(def, p.originCell, rotationSteps, baseY); return true;
        }

        private void PaintObjectLine(BuildingDefinition def, Vector2Int from, Vector2Int to, float baseY) { if (buildCommandService == null) return; var cells = GetGridLine(from, to); if (buildCommandService.TryPaintObjectBatch(def, cells, rotationSteps, baseY, rotationSteps * 90f)) foreach(var c in cells) RegisterForSync(gridBuildingSystem.GetPlacedObjectAtCell(c, def.layer)); }
        private void PaintObjectRectangle(BuildingDefinition def, Vector2Int from, Vector2Int to, float baseY) { if (buildCommandService == null) return; var cells = GetGridRectangle(from, to); if (buildCommandService.TryPaintObjectBatch(def, cells, rotationSteps, baseY, rotationSteps * 90f)) foreach(var c in cells) RegisterForSync(gridBuildingSystem.GetPlacedObjectAtCell(c, def.layer)); }
        private void PaintWallLine(WallEdge from, WallEdge to) { if (buildCommandService == null) return; var line = GetWallEdgeLine(from, to); if (buildCommandService.TryPaintWallBatch(wallCatalog.CurrentWall, line)) RegisterForSync(line); }
        private void PaintWallRectangle(Vector2Int from, Vector2Int to) { if (buildCommandService == null) return; var edges = GetWallRectangleEdges(from, to); var cells = GetGridRectangle(from, to); var fDef = GetFloorDefinition(); if (buildCommandService.TryPaintRoomBatch(wallCatalog.CurrentWall, fDef, edges, cells)) { RegisterForSync(edges); if (fDef != null) foreach(var c in cells) RegisterForSync(gridBuildingSystem.GetPlacedObjectAtCell(c, fDef.layer)); } }
        private BuildingDefinition GetFloorDefinition() { foreach (var item in buildCatalog.AllItems) if (item?.layer == BuildLayer.Floor) return item; return null; }

        private void TryPaintGridCell(BuildingDefinition def, Vector2Int cell, float baseY) { if (buildCommandService == null || !gridBuildingSystem.CanPlace(def, cell, rotationSteps, baseY)) return; if (buildCommandService.TryPaintGridCell(def, cell, rotationSteps, baseY, rotationSteps * 90f)) RegisterForSync(gridBuildingSystem.GetPlacedObjectAtCell(cell, def.layer)); }
        private void TryPaintWallEdge(WallEdge edge) { if (wallCatalog?.CurrentWall == null || buildCommandService == null || !wallSystem.CanPlaceWall(wallCatalog.CurrentWall, edge)) return; if (buildCommandService.TryPaintWallEdge(wallCatalog.CurrentWall, edge)) RegisterForSync(wallSystem.GetSegment(edge)); }
        private bool HandleObjectPaintInput(BuildingDefinition def, bool hasP, ObjectPlacementPreview p) { if (paintMode == PlacementPaintMode.Single || IsPointerOverUi()) return false; if (InputHelper.GetMouseButtonDown(0)) { isObjectBrushPainting = (paintMode == PlacementPaintMode.Brush); isObjectRectanglePainting = (paintMode == PlacementPaintMode.Rectangle); objectPaintStartCell = p.originCell; objectPaintLastCell = p.originCell; objectPaintBaseY = p.baseY; return true; } if (InputHelper.GetMouseButtonUp(0)) { if (isObjectBrushPainting) PaintObjectLine(def, objectPaintStartCell, p.originCell, p.baseY); else if (isObjectRectanglePainting) PaintObjectRectangle(def, objectPaintStartCell, p.originCell, p.baseY); isObjectBrushPainting = isObjectRectanglePainting = false; FinalizeMassPlacement(); return true; } return isObjectBrushPainting || isObjectRectanglePainting; }
        private bool HandleWallPaintInput(Vector3 mPos, WallEdge edge, bool canP) { if (paintMode == PlacementPaintMode.Single || IsPointerOverUi()) return false; if (InputHelper.GetMouseButtonDown(0)) { isWallBrushPainting = (paintMode == PlacementPaintMode.Brush); isWallRectanglePainting = (paintMode == PlacementPaintMode.Rectangle); wallPaintLastEdge = edge; wallRectangleStartCell = gridBuildingSystem.WorldToCell(mPos, BuildLayer.Furniture); return true; } if (InputHelper.GetMouseButtonUp(0)) { if (isWallBrushPainting) PaintWallLine(wallPaintLastEdge, edge); else if (isWallRectanglePainting) PaintWallRectangle(wallRectangleStartCell, gridBuildingSystem.WorldToCell(mPos, BuildLayer.Furniture)); isWallBrushPainting = isWallRectanglePainting = false; FinalizeMassPlacement(); return true; } return isWallBrushPainting || isWallRectanglePainting; }

        private List<Vector2Int> GetGridLine(Vector2Int from, Vector2Int to) { List<Vector2Int> res = new List<Vector2Int>(); int x0 = from.x, y0 = from.y, x1 = to.x, y1 = to.y, dx = Mathf.Abs(x1 - x0), dy = Mathf.Abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy; while (true) { res.Add(new Vector2Int(x0, y0)); if (x0 == x1 && y0 == y1) break; int e2 = err * 2; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } } return res; }
        private List<Vector2Int> GetGridRectangle(Vector2Int from, Vector2Int to) { List<Vector2Int> res = new List<Vector2Int>(); int minX = Mathf.Min(from.x, to.x), maxX = Mathf.Max(from.x, to.x), minY = Mathf.Min(from.y, to.y), maxY = Mathf.Max(from.y, to.y); for (int x = minX; x <= maxX; x++) for (int y = minY; y <= maxY; y++) res.Add(new Vector2Int(x, y)); return res; }
        private List<WallEdge> GetWallEdgeLine(WallEdge from, WallEdge to) { List<WallEdge> res = new List<WallEdge>(); if (Mathf.Abs(to.x - from.x) >= Mathf.Abs(to.y - from.y)) { int min = Mathf.Min(from.x, to.x), max = Mathf.Max(from.x, to.x); for (int x = min; x <= max; x++) res.Add(new WallEdge(x, from.y, WallOrientation.Horizontal)); } else { int min = Mathf.Min(from.y, to.y), max = Mathf.Max(from.y, to.y); for (int y = min; y <= max; y++) res.Add(new WallEdge(from.x, y, WallOrientation.Vertical)); } return res; }
        private List<WallEdge> GetWallRectangleEdges(Vector2Int from, Vector2Int to) { List<WallEdge> res = new List<WallEdge>(); int minX = Mathf.Min(from.x, to.x), maxX = Mathf.Max(from.x, to.x), minY = Mathf.Min(from.y, to.y), maxY = Mathf.Max(from.y, to.y); for (int x = minX; x <= maxX; x++) { res.Add(new WallEdge(x, minY, WallOrientation.Horizontal)); res.Add(new WallEdge(x, maxY + 1, WallOrientation.Horizontal)); } for (int y = minY; y <= maxY; y++) { res.Add(new WallEdge(minX, y, WallOrientation.Vertical)); res.Add(new WallEdge(maxX + 1, y, WallOrientation.Vertical)); } return res; }

        private bool ShouldSelectHoveredObject(BuildingDefinition def, PlacedObject h) => h != null && pendingMove == null && CurrentTool == BuildToolMode.Object;
        private bool ShouldUseSurfacePlacement(BuildingDefinition def, PlacedObject h) => def != null && h != null && def.SupportsSurfacePlacement && h != selectedObject;
        private float GetSnappedRotationY(int s) => ((s % 4) + 4) % 4 * 90f;
        private BuildingDefinition GetCurrentObjectDefinition() => buildCatalog?.Current;
        private void SelectNextForCurrentTool() { if (CurrentTool == BuildToolMode.Object) buildCatalog.SelectNext(); }
        private void SelectPreviousForCurrentTool() { if (CurrentTool == BuildToolMode.Object) buildCatalog.SelectPrevious(); }
        private void SelectObject(PlacedObject o) { DeselectCurrentObject(); selectedObject = o; if (o != null) { o.SetSelected(true); buildCatalog.Select(o.Definition); rotationSteps = o.RotationSteps; } NotifyStateChanged(); }
        private void DeselectCurrentObject() { if (selectedObject != null) selectedObject.SetSelected(false); selectedObject = null; NotifyStateChanged(); }
        private void RefreshPreviewDefinition() { if (buildPreview == null) return; buildPreview.SetPrefab((CurrentTool == BuildToolMode.Wall) ? wallCatalog?.CurrentWall?.prefab : (CurrentTool == BuildToolMode.Door) ? wallCatalog?.CurrentDoor?.prefab : (CurrentTool == BuildToolMode.Window) ? wallCatalog?.CurrentWindow?.prefab : buildCatalog?.Current?.prefab); }
        private bool IsPointerOverUi() => EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
        private void ResetInteractionStates() { isObjectBrushPainting = isObjectRectanglePainting = isWallBrushPainting = isWallRectanglePainting = isPathDrawing = false; }
        private void ResetDragStates() { ResetInteractionStates(); }
        private void ResetDragStatesIfMouseReleased() { if (!InputHelper.GetMouseButton(0)) ResetDragStates(); }
        private bool TryGetCursorContext(out CursorContext ctx) { ctx = default; Camera cam = gameModeController.ActiveCamera; if (cam == null) return false; ctx.ray = cam.ScreenPointToRay(InputHelper.MousePosition); Plane pl = new Plane(Vector3.up, new Vector3(0f, gridBuildingSystem.GridOrigin.y + FloorContext.ActiveFloorY, 0f)); if (!pl.Raycast(ctx.ray, out float d)) return false; ctx.planePoint = ctx.ray.GetPoint(d); if (Physics.Raycast(ctx.ray, out RaycastHit h, 1000f, placementRaycastMask)) { ctx.hasPhysicsHit = true; ctx.physicsHit = h; ctx.hoveredPlacedObject = h.collider?.GetComponentInParent<PlacedObject>(); ctx.hoveredPathStroke = h.collider?.GetComponentInParent<PathStroke>(); ctx.hoveredPathHandleMarker = h.collider?.GetComponent<PathHandleMarker>(); } return true; }
        private bool TryGetMouseWorldPosition(out Vector3 wPos) { if (TryGetCursorContext(out CursorContext ctx)) { wPos = ctx.planePoint; return true; } wPos = default; return false; }
        private void RegisterForSync(PlacedObject o) { if (o != null) pendingSyncObjects.Add(o); }
        private void RegisterForSync(WallSegment w) { if (w != null) pendingSyncWalls.Add(w); }
        private void RegisterForSync(PathStroke s) { if (s != null) pendingSyncPaths.Add(s); }
        private void RegisterForSync(List<WallEdge> edges) { foreach(var e in edges) { var s = wallSystem.GetSegment(e); if (s != null) pendingSyncWalls.Add(s); } }
        private void RegisterForSyncDelete(PathStroke p) { if (p != null) pendingDeletePathIds.Add(p.StrokeId); }
        private void HandleUndoRedoStateChanged() { }
        private void NotifyStateChanged() => StateChanged?.Invoke();
        private bool isFinalizing;
        private List<PlacedObject> pendingSyncObjects = new List<PlacedObject>();
        private List<WallSegment> pendingSyncWalls = new List<WallSegment>();
        private List<PathStroke> pendingSyncPaths = new List<PathStroke>();
        private List<string> pendingDeletePathIds = new List<string>();
        public async void FinalizeMassPlacement() { if (multiplayerEditApplyService == null || isFinalizing) return; isFinalizing = true; await Task.Delay(50); if (this == null) return; WorldPatch mp = new WorldPatch { WorldId = mapSaveSystem.CurrentWorldId }; foreach(var p in pendingSyncObjects) if (p != null) mp.UpsertPlacedObjects.Add(p.GetState()); foreach(var s in pendingSyncWalls) if (s != null) mp.UpsertWalls.Add(s.GetState()); foreach(var pt in pendingSyncPaths) if (pt != null) mp.UpsertPaths.Add(new PathStrokeState { StrokeId = pt.StrokeId, DefinitionId = pt.Definition.id, Width = pt.Width, ControlPoints = new List<Vector3>(pt.ControlPoints) }); foreach(var id in pendingDeletePathIds) mp.DeletePathIds.Add(id); if (mp.HasAnyChanges) { await multiplayerEditApplyService.SubmitPatchDirectAsync(mp); if (editDraftSessionController != null) await editDraftSessionController.ApplyDraftSessionAsync(); } pendingSyncObjects.Clear(); pendingSyncWalls.Clear(); pendingSyncPaths.Clear(); pendingDeletePathIds.Clear(); isFinalizing = false; }
    }
}
