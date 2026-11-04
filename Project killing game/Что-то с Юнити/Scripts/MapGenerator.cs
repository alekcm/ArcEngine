using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// MVP-1: генератор одного этажа одного здания.
    /// План (FloorPlanGenerator) → стены/двери (WallSystem) → полы →
    /// required-штампы по тегам из библиотеки (StampPlacementService) →
    /// результат — обычные объекты мира, дальше работают сейв/редактор/сеть.
    ///
    /// Запуск: кнопка [Генерация] (OnGUI, режим Edit) или GenerateAndApply()
    /// из кода. Хост генерирует и рассылает мир целиком существующей
    /// репликацией — клиентам ничего знать не нужно.
    /// </summary>
    public class MapGenerator : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private WallSystem wallSystem;
        [SerializeField] private PathSystem pathSystem;
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathCatalog pathCatalog;
        [SerializeField] private StampLibraryService stampLibrary;
        [SerializeField] private TemplateLibraryService templateLibrary;
        [SerializeField] private TemplateEditorUi templateEditor;
        [SerializeField] private MapSaveSystem mapSaveSystem;
        [SerializeField] private EditorUndoRedoSystem undoRedoSystem;
        [SerializeField] private BuildSystem buildSystem;

        [Header("Generation")]
        [SerializeField, Tooltip("Сколько личных комнат (по числу игроков).")]
        private int personalRoomCount = 4;
        [SerializeField, Tooltip("Юго-западная клетка здания.")]
        private Vector2Int buildingOrigin = new Vector2Int(2, 2);
        [SerializeField, Tooltip("Очищать мир перед генерацией.")]
        private bool clearWorldBeforeGenerate = true;
        [SerializeField, Tooltip("0 = случайный сид (сид пишется в лог).")]
        private int seedOverride = 0;
        private int selectedTemplateIndex;
        [SerializeField, Tooltip("Тег штампа лестницы (sys:stair_shaft).")]
        private string stairStampTag = "sys:stair_shaft";
        [SerializeField, Tooltip("Тег штампа лифта (sys:elevator).")]
        private string elevatorStampTag = "sys:elevator";

        private StampPlacementService placementService;
        private SocketFillerService socketFiller;
        private string lastReport = "";
        private bool showPanel;
        private Vector2 genPanelScroll;

        private void Awake()
        {
            placementService = new StampPlacementService(
                gridBuildingSystem, wallSystem, pathSystem, buildCatalog, wallCatalog, pathCatalog);
            socketFiller = new SocketFillerService(gridBuildingSystem, stampLibrary, placementService);
        }

        // ------------------------------------------------------------------
        // Публичный запуск
        // ------------------------------------------------------------------

        public void GenerateAndApply()
        {
            int seed = seedOverride != 0 ? seedOverride : Random.Range(1, int.MaxValue);
            Debug.Log($"[MapGenerator] seed={seed} (для воспроизведения багов укажи его в seedOverride)");

            if (clearWorldBeforeGenerate)
            {
                gridBuildingSystem.ClearAll();
                wallSystem.ClearAll();
                pathSystem.ClearAll();
                undoRedoSystem?.Clear();
            }

            List<string> report = new List<string>();
            reservedClearances.Clear();
            socketFailures.Clear();

            GenTemplate template = GetSelectedTemplate();
            FloorContext.MinFloor = template.basementCourtroom ? -1 : 0;

            // Локации раздаются по этажам согласно floorPlacement шаблона.
            List<GenTemplate> floorTemplates = BuildFloorTemplates(template, personalRoomCount);
            bool basement = template.basementCourtroom;

            FloorPlanGenerator.FloorPlan groundPlan = null;
            int totalRooms = 0;
            for (int floor = 0; floor < floorTemplates.Count; floor++)
            {
                FloorPlanGenerator.FloorPlan plan = FloorPlanGenerator.Generate(
                    floorTemplates[floor], seed + floor * 1000, buildingOrigin);
                if (floor == 0) groundPlan = plan;
                else
                {
                    // Верхние этажи повторяют габариты первого: одинаковая
                    // коробка — стены совпадают по вертикали.
                    plan.Bounds = groundPlan.Bounds;
                    plan.Corridor = groundPlan.Corridor;
                    FitRoomsToBounds(plan, groundPlan);
                }

                report.AddRange(plan.Warnings);
                BuildWallsAndDoors(plan, report, floor);
                BuildFloors(plan, report, floor);
                FillRequiredStamps(plan, seed + floor * 1000, report, floor);
                totalRooms += plan.Rooms.Count;
            }

            PlaceStairs(groundPlan, floorTemplates.Count, report);

            if (basement)
            {
                BuildBasementCourtroom(groundPlan, seed, report);
            }

            report.AddRange(socketFailures);
            mapSaveSystem?.IncrementBuildVersion();
            lastReport = report.Count == 0 ? "OK: всё разместилось." : string.Join("\n", report);
            Debug.Log($"[MapGenerator] Готово. Этажей: {floorTemplates.Count}, комнат: {totalRooms}.\n{lastReport}");
        }

        // ------------------------------------------------------------------
        // Выбор шаблона и раздача локаций по этажам
        // ------------------------------------------------------------------

        private GenTemplate GetSelectedTemplate()
        {
            if (templateLibrary != null && templateLibrary.Entries.Count > 0)
            {
                int idx = Mathf.Clamp(selectedTemplateIndex, 0, templateLibrary.Entries.Count - 1);
                var entry = templateLibrary.Entries[idx];
                if (entry.IsValid) return entry.Data;
            }
            return GenTemplate.CreateDefault(personalRoomCount);
        }

        /// <summary>
        /// Шаблон → план каждого этажа. floorPlacement: ground — 1-й этаж,
        /// upper — этажи выше 1-го (или 1-й, если этаж один), any — поровну
        /// на все. countPerPlayer → число игроков (слайдер).
        /// </summary>
        private List<GenTemplate> BuildFloorTemplates(GenTemplate template, int players)
        {
            int floors = Mathf.Clamp(template.floors, 1, 4);
            List<GenTemplate> result = new List<GenTemplate>();
            for (int f = 0; f < floors; f++)
            {
                result.Add(new GenTemplate
                {
                    name = $"{template.name} — этаж {f + 1}",
                    corridorWidth = template.corridorWidth,
                    roomDepthMin = template.roomDepthMin,
                    roomDepthMax = template.roomDepthMax,
                });
            }

            foreach (GenLocationSpec spec in template.locations)
            {
                if (template.basementCourtroom && spec.id == "courtroom") continue; // суд в подвале

                int total = spec.countPerPlayer ? players : spec.count;
                if (total <= 0) continue;

                List<int> targetFloors = new List<int>();
                switch (spec.floorPlacement)
                {
                    case "ground": targetFloors.Add(0); break;
                    case "upper":
                        for (int f = 1; f < floors; f++) targetFloors.Add(f);
                        if (targetFloors.Count == 0) targetFloors.Add(0);
                        break;
                    default:
                        for (int f = 0; f < floors; f++) targetFloors.Add(f);
                        break;
                }

                // Поровну по целевым этажам.
                int per = Mathf.CeilToInt(total / (float)targetFloors.Count);
                int left = total;
                foreach (int f in targetFloors)
                {
                    int here = Mathf.Min(per, left);
                    if (here <= 0) break;
                    result[f].locations.Add(spec.Clone(here));
                    left -= here;
                }
            }

            // Лифтовая при подвале.
            if (template.basementCourtroom)
            {
                result[0].locations.Add(new GenLocationSpec
                {
                    id = "elevator_room",
                    displayName = "Лифтовая",
                    widthMin = 3, widthMax = 4,
                    count = 1,
                    required = true,
                });
            }

            return result;
        }

        /// <summary>Верхний этаж получил коробку первого: обрезаем/двигаем комнаты под неё.</summary>
        private static void FitRoomsToBounds(FloorPlanGenerator.FloorPlan plan, FloorPlanGenerator.FloorPlan ground)
        {
            plan.Rooms.RemoveAll(room => !ground.Bounds.Overlaps(room.Rect));
            foreach (FloorPlanGenerator.GenRoom room in plan.Rooms)
            {
                RectInt r = room.Rect;
                int xMax = Mathf.Min(r.xMax, ground.Bounds.xMax);
                int yMax = Mathf.Min(r.yMax, ground.Bounds.yMax);
                int xMin = Mathf.Max(r.xMin, ground.Bounds.xMin);
                int yMin = Mathf.Max(r.yMin, ground.Bounds.yMin);
                room.Rect = new RectInt(xMin, yMin, Mathf.Max(1, xMax - xMin), Mathf.Max(1, yMax - yMin));
            }
        }

        // ------------------------------------------------------------------
        // Лестницы: одна шахта на здание, клетки совпадают на всех этажах
        // ------------------------------------------------------------------

        private void PlaceStairs(FloorPlanGenerator.FloorPlan groundPlan, int floors, List<string> report)
        {
            if (floors <= 1 || groundPlan == null) return;

            List<StampData> stairs = stampLibrary.FindByTags(new List<string> { stairStampTag });
            if (stairs.Count == 0)
            {
                report.Add($"Нет штампа лестницы (тег {stairStampTag}) — этажи не соединены!");
                return;
            }

            StampData stair = stairs[0];

            // Ищем место в коридоре первого этажа, где лестница встаёт на ВСЕХ этажах.
            RectInt corridor = groundPlan.Corridor;
            for (int x = corridor.xMin; x <= corridor.xMax - stair.footprintW; x++)
            {
                for (int y = corridor.yMin; y <= corridor.yMax - stair.footprintL; y++)
                {
                    Vector2Int pos = new Vector2Int(x, y);
                    bool fitsAll = true;
                    for (int f = 0; f < floors - 1 && fitsAll; f++)
                    {
                        if (!placementService.CanPlace(stair, pos, 0, FloorContext.FloorY(f))) fitsAll = false;
                    }
                    if (!fitsAll) continue;

                    // Лестница на каждом этаже, кроме последнего (ведёт наверх).
                    for (int f = 0; f < floors - 1; f++)
                    {
                        placementService.TryPlace(stair, pos, 0, out _, out _, FloorContext.FloorY(f));
                        // Проём: убрать плитки пола НАД лестницей (этаж f+1),
                        // иначе игрок упрётся головой в пол.
                        RemoveFloorTiles(new RectInt(pos.x, pos.y, stair.footprintW, stair.footprintL), f + 1);
                    }
                    return;
                }
            }

            report.Add("Лестница не поместилась в коридоре — этажи не соединены!");
        }

        // ------------------------------------------------------------------
        // Подвал: зал суда (этаж -1) + лифт из лифтовой первого этажа
        // ------------------------------------------------------------------

        private void BuildBasementCourtroom(FloorPlanGenerator.FloorPlan groundPlan, int seed, List<string> report)
        {
            const int basementFloor = -1;

            // Лифтовая комната первого этажа — точка соединения.
            FloorPlanGenerator.GenRoom elevatorRoom = null;
            foreach (FloorPlanGenerator.GenRoom room in groundPlan.Rooms)
            {
                if (room.Spec.id == "elevator_room") { elevatorRoom = room; break; }
            }
            if (elevatorRoom == null)
            {
                report.Add("Подвал: лифтовая комната не найдена на 1-м этаже.");
                return;
            }

            // Зал суда в подвале: квадрат прямо под лифтовой, расширенный
            // до размера суда (14x14 либо меньше, если здание уже).
            int size = Mathf.Min(14, Mathf.Min(groundPlan.Bounds.width, groundPlan.Bounds.height));
            size = Mathf.Max(size, 8);
            Vector2Int center = new Vector2Int(
                (elevatorRoom.Rect.xMin + elevatorRoom.Rect.xMax) / 2,
                (elevatorRoom.Rect.yMin + elevatorRoom.Rect.yMax) / 2);
            RectInt court = new RectInt(center.x - size / 2, center.y - size / 2, size, size);

            // Не вылезаем за коробку здания (подвал держим под домом).
            int shiftX = Mathf.Max(0, groundPlan.Bounds.xMin - court.xMin) - Mathf.Max(0, court.xMax - groundPlan.Bounds.xMax);
            int shiftY = Mathf.Max(0, groundPlan.Bounds.yMin - court.yMin) - Mathf.Max(0, court.yMax - groundPlan.Bounds.yMax);
            court.position += new Vector2Int(shiftX, shiftY);

            // Стены, пол.
            HashSet<WallEdge> edges = new HashSet<WallEdge>();
            AddRectEdges(edges, court, basementFloor);
            WallDefinition wallDef = wallCatalog?.CurrentWall;
            if (wallDef != null)
            {
                foreach (WallEdge edge in edges)
                {
                    if (wallSystem.CanPlaceWall(wallDef, edge)) wallSystem.PlaceWall(wallDef, edge);
                }
            }

            BuildingDefinition floorDef = FindFloorDefinition();
            if (floorDef != null)
            {
                float byY = gridBuildingSystem.GridOrigin.y + FloorContext.FloorY(basementFloor);
                for (int x = court.xMin; x < court.xMax; x++)
                    for (int y = court.yMin; y < court.yMax; y++)
                        if (gridBuildingSystem.CanPlace(floorDef, new Vector2Int(x, y), 0, byY))
                            gridBuildingSystem.Place(floorDef, new Vector2Int(x, y), 0, byY, 0f);
            }

            // Лифт: пара штампов на ОДНИХ клетках — в лифтовой (этаж 0)
            // и в зале суда (этаж -1).
            List<StampData> elevators = stampLibrary.FindByTags(new List<string> { elevatorStampTag });
            if (elevators.Count == 0)
            {
                report.Add($"Подвал: нет штампа лифта (тег {elevatorStampTag}) — суд недостижим!");
                return;
            }
            StampData elevator = elevators[0];

            bool placed = false;
            for (int x = elevatorRoom.Rect.xMin; x <= elevatorRoom.Rect.xMax - elevator.footprintW && !placed; x++)
            {
                for (int y = elevatorRoom.Rect.yMin; y <= elevatorRoom.Rect.yMax - elevator.footprintL && !placed; y++)
                {
                    Vector2Int pos = new Vector2Int(x, y);
                    RectInt stampRect = new RectInt(pos.x, pos.y, elevator.footprintW, elevator.footprintL);
                    if (stampRect.Contains(elevatorRoom.DoorCellInside)) continue;
                    if (!court.Overlaps(stampRect)) continue; // клетки лифта должны быть и в суде

                    if (placementService.CanPlace(elevator, pos, 0, 0f) &&
                        placementService.CanPlace(elevator, pos, 0, FloorContext.FloorY(basementFloor)))
                    {
                        placementService.TryPlace(elevator, pos, 0, out _, out _, 0f);
                        placementService.TryPlace(elevator, pos, 0, out _, out _, FloorContext.FloorY(basementFloor));
                        placed = true;
                    }
                }
            }

            // Зал суда: required-штампы (если есть штамп с тегом cat:courtroom).
            List<StampData> courtStamps = stampLibrary.FindByTags(new List<string> { "cat:courtroom" });
            if (courtStamps.Count > 0)
            {
                System.Random rng = new System.Random(seed * 17 + 3);
                FloorPlanGenerator.GenRoom courtRoom = new FloorPlanGenerator.GenRoom
                {
                    Spec = new GenLocationSpec { id = "courtroom", displayName = "Зал суда" },
                    Rect = court,
                    DoorCellInside = center,
                };
                TryPlaceStampInRoom(courtRoom, new TagSet("cat:courtroom"), rng, FloorContext.FloorY(basementFloor));
            }

            if (!placed)
            {
                report.Add("Подвал: лифт не поместился в лифтовой над залом суда!");
            }
        }

        /// <summary>Удаляет плитки пола (слой Floor) этажа floor в прямоугольнике клеток.</summary>
        private void RemoveFloorTiles(RectInt cells, int floor)
        {
            float targetY = gridBuildingSystem.GridOrigin.y + FloorContext.FloorY(floor);
            List<PlacedObject> toRemove = new List<PlacedObject>();

            foreach (PlacedObject obj in gridBuildingSystem.PlacedObjects)
            {
                if (obj == null || obj.Layer != BuildLayer.Floor) continue;
                if (Mathf.Abs(obj.BaseY - targetY) > 0.1f) continue;
                Vector2Int c = obj.OriginCell;
                if (c.x >= cells.xMin && c.x < cells.xMax && c.y >= cells.yMin && c.y < cells.yMax)
                {
                    toRemove.Add(obj);
                }
            }

            foreach (PlacedObject obj in toRemove) gridBuildingSystem.Remove(obj);
        }

        // ------------------------------------------------------------------
        // Стены и двери
        // ------------------------------------------------------------------

        private void BuildWallsAndDoors(FloorPlanGenerator.FloorPlan plan, List<string> report, int floor = 0)
        {
            WallDefinition wallDef = wallCatalog?.CurrentWall;
            WallOpeningDefinition doorDef = wallCatalog?.CurrentDoor;
            if (wallDef == null)
            {
                report.Add("Нет WallDefinition в каталоге — стены пропущены.");
                return;
            }

            // Уникальный набор рёбер: контур здания + контуры комнат.
            HashSet<WallEdge> edges = new HashSet<WallEdge>();
            AddRectEdges(edges, plan.Bounds, floor);
            foreach (FloorPlanGenerator.GenRoom room in plan.Rooms)
            {
                AddRectEdges(edges, room.Rect, floor);
            }

            foreach (WallEdge edge in edges)
            {
                if (wallSystem.CanPlaceWall(wallDef, edge))
                {
                    wallSystem.PlaceWall(wallDef, edge);
                }
            }

            // Двери: проём в стене между комнатой и коридором.
            foreach (FloorPlanGenerator.GenRoom room in plan.Rooms)
            {
                WallEdge doorEdge = new WallEdge(room.DoorEdge.x, room.DoorEdge.y, room.DoorEdge.orientation, floor);
                if (doorDef == null)
                {
                    // Нет двери в каталоге — просто убираем сегмент (открытый проём).
                    wallSystem.RemoveAtEdge(doorEdge);
                    continue;
                }

                if (wallSystem.CanPlaceOpening(doorDef, doorEdge))
                {
                    wallSystem.PlaceOpening(doorDef, doorEdge);
                }
                else
                {
                    wallSystem.RemoveAtEdge(doorEdge);
                    report.Add($"{room.Spec.displayName}: дверь не встала, оставлен проём.");
                }
            }
        }

        private static void AddRectEdges(HashSet<WallEdge> edges, RectInt rect, int floor = 0)
        {
            for (int x = rect.xMin; x < rect.xMax; x++)
            {
                edges.Add(new WallEdge(x, rect.yMin, WallOrientation.Horizontal, floor));
                edges.Add(new WallEdge(x, rect.yMax, WallOrientation.Horizontal, floor));
            }
            for (int y = rect.yMin; y < rect.yMax; y++)
            {
                edges.Add(new WallEdge(rect.xMin, y, WallOrientation.Vertical, floor));
                edges.Add(new WallEdge(rect.xMax, y, WallOrientation.Vertical, floor));
            }
        }

        // ------------------------------------------------------------------
        // Полы
        // ------------------------------------------------------------------

        private void BuildFloors(FloorPlanGenerator.FloorPlan plan, List<string> report, int floor = 0)
        {
            BuildingDefinition floorDef = FindFloorDefinition();
            if (floorDef == null)
            {
                report.Add("Нет Floor-definition в каталоге — полы пропущены.");
                return;
            }

            float baseY = gridBuildingSystem.GridOrigin.y + FloorContext.FloorY(floor);
            for (int x = plan.Bounds.xMin; x < plan.Bounds.xMax; x++)
            {
                for (int y = plan.Bounds.yMin; y < plan.Bounds.yMax; y++)
                {
                    Vector2Int cell = new Vector2Int(x, y);
                    if (gridBuildingSystem.CanPlace(floorDef, cell, 0, baseY))
                    {
                        gridBuildingSystem.Place(floorDef, cell, 0, baseY, 0f);
                    }
                }
            }
        }

        private BuildingDefinition FindFloorDefinition()
        {
            foreach (BuildingDefinition item in buildCatalog.AllItems)
            {
                if (item != null && item.layer == BuildLayer.Floor) return item;
            }
            return null;
        }

        // ------------------------------------------------------------------
        // Required-штампы по тегам
        // ------------------------------------------------------------------

        private void FillRequiredStamps(FloorPlanGenerator.FloorPlan plan, int seed, List<string> report, int floor = 0)
        {
            System.Random rng = new System.Random(seed * 31 + 7);
            float floorY = FloorContext.FloorY(floor);

            foreach (FloorPlanGenerator.GenRoom room in plan.Rooms)
            {
                foreach (TagSet tagSet in room.Spec.requiredStampTagSets)
                {
                    if (!TryPlaceStampInRoom(room, tagSet, rng, floorY))
                    {
                        report.Add($"{room.Spec.displayName}: не удалось разместить «{tagSet}» " +
                                   "(нет штампа с тегами или не влез).");
                    }
                }
            }
        }

        private bool TryPlaceStampInRoom(FloorPlanGenerator.GenRoom room, TagSet tagSet, System.Random rng, float floorY = 0f)
        {
            List<StampData> candidates = stampLibrary.FindByTags(tagSet.tags);
            if (candidates.Count == 0) return false;

            // Взвешенный порядок кандидатов (weight), затем перебор позиций.
            Shuffle(candidates, rng);
            candidates.Sort((a, b) => WeightedKey(b, rng).CompareTo(WeightedKey(a, rng)));

            foreach (StampData stamp in candidates)
            {
                // Кандидатные позиции согласно якорю штампа (Wall — вдоль стен
                // спиной к стене, Corner — углы, Center, NearDoor, Free).
                List<AnchorPlacementPlanner.Candidate> positions =
                    AnchorPlacementPlanner.GetCandidates(stamp, room.Rect, room.DoorCellInside, rng);

                foreach (AnchorPlacementPlanner.Candidate candidate in positions)
                {
                    if (!IsPlacementAllowed(stamp, candidate, room)) continue;

                    if (placementService.CanPlace(stamp, candidate.Pos, candidate.Rotation, floorY) &&
                        placementService.TryPlace(stamp, candidate.Pos, candidate.Rotation, out _, out _, floorY))
                    {
                        RegisterClearance(stamp, candidate);
                        socketFiller.FillSockets(stamp, candidate.Pos, candidate.Rotation, rng, socketFailures, 0, floorY);
                        return true;
                    }
                }
            }

            return false;
        }

        // Занятые clearance-зоны уже поставленных штампов (на одну генерацию).
        private readonly List<RectInt> reservedClearances = new List<RectInt>();
        private readonly List<string> socketFailures = new List<string>();

        private bool IsPlacementAllowed(StampData stamp, AnchorPlacementPlanner.Candidate candidate,
            FloorPlanGenerator.GenRoom room)
        {
            Vector2Int fp = StampPlacementService.RotatedFootprint(stamp, candidate.Rotation);
            RectInt stampRect = new RectInt(candidate.Pos.x, candidate.Pos.y, fp.x, fp.y);

            // 1. Не перекрываем клетку перед дверью.
            if (stampRect.Contains(room.DoorCellInside)) return false;

            // 2. Footprint не наезжает на чужие clearance-зоны.
            foreach (RectInt reserved in reservedClearances)
            {
                if (stampRect.Overlaps(reserved)) return false;
            }

            // 3. Собственные clearance-зоны штампа: внутри комнаты, не на двери,
            //    не на чужих clearance (это «рабочая зона» перед дверцей).
            foreach (StampClearanceRect cl in stamp.clearance)
            {
                RectInt worldCl = ClearanceToWorld(stamp, cl, candidate);
                if (!RectContains(room.Rect, worldCl)) return false;
                if (worldCl.Contains(room.DoorCellInside)) return false;
                foreach (RectInt reserved in reservedClearances)
                {
                    if (worldCl.Overlaps(reserved)) return false;
                }
            }

            return true;
        }

        private void RegisterClearance(StampData stamp, AnchorPlacementPlanner.Candidate candidate)
        {
            foreach (StampClearanceRect cl in stamp.clearance)
            {
                reservedClearances.Add(ClearanceToWorld(stamp, cl, candidate));
            }
        }

        private static RectInt ClearanceToWorld(StampData stamp, StampClearanceRect cl,
            AnchorPlacementPlanner.Candidate candidate)
        {
            RectInt local = StampPlacementService.RotateLocalRect(
                new RectInt(cl.x, cl.y, cl.w, cl.l), stamp.footprintW, stamp.footprintL, candidate.Rotation);
            return new RectInt(candidate.Pos.x + local.xMin, candidate.Pos.y + local.yMin, local.width, local.height);
        }

        private static bool RectContains(RectInt outer, RectInt inner)
        {
            return inner.xMin >= outer.xMin && inner.yMin >= outer.yMin &&
                   inner.xMax <= outer.xMax && inner.yMax <= outer.yMax;
        }

        private static float WeightedKey(StampData stamp, System.Random rng)
        {
            // Случайный ключ, смещённый весом: классический weighted shuffle.
            return (float)System.Math.Pow(rng.NextDouble(), 1.0 / Mathf.Max(0.0001f, stamp.weight));
        }

        private static void Shuffle<T>(List<T> list, System.Random rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }

        // ------------------------------------------------------------------
        // Временный UI
        // ------------------------------------------------------------------

        private void OnGUI()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit) return;

            Rect buttonRect = new Rect(Screen.width * 0.5f - 55, 10, 110, 26);
            if (GUI.Button(buttonRect, "Генерация"))
            {
                showPanel = !showPanel;
            }

            if (!showPanel) return;

            float panelH = Mathf.Min(460f, Screen.height - 80f);
            Rect rect = new Rect(Screen.width * 0.5f - 170, 42, 340, panelH);
            GUI.Box(rect, "Генератор карт");
            GUILayout.BeginArea(new Rect(rect.x + 10, rect.y + 24, rect.width - 20, rect.height - 34));
            genPanelScroll = GUILayout.BeginScrollView(genPanelScroll);

            // Выбор шаблона.
            GUILayout.Label("Шаблон:");
            if (templateLibrary != null)
            {
                for (int i = 0; i < templateLibrary.Entries.Count; i++)
                {
                    var entry = templateLibrary.Entries[i];
                    if (!entry.IsValid)
                    {
                        GUI.color = new Color(1f, 0.5f, 0.5f);
                        GUILayout.Label($"[x] {System.IO.Path.GetFileName(entry.FilePath ?? "?")}");
                        GUI.color = Color.white;
                        continue;
                    }
                    bool isSel = i == selectedTemplateIndex;
                    string mark = isSel ? "> " : "   ";
                    if (GUILayout.Button($"{mark}{entry.Data.name}" + (entry.IsUserContent ? "  [польз.]" : "")))
                    {
                        selectedTemplateIndex = i;
                    }
                }

                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Новый шаблон")) templateEditor?.Open();
                var selEntry = templateLibrary.Entries.Count > 0
                    ? templateLibrary.Entries[Mathf.Clamp(selectedTemplateIndex, 0, templateLibrary.Entries.Count - 1)]
                    : null;
                if (selEntry != null && selEntry.IsValid && GUILayout.Button(selEntry.IsUserContent ? "Изменить" : "Копировать"))
                {
                    templateEditor?.Open(selEntry.Data);
                }
                if (selEntry != null && selEntry.IsUserContent && GUILayout.Button("Удалить"))
                {
                    templateLibrary.DeleteUserTemplate(selEntry.Data.id);
                    selectedTemplateIndex = 0;
                }
                GUILayout.EndHorizontal();
            }

            GUILayout.Label($"Игроков (личных комнат): {personalRoomCount}");
            int newCount = (int)GUILayout.HorizontalSlider(personalRoomCount, 2, 16);
            if (newCount != personalRoomCount) personalRoomCount = newCount;

            clearWorldBeforeGenerate = GUILayout.Toggle(clearWorldBeforeGenerate, " Очистить мир перед генерацией");

            if (GUILayout.Button("Сгенерировать этаж", GUILayout.Height(28)))
            {
                GenerateAndApply();
            }

            if (!string.IsNullOrEmpty(lastReport))
            {
                GUILayout.Label(lastReport);
            }

            GUILayout.EndScrollView();
            GUILayout.EndArea();

            // Курсор над панелью — не зумить камеру и не кликать в мир.
            Vector2 mouse = InputHelper.MousePosition;
            Vector2 guiPoint = new Vector2(mouse.x, Screen.height - mouse.y);
            if (rect.Contains(guiPoint) || buttonRect.Contains(guiPoint))
            {
                UiInputGuard.BlockScrollThisFrame();
            }
        }
    }
}
