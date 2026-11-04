using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace MapEditorPrototype
{
    /// <summary>
    /// Инструмент «Покраска комнаты» (хоткей P в режиме Edit):
    ///  - клик по ПОЛУ → весь пол комнаты перекладывается текущим
    ///    Floor-definition из BuildCatalog;
    ///  - клик по СТЕНЕ → все стены комнаты, В КОТОРОЙ кликнул,
    ///    перекрашиваются текущим WallDefinition из WallCatalog.
    ///
    /// «Комната» определяется flood-fill'ом (RoomRegionDetector).
    /// «Сторона» стены — это комната, со стороны которой кликнули:
    /// перекрашиваются только рёбра-границы ЭТОЙ комнаты. Соседняя
    /// комната своей покраски не теряет... но: пока WallSystem хранит
    /// ОДИН WallDefinition на ребро, перекраска границы меняет ребро
    /// целиком (обе стороны). Честные двусторонние стены — см.
    /// design/walls-two-sided.md (отложено осознанно).
    ///
    /// Изменения идут через WorldPatch: undo/redo + мультиплеер.
    /// </summary>
    public class RoomPaintTool : MonoBehaviour
    {
        private enum PaintTarget { Floor, Walls }

        [Header("References")]
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private WallSystem wallSystem;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private EditorUndoRedoSystem undoRedoSystem;
        [SerializeField] private MultiplayerEditApplyService multiplayerEditApplyService;
        [SerializeField] private BuildSystem buildSystem;
        [SerializeField] private StampToolController stampToolController;

        [Header("Input")]
        [SerializeField] private KeyCode toggleKey = KeyCode.P;
        [SerializeField] private KeyCode cancelKey = KeyCode.Escape;

        private bool isActive;
        private PaintTarget target = PaintTarget.Floor;
        private string status = "";

        public bool IsActive => isActive;

        private void Update()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit)
            {
                if (isActive) Deactivate();
                return;
            }

            if (InputHelper.GetKeyDown(toggleKey))
            {
                if (isActive) Deactivate();
                else if (stampToolController == null || !stampToolController.IsActive) Activate();
            }

            if (!isActive) return;

            if (InputHelper.GetKeyDown(cancelKey))
            {
                Deactivate();
                return;
            }

            if (InputHelper.GetMouseButtonDown(0) && !IsPointerOverUi())
            {
                if (TryGetMouseCell(out Vector2Int cell))
                {
                    if (target == PaintTarget.Floor) PaintRoomFloor(cell);
                    else PaintRoomWalls(cell);
                }
            }
        }

        private void Activate()
        {
            isActive = true;
            status = "";
            if (buildSystem != null && buildSystem.enabled)
            {
                buildSystem.ResetTransientEditorState();
                buildSystem.enabled = false;
            }
        }

        private void Deactivate()
        {
            isActive = false;
            if (buildSystem != null && !buildSystem.enabled)
            {
                buildSystem.enabled = true;
            }
        }

        // ------------------------------------------------------------------
        // Пол комнаты
        // ------------------------------------------------------------------

        private async void PaintRoomFloor(Vector2Int cell)
        {
            BuildingDefinition floorDef = GetSelectedFloorDefinition();
            if (floorDef == null)
            {
                status = "Выбери пол в каталоге (слой Floor).";
                return;
            }

            RoomRegionDetector.Region region = RoomRegionDetector.Detect(cell, wallSystem, FloorContext.ActiveFloor);
            if (!region.Bounded)
            {
                status = "Комната не замкнута (нет стен вокруг) — покраска отменена.";
                return;
            }

            WorldPatch forward = NewPatch();
            WorldPatch backward = NewPatch();
            float baseY = gridBuildingSystem.GridOrigin.y + FloorContext.ActiveFloorY;

            foreach (Vector2Int c in region.Cells)
            {
                PlacedObject existing = gridBuildingSystem.GetPlacedObjectAtCell(c, BuildLayer.Floor);
                if (existing != null)
                {
                    if (existing.Definition == floorDef) continue;
                    backward.UpsertPlacedObjects.Add(existing.GetState());
                    gridBuildingSystem.Remove(existing);
                }

                PlacedObject placed = gridBuildingSystem.Place(floorDef, c, 0, baseY, 0f);
                if (placed != null)
                {
                    forward.UpsertPlacedObjects.Add(placed.GetState());
                    if (existing == null) backward.DeletePlacedObjectIds.Add(placed.ObjectId);
                }
            }

            await CommitPatch(forward, backward);
            status = $"Пол: {region.Cells.Count} клеток → {floorDef.SafeDisplayName}.";
        }

        private BuildingDefinition GetSelectedFloorDefinition()
        {
            BuildingDefinition current = buildCatalog.Current;
            if (current != null && current.layer == BuildLayer.Floor) return current;

            foreach (BuildingDefinition item in buildCatalog.AllItems)
            {
                if (item != null && item.layer == BuildLayer.Floor) return item;
            }
            return null;
        }

        // ------------------------------------------------------------------
        // Стены комнаты
        // ------------------------------------------------------------------

        private async void PaintRoomWalls(Vector2Int cell)
        {
            WallDefinition wallDef = wallCatalog?.CurrentWall;
            if (wallDef == null)
            {
                status = "Выбери стену в каталоге.";
                return;
            }

            RoomRegionDetector.Region region = RoomRegionDetector.Detect(cell, wallSystem, FloorContext.ActiveFloor);
            if (!region.Bounded)
            {
                status = "Комната не замкнута — покраска отменена.";
                return;
            }

            WorldPatch forward = NewPatch();
            WorldPatch backward = NewPatch();
            int repainted = 0;

            foreach (WallEdge edge in region.BorderEdges)
            {
                WallSegment segment = wallSystem.GetSegment(edge);
                if (segment == null || segment.WallDefinition == wallDef) continue;

                backward.UpsertWalls.Add(segment.GetState());
                segment.SetDefinitions(wallDef, segment.OpeningDefinition);
                RebuildSegmentVisual(segment);
                forward.UpsertWalls.Add(segment.GetState());
                repainted++;
            }

            await CommitPatch(forward, backward);
            status = $"Стены: перекрашено {repainted} сегментов → {wallDef.SafeDisplayName}.";
        }

        private void RebuildSegmentVisual(WallSegment segment)
        {
            // WallSystem.RebuildVisual приватный; самый надёжный публичный
            // путь — пересоздать сегмент через Remove+Place с тем же id.
            WallEdge edge = segment.Edge;
            string id = segment.SegmentId;
            WallDefinition def = segment.WallDefinition;
            WallOpeningDefinition opening = segment.OpeningDefinition;

            if (opening != null) wallSystem.RemoveAtEdge(edge);   // первая снимает opening
            wallSystem.RemoveAtEdge(edge);                        // вторая убирает сегмент
            WallSegment fresh = wallSystem.PlaceWall(def, edge, id);
            if (opening != null && fresh != null) wallSystem.PlaceOpening(opening, edge);
        }

        // ------------------------------------------------------------------

        private WorldPatch NewPatch() => new WorldPatch { WorldId = mapSaveSystem != null ? mapSaveSystem.CurrentWorldId : null };

        private async System.Threading.Tasks.Task CommitPatch(WorldPatch forward, WorldPatch backward)
        {
            if (!forward.HasAnyChanges) return;
            undoRedoSystem?.PushAction(forward, backward);
            mapSaveSystem?.IncrementBuildVersion();
            if (multiplayerEditApplyService != null)
            {
                await multiplayerEditApplyService.SubmitPatchDirectAsync(forward);
            }
        }

        private bool TryGetMouseCell(out Vector2Int cell)
        {
            cell = default;
            Camera cam = gameModeController.ActiveCamera;
            if (cam == null) return false;

            Ray ray = cam.ScreenPointToRay(InputHelper.MousePosition);

            // Сначала физический хит (стены выше плоскости пола) — берём
            // клетку со стороны камеры от точки попадания.
            if (Physics.Raycast(ray, out RaycastHit hit, 1000f))
            {
                Vector3 toward = hit.point - ray.direction.normalized * 0.05f;
                cell = gridBuildingSystem.WorldToCell(toward, BuildLayer.Furniture);
                return true;
            }

            Plane plane = new Plane(Vector3.up, new Vector3(0f, gridBuildingSystem.GridOrigin.y + FloorContext.ActiveFloorY, 0f));
            if (!plane.Raycast(ray, out float dist)) return false;
            cell = gridBuildingSystem.WorldToCell(ray.GetPoint(dist), BuildLayer.Furniture);
            return true;
        }

        private bool IsPointerOverUi()
        {
            return EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
        }

        // ------------------------------------------------------------------
        // Временный UI
        // ------------------------------------------------------------------

        private void OnGUI()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit) return;
            if (!isActive)
            {
                if (!string.IsNullOrEmpty(status))
                {
                    GUI.Label(new Rect(10, Screen.height - 50, 900, 22), status);
                }
                return;
            }

            Rect rect = new Rect(10, Screen.height - 130, 360, 104);
            GUI.Box(rect, "Покраска комнаты [P]");
            GUILayout.BeginArea(new Rect(rect.x + 10, rect.y + 24, rect.width - 20, rect.height - 30));

            GUILayout.BeginHorizontal();
            if (GUILayout.Toggle(target == PaintTarget.Floor, " Пол", "Button")) target = PaintTarget.Floor;
            if (GUILayout.Toggle(target == PaintTarget.Walls, " Стены", "Button")) target = PaintTarget.Walls;
            GUILayout.EndHorizontal();

            GUILayout.Label(target == PaintTarget.Floor
                ? "Клик по полу — вся комната получит выбранный пол."
                : "Клик внутри комнаты — все её стены перекрасятся.");
            if (!string.IsNullOrEmpty(status)) GUILayout.Label(status);

            GUILayout.EndArea();

            Vector2 mouse = InputHelper.MousePosition;
            if (rect.Contains(new Vector2(mouse.x, Screen.height - mouse.y)))
            {
                UiInputGuard.BlockScrollThisFrame();
            }
        }
    }
}
