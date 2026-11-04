using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Наполнение комнат при генерации: выбирает штамп из библиотеки по тегам
    /// (детерминированно, взвешенно по weight) и эмитит его в WorldState через
    /// StampWorldStateEmitter. Если подходящего штампа нет — ставит запасной
    /// плейсхолдер (старое поведение генератора), чтобы карта никогда не
    /// оставалась пустой.
    ///
    /// Это «шаг 2 MVP-3»: ровно пункт дорожной карты
    /// «заменить placeholder furniture в ClusteredMansionMapGenerator
    ///  на room slots/stamps» — но мягко, с fallback.
    ///
    /// RoomFurnisher НЕ трогает сцену: всё идёт через builder/emitter
    /// (генератор остаётся виртуальным строителем).
    /// </summary>
    public class RoomFurnisher
    {
        private readonly MapGenerationWorldStateBuilder builder;
        private readonly StampLibraryService library;
        private readonly StampWorldStateEmitter emitter;
        private readonly System.Random rng;
        private readonly bool useStamps;
        private readonly VirtualSocketFiller socketFiller;

        /// <summary>Заполнять ли сокеты поставленных штампов (рекурсивно). По умолчанию да.</summary>
        public bool FillSockets = true;

        /// <summary>Раскладывать ли декор-скаттер по LocationDecorData. По умолчанию да.</summary>
        public bool ScatterDecorEnabled = true;

        /// <summary>
        /// Статистика для логов.
        /// </summary>
        public int StampsPlaced { get; private set; }
        public int FallbacksPlaced { get; private set; }
        public int RequiredSlotsUnfilled { get; private set; }

        /// <summary>
        /// Резолвер лодаута владельца комнаты: по (ownerPlayerId, loadoutCategory)
        /// → список штамп-id для слота (приоритетнее тегов). null = нет лодаута.
        /// Подключается на шаге FurnitureLoadout (LoadoutLibraryService.Resolve).
        /// </summary>
        public System.Func<string, string, IReadOnlyList<string>> LoadoutResolver;

        /// <summary>
        /// Дефолты слотов от шаблона: filterTag-ключ (например "loadout:bed")
        /// → штамп-id. Второе звено цепочки резолва (лодаут → ДЕФОЛТ → теги).
        /// Заполняется шаблоном; может быть null/пустым.
        /// </summary>
        public IReadOnlyDictionary<string, string> TemplateSlotDefaults;

        public RoomFurnisher(
            MapGenerationWorldStateBuilder builder,
            StampLibraryService library,
            StampWorldStateEmitter emitter,
            System.Random rng,
            bool useStamps)
        {
            this.builder = builder;
            this.library = library;
            this.emitter = emitter;
            this.rng = rng ?? new System.Random();
            this.useStamps = useStamps && library != null && emitter != null;
            this.socketFiller = this.useStamps ? new VirtualSocketFiller(emitter, library, this.rng) : null;
        }

        /// <summary>
        /// Поставить предмет по тегам в клетку originCell на этаже floor.
        /// Возвращает true, если что-то поставлено (штамп ИЛИ плейсхолдер).
        ///
        /// tags — фильтр (штамп обязан иметь ВСЕ теги);
        /// fallbackDefinitionId — definitionId плейсхолдера, если штампа нет
        ///   (пусто = ничего не ставить при отсутствии штампа);
        /// rotationSteps — поворот штампа/плейсхолдера;
        /// rotationY — доп. поворот для плейсхолдера (штамп берёт поворот из rotationSteps).
        /// </summary>
        public bool Place(IReadOnlyList<string> tags, Vector2Int originCell, int floor,
            int rotationSteps = 0, string fallbackDefinitionId = null, float rotationY = 0f)
        {
            if (useStamps)
            {
                StampData stamp = PickStampByTags(tags);
                if (stamp != null)
                {
                    StampWorldStateEmitter.EmitResult r = emitter.Emit(stamp, originCell, rotationSteps, floor);
                    if (r.Objects > 0 || r.Walls > 0 || r.Paths > 0)
                    {
                        StampsPlaced++;
                        return true;
                    }
                    // Штамп нашёлся, но ничего не дал (битый контент) — упадём в fallback.
                }
            }

            if (!string.IsNullOrWhiteSpace(fallbackDefinitionId))
            {
                builder.AddGridObject(fallbackDefinitionId, originCell, floor, rotationSteps, rotationY);
                FallbacksPlaced++;
                return true;
            }

            return false;
        }

        /// <summary>
        /// Выбор штампа по тегам, взвешенный по weight, на общем rng.
        /// null — нет валидных кандидатов.
        /// </summary>
        public StampData PickStampByTags(IReadOnlyList<string> tags)
        {
            if (library == null)
            {
                return null;
            }

            List<StampData> candidates = library.FindByTags(tags);
            if (candidates == null || candidates.Count == 0)
            {
                return null;
            }

            float total = 0f;
            for (int i = 0; i < candidates.Count; i++)
            {
                total += Mathf.Max(0.0001f, candidates[i].weight);
            }

            double roll = rng.NextDouble() * total;
            float acc = 0f;
            for (int i = 0; i < candidates.Count; i++)
            {
                acc += Mathf.Max(0.0001f, candidates[i].weight);
                if (roll <= acc)
                {
                    return candidates[i];
                }
            }

            return candidates[candidates.Count - 1];
        }

        // ==================================================================
        // Data-driven наполнение комнаты по LocationDef (MVP-3, шаг 3).
        // ==================================================================

        /// <summary>
        /// Наполнить комнату по LocationDef: пройти слоты, выбрать штампы по
        /// тегам (с учётом лодаута владельца), разместить через anchor штампа
        /// в пределах roomRect без наложения. Возвращает число поставленных
        /// штампов слотов.
        ///
        /// roomRect — клетки комнаты (основная сетка);
        /// doorCell — клетка у двери (для anchor NearDoor); может быть (min);
        /// floor — этаж;
        /// ownerPlayerId — владелец комнаты (для лодаута; может быть null).
        /// </summary>
        public int FurnishRoom(LocationDefData location, RectInt roomRect, Vector2Int doorCell, int floor, string ownerPlayerId = null)
        {
            if (location == null || location.slots == null || !useStamps)
            {
                return 0;
            }

            // Внутренний прямоугольник: оставляем 1 клетку у стен под проход.
            RectInt inner = ShrinkForWalls(roomRect);
            HashSet<Vector2Int> occupied = new HashSet<Vector2Int>();
            int placed = 0;

            // Бюджет сокетов — на КОМНАТУ (как в алгоритме генерации §7).
            if (socketFiller != null)
            {
                socketFiller.Budget = 40;
            }

            foreach (LocationSlotData slot in OrderedSlots(location.slots))
            {
                if (slot == null)
                {
                    continue;
                }

                int want = ResolveSlotCount(slot);
                for (int n = 0; n < want; n++)
                {
                    if (!slot.required && slot.probability < 1f && rng.NextDouble() > slot.probability)
                    {
                        continue;
                    }

                    StampData stamp = PickStampForSlot(slot, ownerPlayerId, n);
                    if (stamp == null)
                    {
                        if (slot.required)
                        {
                            RequiredSlotsUnfilled++;
                            Debug.LogWarning($"[Furnisher] '{location.id}' слот '{slot.id}': нет штампа по тегам " +
                                             $"[{string.Join(",", slot.filterTags)}].");
                        }
                        break; // следующий слот
                    }

                    if (TryPlaceStampWithAnchor(stamp, slot, inner, doorCell, floor, occupied))
                    {
                        placed++;
                        StampsPlaced++;
                    }
                    else if (slot.required)
                    {
                        RequiredSlotsUnfilled++;
                        Debug.LogWarning($"[Furnisher] '{location.id}' слот '{slot.id}': штамп '{stamp.id}' " +
                                         "не влез в комнату (нет свободной позиции по anchor).");
                        break;
                    }
                }
            }

            // Декор-скаттер по плотности локации (после слотов — на свободных клетках).
            placed += ScatterDecor(location, inner, floor, occupied);

            return placed;
        }

        /// <summary>
        /// Blue-noise (poisson-disk) раскладка мелкого декора по
        /// LocationDecorData.density на свободных клетках комнаты.
        /// Маска: не на занятых клетках (мебель/слоты/сокеты).
        /// Возвращает число поставленного декора.
        /// </summary>
        private int ScatterDecor(LocationDefData location, RectInt inner, int floor, HashSet<Vector2Int> occupied)
        {
            if (location.decor == null) return 0;
            return ScatterArea(inner, location.decor.density, location.decor.filterTags, floor, occupied, 0f);
        }

        /// <summary>
        /// Публичный декор-скаттер по произвольному прямоугольнику (комната ИЛИ
        /// внешняя зона). baseYOffset — высота земли в зоне (террасы): декор
        /// эмитится на этой высоте через emitter.Emit(..., baseYOffset).
        /// Для внешних зон с переменной высотой передавай baseYOffset на зону
        /// (террасы дискретны — внутри зоны уровень постоянный).
        /// Возвращает число поставленного декора.
        /// </summary>
        public int ScatterArea(RectInt rect, float density, IReadOnlyList<string> filterTags,
            int floor, HashSet<Vector2Int> occupied, float baseYOffset = 0f)
        {
            if (!ScatterDecorEnabled || !useStamps) return 0;
            if (density <= 0f || filterTags == null || filterTags.Count == 0) return 0;

            int area = Mathf.Max(0, rect.width) * Mathf.Max(0, rect.height);
            if (area <= 0) return 0;

            // Считаем СВОБОДНУЮ площадь (исключая маску, напр. пятно здания во
            // дворе), чтобы плотность относилась к реально доступной земле,
            // а не к прямоугольнику, наполовину занятому домом.
            int freeArea = area;
            if (occupied != null && occupied.Count > 0)
            {
                freeArea = 0;
                for (int x = rect.xMin; x < rect.xMax; x++)
                {
                    for (int y = rect.yMin; y < rect.yMax; y++)
                    {
                        if (!occupied.Contains(new Vector2Int(x, y))) freeArea++;
                    }
                }
            }
            if (freeArea <= 0) return 0;

            int target = Mathf.Clamp(Mathf.RoundToInt(density * freeArea), 0, freeArea);
            if (target <= 0) return 0;

            float minDist = Mathf.Max(1f, Mathf.Sqrt(freeArea / (float)target) * 0.85f);
            List<Vector2Int> accepted = PoissonCells(rect, minDist, target, occupied);

            int placedDecor = 0;
            foreach (Vector2Int cell in accepted)
            {
                StampData decorStamp = PickStampByTags(filterTags);
                if (decorStamp == null) break; // нет подходящих штампов в палитре

                Vector2Int fp = StampPlacementService.RotatedFootprint(decorStamp, 0);
                if (!IsAreaFree(cell, fp, occupied)) continue;

                StampWorldStateEmitter.EmitResult r = emitter.Emit(decorStamp, cell, 0, floor, baseYOffset);
                if (r.Objects > 0 || r.Walls > 0 || r.Paths > 0)
                {
                    MarkOccupied(cell, fp, occupied);
                    placedDecor++;
                    StampsPlaced++;
                }
            }

            return placedDecor;
        }

        /// <summary>
        /// Простая детерминированная poisson-disk выборка по клеткам:
        /// бросаем кандидатов из rng, принимаем, если дальше minDist от уже
        /// принятых и клетка свободна. Воспроизводимо при одном seed.
        /// </summary>
        private List<Vector2Int> PoissonCells(RectInt rect, float minDist, int target, HashSet<Vector2Int> occupied)
        {
            List<Vector2Int> accepted = new List<Vector2Int>();
            if (rect.width <= 0 || rect.height <= 0) return accepted;

            float minDistSqr = minDist * minDist;
            // Запас попыток: больше для разреженных/маскированных областей.
            int attempts = Mathf.Max(target * 20, rect.width * rect.height);

            for (int a = 0; a < attempts && accepted.Count < target; a++)
            {
                int x = rect.xMin + rng.Next(rect.width);
                int y = rect.yMin + rng.Next(rect.height);
                Vector2Int cell = new Vector2Int(x, y);

                if (occupied != null && occupied.Contains(cell)) continue;

                bool ok = true;
                for (int i = 0; i < accepted.Count; i++)
                {
                    float dx = accepted[i].x - x;
                    float dy = accepted[i].y - y;
                    if (dx * dx + dy * dy < minDistSqr) { ok = false; break; }
                }

                if (ok) accepted.Add(cell);
            }

            return accepted;
        }

        /// <summary>
        /// Разместить штамп по его anchor (или по anchor-override слота) в первой
        /// свободной позиции внутри roomRect; пометить занятые клетки.
        /// </summary>
        private bool TryPlaceStampWithAnchor(StampData stamp, LocationSlotData slot, RectInt roomRect,
            Vector2Int doorCell, int floor, HashSet<Vector2Int> occupied)
        {
            StampData effective = string.IsNullOrWhiteSpace(slot.anchor) ? stamp : CloneWithAnchor(stamp, slot.anchor);

            List<AnchorPlacementPlanner.Candidate> candidates =
                AnchorPlacementPlanner.GetCandidates(effective, roomRect, doorCell, rng);

            foreach (AnchorPlacementPlanner.Candidate c in candidates)
            {
                Vector2Int fp = StampPlacementService.RotatedFootprint(effective, c.Rotation);
                if (IsAreaFree(c.Pos, fp, occupied))
                {
                    StampWorldStateEmitter.EmitResult r = emitter.Emit(stamp, c.Pos, c.Rotation, floor);
                    if (r.Objects > 0 || r.Walls > 0 || r.Paths > 0)
                    {
                        MarkOccupied(c.Pos, fp, occupied);

                        // Рекурсивное заполнение сокетов поставленного штампа
                        // (цветок на тумбочке и т.п.) — тем же виртуальным путём.
                        if (FillSockets && socketFiller != null)
                        {
                            socketFiller.Fill(stamp, c.Pos, c.Rotation, floor, occupied);
                        }

                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// Резолв штампа для слота. instanceIndex — порядковый номер вставки
        /// внутри слота (0..count-1): для лодаута со СПИСКОМ (например personal:
        /// мольберт, цветок) это позволяет ставить РАЗНЫЕ предметы по индексу,
        /// а не один и тот же count раз.
        /// Цепочка: лодаут владельца → дефолт шаблона → любой штамп по тегам.
        /// </summary>
        private StampData PickStampForSlot(LocationSlotData slot, string ownerPlayerId, int instanceIndex)
        {
            // 0) Жёстко заданный штамп (из оверрайда forceStampId) — высший приоритет,
            //    в обход тегов/лодаута/дефолтов.
            if (library != null && !string.IsNullOrWhiteSpace(slot.forceStampId))
            {
                StampData forced = library.FindById(slot.forceStampId);
                if (forced != null)
                {
                    return forced;
                }
            }

            // 1) Лодаут владельца (если есть резолвер и категория слота).
            if (LoadoutResolver != null && !string.IsNullOrWhiteSpace(slot.loadoutCategory) && !string.IsNullOrWhiteSpace(ownerPlayerId))
            {
                IReadOnlyList<string> ids = LoadoutResolver(ownerPlayerId, slot.loadoutCategory);
                if (ids != null && ids.Count > 0)
                {
                    // Для multi-count слотов берём предмет по индексу инстанса
                    // (мольберт, потом цветок); за пределами списка — циклически.
                    StampData chosen = ResolveLoadoutChoice(ids, slot.filterTags, instanceIndex);
                    if (chosen != null)
                    {
                        return chosen;
                    }
                }
            }

            // 2) Дефолт шаблона по одному из filterTags слота (если задан).
            if (TemplateSlotDefaults != null && slot.filterTags != null)
            {
                foreach (string tag in slot.filterTags)
                {
                    if (TemplateSlotDefaults.TryGetValue(tag, out string defId) && !string.IsNullOrWhiteSpace(defId))
                    {
                        StampData byDefault = library.FindById(defId);
                        if (byDefault != null && StampMatchesTags(byDefault, slot.filterTags))
                        {
                            return byDefault;
                        }
                    }
                }
            }

            // 3) Любой штамп по тегам слота (взвешенный rng).
            return PickStampByTags(slot.filterTags);
        }

        /// <summary>
        /// Выбрать предмет лодаута по индексу инстанса. Сначала фильтруем
        /// список по соответствию тегам слота, затем берём index-й (циклично).
        /// </summary>
        private StampData ResolveLoadoutChoice(IReadOnlyList<string> ids, IReadOnlyList<string> filterTags, int instanceIndex)
        {
            List<StampData> valid = new List<StampData>();
            foreach (string id in ids)
            {
                StampData s = library.FindById(id);
                if (s != null && StampMatchesTags(s, filterTags))
                {
                    valid.Add(s);
                }
            }

            if (valid.Count == 0)
            {
                return null;
            }

            return valid[instanceIndex % valid.Count];
        }

        // ------------------------------------------------------------------
        // Хелперы.
        // ------------------------------------------------------------------

        private int ResolveSlotCount(LocationSlotData slot)
        {
            int min = Mathf.Max(0, slot.countMin);
            int max = Mathf.Max(min, slot.countMax);
            if (slot.required)
            {
                // required: гарантируем хотя бы min, остальное — как обычно.
                return min == max ? min : min + rng.Next(max - min + 1);
            }
            return min == max ? min : min + rng.Next(max - min + 1);
        }

        private static IEnumerable<LocationSlotData> OrderedSlots(List<LocationSlotData> slots)
        {
            // required раньше optional (важнее заполнить обязательное),
            // порядок внутри групп — как в файле (стабильно, воспроизводимо).
            List<LocationSlotData> required = new List<LocationSlotData>();
            List<LocationSlotData> optional = new List<LocationSlotData>();
            foreach (LocationSlotData s in slots)
            {
                if (s == null) continue;
                if (s.required) required.Add(s); else optional.Add(s);
            }
            required.AddRange(optional);
            return required;
        }

        private static bool StampMatchesTags(StampData stamp, IReadOnlyList<string> tags)
        {
            if (tags == null || tags.Count == 0) return true;
            if (stamp.tags == null) return false;
            foreach (string t in tags)
            {
                bool found = false;
                foreach (string st in stamp.tags)
                {
                    if (string.Equals(st, t, System.StringComparison.OrdinalIgnoreCase)) { found = true; break; }
                }
                if (!found) return false;
            }
            return true;
        }

        private static RectInt ShrinkForWalls(RectInt rect)
        {
            if (rect.width <= 2 || rect.height <= 2)
            {
                return rect;
            }
            return new RectInt(rect.xMin + 1, rect.yMin + 1, rect.width - 2, rect.height - 2);
        }

        private static bool IsAreaFree(Vector2Int origin, Vector2Int footprint, HashSet<Vector2Int> occupied)
        {
            for (int dx = 0; dx < footprint.x; dx++)
            {
                for (int dy = 0; dy < footprint.y; dy++)
                {
                    if (occupied.Contains(new Vector2Int(origin.x + dx, origin.y + dy)))
                    {
                        return false;
                    }
                }
            }
            return true;
        }

        private static void MarkOccupied(Vector2Int origin, Vector2Int footprint, HashSet<Vector2Int> occupied)
        {
            for (int dx = 0; dx < footprint.x; dx++)
            {
                for (int dy = 0; dy < footprint.y; dy++)
                {
                    occupied.Add(new Vector2Int(origin.x + dx, origin.y + dy));
                }
            }
        }

        /// <summary>Поверхностная копия штампа с другим anchor (для anchor-override слота).</summary>
        private static StampData CloneWithAnchor(StampData src, string anchor)
        {
            return new StampData
            {
                id = src.id,
                name = src.name,
                author = src.author,
                tags = src.tags,
                footprintW = src.footprintW,
                footprintL = src.footprintL,
                floorSpan = src.floorSpan,
                anchor = anchor,
                anchorEdge = src.anchorEdge,
                weight = src.weight,
                clearance = src.clearance,
                content = src.content,
                sockets = src.sockets
            };
        }

        /// <summary>Сколько валидных штампов в библиотеке имеют ВСЕ указанные теги (диагностика).</summary>
        public int CountStampsByTags(IReadOnlyList<string> tags)
        {
            if (library == null) return 0;
            List<StampData> c = library.FindByTags(tags);
            return c == null ? 0 : c.Count;
        }

        public string FormatStats()
        {
            return $"stamps={StampsPlaced}, fallbacks={FallbacksPlaced}, requiredUnfilled={RequiredSlotsUnfilled}";
        }
    }
}
