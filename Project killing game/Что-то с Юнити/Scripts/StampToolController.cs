using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace MapEditorPrototype
{
    /// <summary>
    /// Инструмент штампов в редакторе (MVP-0):
    ///   B — режим выделения: тянем прямоугольник по клеткам, отпускаем,
    ///       панель «имя/теги/якорь» → «Сохранить как штамп».
    ///   N — режим вставки: выбранный в панели штамп следует за курсором
    ///       (рамка + зелёный/красный индикатор), R — поворот, ЛКМ — вставить,
    ///       Esc — выход.
    ///
    /// Пока активен любой режим штампа, BuildSystem отключается целиком
    /// (enabled = false), чтобы обычный инструмент не ставил объекты теми же
    /// кликами. При выходе из режима BuildSystem включается обратно.
    ///
    /// Undo/redo и мультиплеер — через те же WorldPatch-механизмы.
    /// Временный UI — OnGUI; заменится на canvas-UI позже.
    /// </summary>
    public class StampToolController : MonoBehaviour
    {
        private enum StampToolMode { None, SelectArea, Paste }

        [Header("References")]
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private WallSystem wallSystem;
        [SerializeField] private PathSystem pathSystem;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathCatalog pathCatalog;
        [SerializeField] private StampLibraryService stampLibrary;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private EditorUndoRedoSystem undoRedoSystem;
        [SerializeField] private MultiplayerEditApplyService multiplayerEditApplyService;
        [SerializeField] private BuildSystem buildSystem;

        [Header("Input")]
        [SerializeField] private KeyCode selectAreaKey = KeyCode.B;
        [SerializeField] private KeyCode pasteKey = KeyCode.N;
        [SerializeField] private KeyCode rotateKey = KeyCode.R;
        [SerializeField] private KeyCode cancelKey = KeyCode.Escape;

        [Header("Visuals")]
        [SerializeField] private Color selectionColor = new Color(0.2f, 0.6f, 1f, 0.35f);
        [SerializeField] private Color canPlaceColor = new Color(0.2f, 1f, 0.3f, 0.35f);
        [SerializeField] private Color cannotPlaceColor = new Color(1f, 0.25f, 0.2f, 0.35f);

        private StampToolMode mode = StampToolMode.None;
        private bool isDragging;
        private Vector2Int dragStartCell;
        private Vector2Int dragEndCell;
        private bool hasPendingCapture;
        private Vector2Int pendingMin, pendingMax;

        private StampData pasteStamp;
        private int pasteRotationSteps;
        private Vector2Int pasteOriginCell;
        private bool pasteCanPlace;

        private StampCaptureService captureService;
        private StampPlacementService placementService;

        private GameObject highlightQuad;
        private Material highlightMaterial;

        // Временная UI-панель сохранения
        private bool showSavePanel;
        private string saveName = "";
        private readonly HashSet<string> selectedTags = new HashSet<string>();
        private string customTagInput = "";
        private string saveAnchor = "Free";

        // Визуальная разметка штампа (вместо невидимых конвенций):
        // игрок кликами отмечает сторону стены и закрашивает клетки
        // свободной зоны вокруг/внутри выделения.
        private enum MetaEditTool { None, WallSide, Clearance, Socket }
        private MetaEditTool metaTool = MetaEditTool.None;
        private int wallSideIndex = -1; // 0=юг(y-),1=восток,2=север,3=запад; -1 = не отмечена
        private readonly HashSet<Vector2Int> clearanceCells = new HashSet<Vector2Int>(); // локальные, отн. pendingMin
        private bool isPaintingClearance;
        private bool clearancePaintValue;
        private GameObject wallStripeQuad;
        private Material wallStripeMaterial;
        private readonly List<GameObject> clearanceQuads = new List<GameObject>();
        private Material clearanceMaterial;
        private const int ClearanceMargin = 3; // на сколько клеток вокруг выделения можно рисовать

        private static readonly string[] SideNames = { "south", "east", "north", "west" };

        // Редактирование метаданных уже сохранённого штампа (без пересоздания
        // содержимого): открывает ту же панель, но Capture не выполняется.
        private StampData editingExisting;

        // Черновик сокета (рисуется поверх выделения, клетки ВНУТРИ него).
        private readonly HashSet<Vector2Int> socketDraftCells = new HashSet<Vector2Int>();
        private readonly HashSet<string> socketDraftTags = new HashSet<string>();
        private bool socketDraftSurface;     // true = на поверхности предмета
        private bool socketDraftRequired;
        private int socketDraftCountMax = 1;
        private bool isPaintingSocket;
        private bool socketPaintValue;
        private Vector2 socketTagScroll;
        private readonly List<StampSocket> draftSockets = new List<StampSocket>(); // уже добавленные
        private readonly List<GameObject> socketQuads = new List<GameObject>();
        private Material socketMaterial;
        private string lastError = "";
        private Vector2 tagsScroll;
        private Vector2 savePanelScroll;
        private Vector2 libraryScroll;
        private bool showLibraryPanel;
        private bool showHelpPanel;

        // Рамки IMGUI-панелей текущего кадра — клики над ними не уходят в мир.
        private readonly List<Rect> activePanelRects = new List<Rect>();

        private static readonly string[] AnchorOptions = { "Free", "Wall", "Corner", "Center", "NearDoor", "Surface" };
        private static readonly string[] AnchorHints =
        {
            "Free — где угодно в комнате",
            "Wall — задней гранью к стене",
            "Corner — в углу комнаты",
            "Center — в центре комнаты",
            "NearDoor — рядом с дверью",
            "Surface — на поверхности другого предмета",
        };

        public bool IsActive => mode != StampToolMode.None;

        private void Awake()
        {
            captureService = new StampCaptureService(gridBuildingSystem, wallSystem, pathSystem);
            placementService = new StampPlacementService(gridBuildingSystem, wallSystem, pathSystem, buildCatalog, wallCatalog, pathCatalog);
            CreateHighlight();
        }

        private void OnDisable()
        {
            // Не оставляем BuildSystem выключенным, если нас выключили/уничтожили.
            SetBuildSystemSuspended(false);
        }

        private void Update()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit)
            {
                SetMode(StampToolMode.None);
                return;
            }

            HandleModeHotkeys();

            switch (mode)
            {
                case StampToolMode.SelectArea: UpdateSelectArea(); break;
                case StampToolMode.Paste: UpdatePaste(); break;
                default: SetHighlightVisible(false); break;
            }
        }

        private void HandleModeHotkeys()
        {
            if (InputHelper.GetKeyDown(selectAreaKey) && !showSavePanel)
            {
                SetMode(mode == StampToolMode.SelectArea ? StampToolMode.None : StampToolMode.SelectArea);
            }
            else if (InputHelper.GetKeyDown(pasteKey) && !showSavePanel)
            {
                if (mode == StampToolMode.Paste)
                {
                    SetMode(StampToolMode.None);
                }
                else
                {
                    showLibraryPanel = true;
                    SetMode(StampToolMode.Paste);
                }
            }
            else if (InputHelper.GetKeyDown(cancelKey) && (mode != StampToolMode.None || showSavePanel))
            {
                showSavePanel = false;
                showLibraryPanel = false;
                showHelpPanel = false;
                editingExisting = null;
                ClearMetaVisuals();
                SetMode(StampToolMode.None);
                SetBuildSystemSuspended(false);
            }
        }

        private void SetMode(StampToolMode newMode)
        {
            if (mode == newMode) return;
            mode = newMode;
            isDragging = false;
            hasPendingCapture = false;
            if (mode != StampToolMode.Paste) pasteStamp = null;
            SetHighlightVisible(false);

            // Главный фикс сквозных кликов: на время режима штампа полностью
            // глушим обычный строительный инструмент.
            SetBuildSystemSuspended(mode != StampToolMode.None);
        }

        private void SetBuildSystemSuspended(bool suspended)
        {
            if (buildSystem == null) return;

            if (suspended)
            {
                if (buildSystem.enabled)
                {
                    // Прячем призрак-превью и сбрасываем выделение обычного инструмента.
                    buildSystem.ResetTransientEditorState();
                    buildSystem.enabled = false;
                }
            }
            else if (!buildSystem.enabled)
            {
                buildSystem.enabled = true;
            }
        }

        // ------------------------------------------------------------------
        // Режим выделения
        // ------------------------------------------------------------------

        private void UpdateSelectArea()
        {
            if (showSavePanel)
            {
                ShowRectHighlight(pendingMin, pendingMax, selectionColor);
                UpdateMetaEditing();
                return;
            }

            if (!TryGetMouseCell(out Vector2Int cell))
            {
                SetHighlightVisible(false);
                return;
            }

            if (InputHelper.GetMouseButtonDown(0) && !IsPointerOverUi())
            {
                isDragging = true;
                dragStartCell = cell;
            }

            if (isDragging)
            {
                dragEndCell = cell;
                ShowRectHighlight(Vector2Int.Min(dragStartCell, dragEndCell), Vector2Int.Max(dragStartCell, dragEndCell), selectionColor);

                if (InputHelper.GetMouseButtonUp(0))
                {
                    isDragging = false;
                    pendingMin = Vector2Int.Min(dragStartCell, dragEndCell);
                    pendingMax = Vector2Int.Max(dragStartCell, dragEndCell);
                    hasPendingCapture = true;
                    showSavePanel = true;
                    saveName = "";
                    selectedTags.Clear();
                    customTagInput = "";
                    metaTool = MetaEditTool.None;
                    wallSideIndex = -1;
                    clearanceCells.Clear();
                    socketDraftCells.Clear();
                    draftSockets.Clear();
                    metaVisualsDirty = true;
                    lastError = "";
                }
            }
            else
            {
                ShowRectHighlight(cell, cell, selectionColor);
            }
        }

        /// <summary>
        /// Разметка штампа кликами по миру при открытой панели сохранения:
        ///  - инструмент «Сторона стены»: клик рядом с выделением (или по его
        ///    краю) отмечает грань, которой штамп прижмётся к стене;
        ///  - инструмент «Свободная зона»: ЛКМ-протяжка закрашивает клетки,
        ///    повторная — стирает.
        /// </summary>
        private void UpdateMetaEditing()
        {
            if (metaTool == MetaEditTool.None || IsPointerOverUi())
            {
                if (!InputHelper.GetMouseButton(0)) isPaintingClearance = false;
                RefreshMetaVisuals();
                return;
            }

            if (!TryGetMouseCell(out Vector2Int cell))
            {
                RefreshMetaVisuals();
                return;
            }

            if (metaTool == MetaEditTool.WallSide && InputHelper.GetMouseButtonDown(0))
            {
                wallSideIndex = GuessSideFromCell(cell);
            }
            else if (metaTool == MetaEditTool.Socket)
            {
                Vector2Int local = cell - pendingMin;
                bool insideSelection =
                    cell.x >= pendingMin.x && cell.x <= pendingMax.x &&
                    cell.y >= pendingMin.y && cell.y <= pendingMax.y;

                if (InputHelper.GetMouseButtonDown(0) && insideSelection)
                {
                    isPaintingSocket = true;
                    socketPaintValue = !socketDraftCells.Contains(local);
                }
                if (isPaintingSocket && InputHelper.GetMouseButton(0) && insideSelection)
                {
                    if (socketPaintValue) socketDraftCells.Add(local);
                    else socketDraftCells.Remove(local);
                    metaVisualsDirty = true;
                }
                if (InputHelper.GetMouseButtonUp(0)) isPaintingSocket = false;
            }
            else if (metaTool == MetaEditTool.Clearance)
            {
                Vector2Int local = cell - pendingMin;
                bool inRange =
                    local.x >= -ClearanceMargin && local.x <= (pendingMax.x - pendingMin.x) + ClearanceMargin &&
                    local.y >= -ClearanceMargin && local.y <= (pendingMax.y - pendingMin.y) + ClearanceMargin;
                bool insideSelection =
                    cell.x >= pendingMin.x && cell.x <= pendingMax.x &&
                    cell.y >= pendingMin.y && cell.y <= pendingMax.y;

                if (InputHelper.GetMouseButtonDown(0) && inRange && !insideSelection)
                {
                    isPaintingClearance = true;
                    clearancePaintValue = !clearanceCells.Contains(local);
                }

                if (isPaintingClearance && InputHelper.GetMouseButton(0) && inRange && !insideSelection)
                {
                    if (clearancePaintValue) clearanceCells.Add(local);
                    else clearanceCells.Remove(local);
                }

                if (InputHelper.GetMouseButtonUp(0)) isPaintingClearance = false;
            }

            RefreshMetaVisuals();
        }

        /// <summary>Какая грань выделения ближе всего к клику.</summary>
        private int GuessSideFromCell(Vector2Int cell)
        {
            int dSouth = pendingMin.y - cell.y;            // клик южнее
            int dNorth = cell.y - pendingMax.y;            // севернее
            int dWest = pendingMin.x - cell.x;             // западнее
            int dEast = cell.x - pendingMax.x;             // восточнее

            int best = 0;
            int bestValue = dSouth;
            if (dEast > bestValue) { best = 1; bestValue = dEast; }
            if (dNorth > bestValue) { best = 2; bestValue = dNorth; }
            if (dWest > bestValue) { best = 3; bestValue = dWest; }

            // Клик внутри выделения — берём ближайшую грань.
            if (bestValue <= 0)
            {
                int toSouth = cell.y - pendingMin.y;
                int toNorth = pendingMax.y - cell.y;
                int toWest = cell.x - pendingMin.x;
                int toEast = pendingMax.x - cell.x;
                best = 0; int min = toSouth;
                if (toEast < min) { best = 1; min = toEast; }
                if (toNorth < min) { best = 2; min = toNorth; }
                if (toWest < min) { best = 3; }
            }

            return best;
        }

        private void ConfirmSaveStamp()
        {
            StampData stamp;
            if (editingExisting != null)
            {
                // Правка метаданных: содержимое и footprint не трогаем.
                stamp = editingExisting;
                stamp.name = string.IsNullOrWhiteSpace(saveName) ? stamp.name : saveName.Trim();
                stamp.tags.Clear();
                stamp.clearance.Clear();
                stamp.contentVersion++;
            }
            else
            {
                if (!hasPendingCapture) return;
                stamp = captureService.Capture(pendingMin, pendingMax, string.IsNullOrWhiteSpace(saveName) ? "Без имени" : saveName.Trim());
            }
            stamp.anchor = saveAnchor;

            // Сторона стены, отмеченная кликом по карте: пишем её имя в
            // anchorEdge — генератор сам посчитает нужный поворот у любой
            // стены. Никаких «сохраняй лицом на север».
            if (wallSideIndex >= 0)
            {
                stamp.anchorEdge = SideNames[wallSideIndex];
                if (saveAnchor == "Free") stamp.anchor = saveAnchor = "Wall";
            }

            // Свободная зона: закрашенные клетки (локальные координаты
            // относительно юго-западного угла выделения; могут быть
            // отрицательными — это нормально, зона снаружи footprint).
            foreach (Vector2Int cell in clearanceCells)
            {
                stamp.clearance.Add(new StampClearanceRect { x = cell.x, y = cell.y, w = 1, l = 1 });
            }
            stamp.author = "user";
            stamp.tags.AddRange(selectedTags);

            // Сокеты: незакрытый черновик добавляется автоматически;
            // итоговый список всегда равен черновику (при редактировании
            // он предзаполнен существующими сокетами).
            CommitSocketDraft();
            stamp.sockets.Clear();
            stamp.sockets.AddRange(draftSockets);

            if (stampLibrary.TrySaveUserStamp(stamp, out string error))
            {
                showSavePanel = false;
                hasPendingCapture = false;
                editingExisting = null;
                lastError = "";
                ClearMetaVisuals();
                SetMode(StampToolMode.None);
                SetBuildSystemSuspended(false);
            }
            else
            {
                lastError = error;
            }
        }

        /// <summary>
        /// Редактирование метаданных сохранённого штампа: открывает панель
        /// сохранения с предзаполненными полями. Содержимое (мебель/стены)
        /// не пересоздаётся — меняются имя, теги, якорь, сторона стены,
        /// свободная зона.
        /// </summary>
        public void BeginEditExistingStamp(StampData data)
        {
            if (data == null) return;

            SetMode(StampToolMode.None);
            SetBuildSystemSuspended(true); // панель открыта — мир не кликается

            editingExisting = data;
            showSavePanel = true;
            showLibraryPanel = false;
            saveName = data.name;
            saveAnchor = string.IsNullOrEmpty(data.anchor) ? "Free" : data.anchor;

            selectedTags.Clear();
            foreach (string tag in data.tags) selectedTags.Add(tag);

            wallSideIndex = System.Array.IndexOf(SideNames, (data.anchorEdge ?? "").ToLowerInvariant());

            clearanceCells.Clear();
            foreach (StampClearanceRect cl in data.clearance)
            {
                for (int dx = 0; dx < cl.w; dx++)
                    for (int dy = 0; dy < cl.l; dy++)
                        clearanceCells.Add(new Vector2Int(cl.x + dx, cl.y + dy));
            }

            // Существующие сокеты — в черновик (можно удалить последний/добавить).
            socketDraftCells.Clear();
            draftSockets.Clear();
            draftSockets.AddRange(data.sockets);

            metaTool = MetaEditTool.None;
            lastError = "";
        }

        // ------------------------------------------------------------------
        // Режим вставки
        // ------------------------------------------------------------------

        private void UpdatePaste()
        {
            if (pasteStamp == null)
            {
                SetHighlightVisible(false);
                return; // ждём выбора в панели библиотеки
            }

            if (InputHelper.GetKeyDown(rotateKey))
            {
                pasteRotationSteps = (pasteRotationSteps + 1) % 4;
            }

            if (!TryGetMouseCell(out Vector2Int cell))
            {
                SetHighlightVisible(false);
                return;
            }

            pasteOriginCell = cell;
            Vector2Int fp = StampPlacementService.RotatedFootprint(pasteStamp, pasteRotationSteps);
            pasteCanPlace = placementService.CanPlace(pasteStamp, pasteOriginCell, pasteRotationSteps, FloorContext.ActiveFloorY);

            ShowRectHighlight(pasteOriginCell, pasteOriginCell + fp - Vector2Int.one, pasteCanPlace ? canPlaceColor : cannotPlaceColor);

            if (InputHelper.GetMouseButtonDown(0) && pasteCanPlace && !IsPointerOverUi())
            {
                PlacePasteStamp();
            }
        }

        private async void PlacePasteStamp()
        {
            if (!placementService.TryPlace(pasteStamp, pasteOriginCell, pasteRotationSteps, out WorldPatch forward, out WorldPatch backward, FloorContext.ActiveFloorY))
            {
                return;
            }

            string worldId = mapSaveSystem != null ? mapSaveSystem.CurrentWorldId : null;
            forward.WorldId = worldId;
            backward.WorldId = worldId;

            undoRedoSystem?.PushAction(forward, backward);
            mapSaveSystem?.IncrementBuildVersion();

            if (multiplayerEditApplyService != null)
            {
                await multiplayerEditApplyService.SubmitPatchDirectAsync(forward);
            }

            // Остаёмся в режиме вставки — удобно ставить штамп несколько раз.
        }

        // ------------------------------------------------------------------
        // Вспомогательное
        // ------------------------------------------------------------------

        private bool TryGetMouseCell(out Vector2Int cell)
        {
            cell = default;
            Camera cam = gameModeController.ActiveCamera;
            if (cam == null) return false;

            Ray ray = cam.ScreenPointToRay(InputHelper.MousePosition);

            // Сначала — физический луч: курсор над мебелью должен давать клетку
            // ЭТОЙ мебели (рисование сокетов по столешнице), а не клетку пола
            // позади неё. Точку чуть сдвигаем к камере, чтобы не свалиться
            // на соседнюю клетку на границе коллайдера.
            if (Physics.Raycast(ray, out RaycastHit hit, 1000f))
            {
                Vector3 nudged = hit.point - ray.direction.normalized * 0.05f;
                cell = gridBuildingSystem.WorldToCell(
                    new Vector3(nudged.x, gridBuildingSystem.GridOrigin.y, nudged.z), BuildLayer.Furniture);
                return true;
            }

            Plane plane = new Plane(Vector3.up, new Vector3(0f, gridBuildingSystem.GridOrigin.y + FloorContext.ActiveFloorY, 0f));
            if (!plane.Raycast(ray, out float dist)) return false;

            cell = gridBuildingSystem.WorldToCell(ray.GetPoint(dist), BuildLayer.Furniture);
            return true;
        }

        // ------------------------------------------------------------------
        // Визуализация разметки: синяя полоса — сторона стены,
        // жёлтые клетки — свободная зона.
        // ------------------------------------------------------------------

        private bool metaVisualsDirty;

        private void RefreshMetaVisuals()
        {
            EnsureMetaVisualObjects();

            bool visible = showSavePanel;

            // Полоса стены.
            if (visible && wallSideIndex >= 0)
            {
                float cellSize = gridBuildingSystem.CellSize;
                Vector3 origin = gridBuildingSystem.GridOrigin;
                float minX = origin.x + pendingMin.x * cellSize;
                float maxX = origin.x + (pendingMax.x + 1) * cellSize;
                float minZ = origin.z + pendingMin.y * cellSize;
                float maxZ = origin.z + (pendingMax.y + 1) * cellSize;
                float thickness = cellSize * 0.18f;
                float y = origin.y + 0.05f;

                Vector3 center; Vector3 scale;
                switch (wallSideIndex)
                {
                    case 0: center = new Vector3((minX + maxX) * 0.5f, y, minZ - thickness * 0.5f); scale = new Vector3(maxX - minX, thickness, 1f); break;
                    case 2: center = new Vector3((minX + maxX) * 0.5f, y, maxZ + thickness * 0.5f); scale = new Vector3(maxX - minX, thickness, 1f); break;
                    case 1: center = new Vector3(maxX + thickness * 0.5f, y, (minZ + maxZ) * 0.5f); scale = new Vector3(thickness, maxZ - minZ, 1f); break;
                    default: center = new Vector3(minX - thickness * 0.5f, y, (minZ + maxZ) * 0.5f); scale = new Vector3(thickness, maxZ - minZ, 1f); break;
                }

                wallStripeQuad.transform.position = center;
                wallStripeQuad.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
                wallStripeQuad.transform.localScale = scale;
                wallStripeQuad.SetActive(true);
            }
            else
            {
                wallStripeQuad.SetActive(false);
            }

            // Клетки свободной зоны (пересоздаём только при изменении).
            if (metaVisualsDirty || clearanceQuads.Count != clearanceCells.Count)
            {
                foreach (GameObject quad in clearanceQuads) Destroy(quad);
                clearanceQuads.Clear();

                if (visible)
                {
                    foreach (Vector2Int local in clearanceCells)
                    {
                        clearanceQuads.Add(MakeCellQuad(local, clearanceMaterial, 0.04f));
                    }
                }
                metaVisualsDirty = false;
            }
            else if (!visible && clearanceQuads.Count > 0)
            {
                foreach (GameObject quad in clearanceQuads) Destroy(quad);
                clearanceQuads.Clear();
            }

            // Клетки черновика сокета (зелёные) + клетки сохранённых сокетов.
            int socketCellsTotal = socketDraftCells.Count + CountDraftSocketCells();
            if (socketQuads.Count != socketCellsTotal || metaVisualsDirty)
            {
                foreach (GameObject quad in socketQuads) Destroy(quad);
                socketQuads.Clear();

                if (visible)
                {
                    foreach (Vector2Int local in socketDraftCells)
                        socketQuads.Add(MakeCellQuad(local, socketMaterial, 0.045f));
                    foreach (StampSocket sk in draftSockets)
                        foreach (StampClearanceRect r in sk.cells)
                            for (int dx = 0; dx < r.w; dx++)
                                for (int dy = 0; dy < r.l; dy++)
                                    socketQuads.Add(MakeCellQuad(new Vector2Int(r.x + dx, r.y + dy), socketMaterial, 0.045f));
                }
            }
        }

        private int CountDraftSocketCells()
        {
            int n = 0;
            foreach (StampSocket sk in draftSockets)
                foreach (StampClearanceRect r in sk.cells) n += r.w * r.l;
            return n;
        }

        private GameObject MakeCellQuad(Vector2Int local, Material mat, float y)
        {
            float cellSize = gridBuildingSystem.CellSize;
            Vector3 origin = gridBuildingSystem.GridOrigin;
            Vector2Int cell = pendingMin + local;

            // Высота подсветки: верх самого высокого предмета в клетке
            // (сокет на столешнице должен светиться НА столешнице, не в полу).
            float topY = origin.y + FloorContext.ActiveFloorY;
            PlacedObject topObject = gridBuildingSystem.GetTopPlacedObjectAtCell(cell);
            if (topObject != null) topY = Mathf.Max(topY, topObject.GetTopY());

            GameObject quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            quad.name = "StampSocketCell";
            quad.transform.SetParent(transform, false);
            Destroy(quad.GetComponent<Collider>());
            quad.GetComponent<MeshRenderer>().material = mat;
            quad.transform.position = new Vector3(
                origin.x + (cell.x + 0.5f) * cellSize, topY + y, origin.z + (cell.y + 0.5f) * cellSize);
            quad.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            quad.transform.localScale = new Vector3(cellSize * 0.8f, cellSize * 0.8f, 1f);
            return quad;
        }

        private void EnsureMetaVisualObjects()
        {
            if (wallStripeQuad == null)
            {
                wallStripeQuad = GameObject.CreatePrimitive(PrimitiveType.Quad);
                wallStripeQuad.name = "StampWallSideStripe";
                wallStripeQuad.transform.SetParent(transform, false);
                Destroy(wallStripeQuad.GetComponent<Collider>());
                wallStripeMaterial = new Material(highlightMaterial);
                SetMaterialTransparent(wallStripeMaterial);
                SetMaterialColor(wallStripeMaterial, new Color(0.15f, 0.4f, 1f, 0.85f));
                wallStripeQuad.GetComponent<MeshRenderer>().material = wallStripeMaterial;
                wallStripeQuad.SetActive(false);
            }

            if (clearanceMaterial == null)
            {
                clearanceMaterial = new Material(highlightMaterial);
                SetMaterialTransparent(clearanceMaterial);
                SetMaterialColor(clearanceMaterial, new Color(1f, 0.85f, 0.1f, 0.45f));
            }

            if (socketMaterial == null)
            {
                socketMaterial = new Material(highlightMaterial);
                SetMaterialTransparent(socketMaterial);
                SetMaterialColor(socketMaterial, new Color(0.2f, 0.95f, 0.4f, 0.5f));
            }
        }

        private static void SetMaterialColor(Material m, Color c)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            else m.color = c;
        }

        private void ClearMetaVisuals()
        {
            if (wallStripeQuad != null) wallStripeQuad.SetActive(false);
            foreach (GameObject quad in clearanceQuads) Destroy(quad);
            clearanceQuads.Clear();
            foreach (GameObject quad in socketQuads) Destroy(quad);
            socketQuads.Clear();
        }

        private void CreateHighlight()
        {
            highlightQuad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            highlightQuad.name = "StampToolHighlight";
            highlightQuad.transform.SetParent(transform, false);
            Object.Destroy(highlightQuad.GetComponent<Collider>());

            Shader shader = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Unlit/Color");
            highlightMaterial = new Material(shader);
            SetMaterialTransparent(highlightMaterial);
            highlightQuad.GetComponent<MeshRenderer>().material = highlightMaterial;
            highlightQuad.SetActive(false);
        }

        private static void SetMaterialTransparent(Material m)
        {
            if (m.HasProperty("_Surface")) m.SetFloat("_Surface", 1f);
            if (m.HasProperty("_Blend")) m.SetFloat("_Blend", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            if (m.HasProperty("_SrcBlend")) m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            if (m.HasProperty("_DstBlend")) m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            if (m.HasProperty("_ZWrite")) m.SetInt("_ZWrite", 0);
        }

        private void ShowRectHighlight(Vector2Int min, Vector2Int max, Color color)
        {
            float cellSize = gridBuildingSystem.CellSize;
            Vector3 origin = gridBuildingSystem.GridOrigin;

            float w = (max.x - min.x + 1) * cellSize;
            float l = (max.y - min.y + 1) * cellSize;
            Vector3 center = new Vector3(
                origin.x + min.x * cellSize + w * 0.5f,
                origin.y + FloorContext.ActiveFloorY + 0.03f,
                origin.z + min.y * cellSize + l * 0.5f);

            highlightQuad.transform.position = center;
            highlightQuad.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            highlightQuad.transform.localScale = new Vector3(w, l, 1f);

            if (highlightMaterial.HasProperty("_BaseColor")) highlightMaterial.SetColor("_BaseColor", color);
            else highlightMaterial.color = color;

            highlightQuad.SetActive(true);
        }

        private void SetHighlightVisible(bool visible)
        {
            if (highlightQuad != null) highlightQuad.SetActive(visible);
        }

        /// <summary>
        /// Курсор над UI: и canvas-EventSystem, и наши IMGUI-панели
        /// (EventSystem про OnGUI не знает, поэтому проверяем рамки сами).
        /// </summary>
        private bool IsPointerOverUi()
        {
            if (EventSystem.current != null && EventSystem.current.IsPointerOverGameObject()) return true;

            Vector2 mouse = InputHelper.MousePosition;
            Vector2 guiPoint = new Vector2(mouse.x, Screen.height - mouse.y);
            foreach (Rect rect in activePanelRects)
            {
                if (rect.Contains(guiPoint)) return true;
            }
            return false;
        }

        // ------------------------------------------------------------------
        // Временный UI (OnGUI). Заменить на canvas-панели вместе с BuildUiController.
        // ------------------------------------------------------------------

        private void OnGUI()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit) return;

            // Рамки пересобираются каждый кадр: что нарисовали — то и блокирует клики.
            activePanelRects.Clear();

            DrawModeHint();

            if (showSavePanel) DrawSavePanel();
            if (mode == StampToolMode.Paste && showLibraryPanel) DrawLibraryPanel();
            if (showHelpPanel) DrawHelpPanel();

            // Курсор над панелью — блокируем колесо для камеры редактора
            // (OnGUI вызывается несколько раз за кадр, достаточно Repaint-прохода).
            if (Event.current.type == EventType.Repaint && IsPointerOverUi())
            {
                UiInputGuard.BlockScrollThisFrame();
            }
        }

        private void DrawModeHint()
        {
            string hint = mode switch
            {
                StampToolMode.SelectArea => "[Штамп] Выделение: тяните ЛКМ по клеткам. Esc — выход.",
                StampToolMode.Paste => pasteStamp == null
                    ? "[Штамп] Вставка: выберите штамп в списке. Esc — выход."
                    : $"[Штамп] Вставка: {pasteStamp.name} | R — поворот, ЛКМ — поставить, Esc — выход.",
                _ => $"Штампы: {selectAreaKey} — сохранить область, {pasteKey} — вставить.",
            };
            GUI.Label(new Rect(10, Screen.height - 28, 900, 24), hint);

            if (mode != StampToolMode.None)
            {
                Rect helpRect = new Rect(Screen.width - 36, Screen.height - 32, 28, 24);
                activePanelRects.Add(helpRect);
                if (GUI.Button(helpRect, "?")) showHelpPanel = !showHelpPanel;
            }
        }

        private void DrawSavePanel()
        {
            // Высота подгоняется под экран; список тегов забирает остаток
            // места, кнопки имеют явную высоту и не сплющиваются.
            float panelHeight = Mathf.Min(640f, Screen.height - 40f);
            Rect rect = new Rect(Screen.width * 0.5f - 230, (Screen.height - panelHeight) * 0.5f, 460, panelHeight);
            activePanelRects.Add(rect);
            GUI.Box(rect, editingExisting != null ? "Редактировать штамп" : "Сохранить штамп");
            GUILayout.BeginArea(new Rect(rect.x + 12, rect.y + 28, rect.width - 24, rect.height - 40));

            // Весь контент — в скролле: при переполнении ничего не отрезается,
            // а кнопки Сохранить/Отмена закреплены снизу вне скролла.
            savePanelScroll = GUILayout.BeginScrollView(savePanelScroll);

            GUILayout.Label(editingExisting != null
                ? $"«{editingExisting.name}» ({editingExisting.footprintW} × {editingExisting.footprintL} кл.). " +
                  "Меняются только свойства; содержимое — пересохрани область заново."
                : $"Область: {pendingMax.x - pendingMin.x + 1} × {pendingMax.y - pendingMin.y + 1} клеток. " +
                  "Сохранятся ИМЕННО ЭТИ предметы и стены — копия один-в-один.");

            GUILayout.Label("Имя:");
            saveName = GUILayout.TextField(saveName, GUILayout.Height(22));

            GUILayout.Space(4);
            GUILayout.Label("Теги — «что это такое» для генератора. Когда карте понадобится " +
                            "предмет с таким тегом, твой штамп станет кандидатом:");

            tagsScroll = GUILayout.BeginScrollView(tagsScroll, GUI.skin.box, GUILayout.Height(120));
            foreach (StampTagRegistry.TagInfo info in StampTagRegistry.Known)
            {
                bool isSelected = selectedTags.Contains(info.Tag);
                bool newSelected = GUILayout.Toggle(isSelected, $" {info.Tag} — {info.Description}");
                if (newSelected != isSelected)
                {
                    if (newSelected) selectedTags.Add(info.Tag);
                    else selectedTags.Remove(info.Tag);
                }
            }
            GUILayout.EndScrollView();

            GUILayout.BeginHorizontal();
            customTagInput = GUILayout.TextField(customTagInput, GUILayout.Width(260), GUILayout.Height(22));
            if (GUILayout.Button("Добавить свой тег", GUILayout.Height(22)))
            {
                if (StampTagRegistry.TryAddUserTag(customTagInput, out string normalized, out string tagError))
                {
                    selectedTags.Add(normalized);
                    customTagInput = "";
                    lastError = "";
                }
                else
                {
                    lastError = tagError;
                }
            }
            GUILayout.EndHorizontal();

            GUILayout.Space(4);
            GUILayout.Label("Якорь — «где этому место в комнате» (использует генератор):");
            int anchorIndex = System.Array.IndexOf(AnchorOptions, saveAnchor);
            int newIndex = GUILayout.SelectionGrid(Mathf.Max(0, anchorIndex), AnchorOptions, 3, GUILayout.Height(48));
            saveAnchor = AnchorOptions[newIndex];
            GUILayout.Label(AnchorHints[newIndex], GUILayout.Height(20));

            GUILayout.Space(4);
            if (editingExisting != null)
            {
                GUILayout.Label("Сторона стены (грань штампа, прижимаемая к стене):");
                string[] sideLabels = { "Юг", "Восток", "Север", "Запад", "Нет" };
                int sideSel = wallSideIndex >= 0 ? wallSideIndex : 4;
                int newSide = GUILayout.SelectionGrid(sideSel, sideLabels, 5, GUILayout.Height(24));
                if (newSide != sideSel) wallSideIndex = newSide == 4 ? -1 : newSide;
                GUILayout.Label(clearanceCells.Count > 0
                    ? $"Свободная зона: {clearanceCells.Count} кл. (изменить — пересохрани область заново)."
                    : "Свободная зона: нет.");
            }
            else
            {
            GUILayout.Label("Разметка кликами по карте (панель можно не закрывать):");
            GUILayout.BeginHorizontal();

            bool wallToolOn = GUILayout.Toggle(metaTool == MetaEditTool.WallSide,
                wallSideIndex >= 0 ? " Сторона стены: отмечена" : " Сторона стены", "Button", GUILayout.Height(26));
            if (wallToolOn != (metaTool == MetaEditTool.WallSide))
                metaTool = wallToolOn ? MetaEditTool.WallSide : MetaEditTool.None;

            bool clToolOn = GUILayout.Toggle(metaTool == MetaEditTool.Clearance,
                clearanceCells.Count > 0 ? $" Свободная зона: {clearanceCells.Count} кл." : " Свободная зона", "Button", GUILayout.Height(26));
            if (clToolOn != (metaTool == MetaEditTool.Clearance))
                metaTool = clToolOn ? MetaEditTool.Clearance : MetaEditTool.None;

            int totalSockets = draftSockets.Count + (socketDraftCells.Count > 0 ? 1 : 0);
            bool skToolOn = GUILayout.Toggle(metaTool == MetaEditTool.Socket,
                totalSockets > 0 ? $" Сокеты: {totalSockets}" : " Сокеты", "Button", GUILayout.Height(26));
            if (skToolOn != (metaTool == MetaEditTool.Socket))
                metaTool = skToolOn ? MetaEditTool.Socket : MetaEditTool.None;

            GUILayout.EndHorizontal();

            if (metaTool == MetaEditTool.WallSide)
                GUILayout.Label("Кликни по карте С ТОЙ СТОРОНЫ выделения, где должна быть стена (синяя полоса).");
            else if (metaTool == MetaEditTool.Clearance)
                GUILayout.Label("Закрась клетки ВОКРУГ выделения, которые должны остаться свободными (жёлтые). Повторный клик — стереть.");
            else if (metaTool == MetaEditTool.Socket)
                DrawSocketDraftControls();
            else
                GUILayout.Label("Стена = к чему прижмётся предмет. Свободная зона = дверцы/проход. Сокеты = места для случайного декора.");

            if ((wallSideIndex >= 0 || clearanceCells.Count > 0) && GUILayout.Button("Сбросить разметку", GUILayout.Height(20)))
            {
                wallSideIndex = -1;
                clearanceCells.Clear();
                metaVisualsDirty = true;
            }
            }

            GUILayout.EndScrollView();

            if (!string.IsNullOrEmpty(lastError))
            {
                GUI.color = Color.red;
                GUILayout.Label(lastError);
                GUI.color = Color.white;
            }

            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Сохранить", GUILayout.Height(30))) ConfirmSaveStamp();
            if (GUILayout.Button("Отмена", GUILayout.Height(30))) { showSavePanel = false; hasPendingCapture = false; editingExisting = null; ClearMetaVisuals(); SetMode(StampToolMode.None); SetBuildSystemSuspended(false); }
            GUILayout.EndHorizontal();
            GUILayout.Space(4);

            GUILayout.EndArea();
        }

        private void DrawSocketDraftControls()
        {
            GUILayout.Label("Закрась клетки ВНУТРИ выделения (зелёные) — место для случайного предмета:");

            GUILayout.BeginHorizontal();
            socketDraftSurface = GUILayout.Toggle(socketDraftSurface, " На поверхности предмета (стол/полка)");
            socketDraftRequired = GUILayout.Toggle(socketDraftRequired, " Обязательный");
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            GUILayout.Label($"Максимум предметов: {socketDraftCountMax}", GUILayout.Width(170));
            socketDraftCountMax = Mathf.Max(1, (int)GUILayout.HorizontalSlider(socketDraftCountMax, 1, 6));
            GUILayout.EndHorizontal();

            GUILayout.Label("Что сюда можно ставить (теги):");
            socketTagScroll = GUILayout.BeginScrollView(socketTagScroll, GUI.skin.box, GUILayout.Height(70));
            foreach (StampTagRegistry.TagInfo info in StampTagRegistry.Known)
            {
                bool sel = socketDraftTags.Contains(info.Tag);
                bool ns = GUILayout.Toggle(sel, $" {info.Tag}");
                if (ns != sel) { if (ns) socketDraftTags.Add(info.Tag); else socketDraftTags.Remove(info.Tag); }
            }
            GUILayout.EndScrollView();

            GUILayout.BeginHorizontal();
            GUI.enabled = socketDraftCells.Count > 0 && socketDraftTags.Count > 0;
            if (GUILayout.Button($"Добавить сокет ({socketDraftCells.Count} кл.)", GUILayout.Height(22)))
            {
                CommitSocketDraft();
            }
            GUI.enabled = true;
            if (draftSockets.Count > 0 && GUILayout.Button("Удалить последний", GUILayout.Height(22)))
            {
                draftSockets.RemoveAt(draftSockets.Count - 1);
                metaVisualsDirty = true;
            }
            GUILayout.EndHorizontal();
        }

        /// <summary>Закрашенные клетки + настройки → StampSocket в черновик.</summary>
        private void CommitSocketDraft()
        {
            if (socketDraftCells.Count == 0 || socketDraftTags.Count == 0)
            {
                socketDraftCells.Clear();
                return;
            }

            StampSocket socket = new StampSocket
            {
                id = $"socket_{draftSockets.Count + 1}",
                kind = socketDraftSurface ? "Surface" : "Area",
                required = socketDraftRequired,
                countMin = socketDraftRequired ? 1 : 0,
                countMax = socketDraftCountMax,
                probability = socketDraftRequired ? 1f : 0.7f,
            };
            socket.filterTags.AddRange(socketDraftTags);
            foreach (Vector2Int cell in socketDraftCells)
            {
                socket.cells.Add(new StampClearanceRect { x = cell.x, y = cell.y, w = 1, l = 1 });
            }

            draftSockets.Add(socket);
            socketDraftCells.Clear();
            socketDraftTags.Clear();
            socketDraftRequired = false;
            socketDraftCountMax = 1;
            metaVisualsDirty = true;
        }

        private void DrawLibraryPanel()
        {
            Rect rect = new Rect(Screen.width - 270, 60, 260, Mathf.Min(420, Screen.height - 120));
            activePanelRects.Add(rect);
            GUI.Box(rect, "Библиотека штампов");
            GUILayout.BeginArea(new Rect(rect.x + 8, rect.y + 24, rect.width - 16, rect.height - 32));

            if (GUILayout.Button("Обновить список")) stampLibrary.Reload();

            libraryScroll = GUILayout.BeginScrollView(libraryScroll);
            foreach (StampLibraryService.StampEntry entry in stampLibrary.Entries)
            {
                if (!entry.IsValid)
                {
                    GUI.color = new Color(1f, 0.5f, 0.5f);
                    GUILayout.Label($"[x] {System.IO.Path.GetFileName(entry.FilePath)}");
                    GUI.color = Color.white;
                    continue;
                }

                bool isCurrent = pasteStamp != null && pasteStamp.id == entry.Data.id;
                string label = $"{(isCurrent ? "> " : "")}{entry.Data.name} ({entry.Data.footprintW}x{entry.Data.footprintL})";
                GUILayout.BeginHorizontal();
                if (GUILayout.Button(label))
                {
                    pasteStamp = entry.Data;
                    pasteRotationSteps = 0;
                }
                // Редактирование свойств — только для пользовательских штампов.
                if (entry.IsUserContent && GUILayout.Button("Изм.", GUILayout.Width(40)))
                {
                    BeginEditExistingStamp(entry.Data);
                }
                GUILayout.EndHorizontal();
            }
            GUILayout.EndScrollView();

            GUILayout.EndArea();
        }

        private void DrawHelpPanel()
        {
            Rect rect = new Rect(Screen.width * 0.5f - 260, 60, 520, 330);
            activePanelRects.Add(rect);
            GUI.Box(rect, "Как работают штампы");
            GUILayout.BeginArea(new Rect(rect.x + 12, rect.y + 26, rect.width - 24, rect.height - 38));

            GUILayout.Label(
                "ШТАМП — точная копия куска карты. Сохранил стол и 3 стула —\n" +
                "вставится именно этот стол и эти 3 стула, без случайностей.\n" +
                "\n" +
                "СЛУЧАЙНОСТЬ появляется на генерации карты: генератору нужен,\n" +
                "например, «обеденный набор» (тег dining_set) — он случайно выберет\n" +
                "ОДИН из всех штампов с этим тегом. Чем больше разных штампов\n" +
                "с одним тегом сделают игроки, тем разнообразнее карты.\n" +
                "\n" +
                "ТЕГИ — «что это такое» (стол, кровать, декор...). По ним генератор\n" +
                "ищет кандидатов.\n" +
                "\n" +
                "ЯКОРЬ — «где этому место в комнате» (у стены, в углу...). Влияет\n" +
                "только на генерацию; руками можно ставить куда угодно.\n" +
                "\n" +
                "СТОРОНА СТЕНЫ — кликни с той стороны выделения, где стена\n" +
                "(синяя полоса). Генератор прижмёт штамп этой гранью к стене\n" +
                "комнаты и сам повернёт как надо.\n" +
                "\n" +
                "СВОБОДНАЯ ЗОНА — закрась клетки (жёлтые), которые должны\n" +
                "остаться проходимыми: куда открываются дверцы, где стоит игрок.\n" +
                "Генератор не заставит их мебелью.\n" +
                "\n" +
                "СОКЕТЫ — зелёные клетки: «здесь может стоять случайный предмет\n" +
                "с такими-то тегами». Хочешь цветок на столе — закрась клетку стола,\n" +
                "включи «На поверхности», выбери теги декора. При генерации туда\n" +
                "встанет случайный подходящий штамп (и его сокеты тоже заполнятся).");

            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Закрыть")) showHelpPanel = false;
            GUILayout.EndArea();
        }
    }
}
