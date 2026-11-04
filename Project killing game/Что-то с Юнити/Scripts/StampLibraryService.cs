using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Библиотека штампов: скан папок, загрузка/сохранение JSON, валидация
    /// (уровни 1–2 из спецификации: схема + ссылки), индекс по тегам.
    ///
    /// Папки:
    ///   StreamingAssets/MapGen/Stamps/*.stamp.json  — контент разработчика (read-only)
    ///   persistentDataPath/MapGen/Stamps/*.stamp.json — пользовательский контент
    ///
    /// Пользовательские id обязаны начинаться с "user." и не могут
    /// перекрывать базовые id.
    /// </summary>
    public class StampLibraryService : MonoBehaviour
    {
        [Header("References (для валидации ссылок)")]
        [SerializeField] private BuildCatalog buildCatalog;
        [SerializeField] private WallCatalog wallCatalog;
        [SerializeField] private PathCatalog pathCatalog;

        private readonly List<StampEntry> entries = new List<StampEntry>();
        private readonly Dictionary<string, StampEntry> byId = new Dictionary<string, StampEntry>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, List<StampEntry>> byTag = new Dictionary<string, List<StampEntry>>(StringComparer.OrdinalIgnoreCase);

        public event Action LibraryChanged;

        public IReadOnlyList<StampEntry> Entries => entries;

        public class StampEntry
        {
            public StampData Data;
            public string FilePath;
            public bool IsUserContent;
            public bool IsValid;
            public List<string> Errors = new List<string>();
        }

        public static string UserStampsDirectory =>
            Path.Combine(Application.persistentDataPath, "MapGen", "Stamps");

        public static string CoreStampsDirectory =>
            Path.Combine(Application.streamingAssetsPath, "MapGen", "Stamps");

        private void Awake()
        {
            Reload();
        }

        // ------------------------------------------------------------------
        // Загрузка
        // ------------------------------------------------------------------

        public void Reload()
        {
            entries.Clear();
            byId.Clear();
            byTag.Clear();

            // Сначала core (id-приоритет), затем user.
            LoadDirectory(CoreStampsDirectory, isUser: false);
            LoadDirectory(UserStampsDirectory, isUser: true);

            RebuildTagIndex();
            LibraryChanged?.Invoke();
        }

        private void LoadDirectory(string directory, bool isUser)
        {
            if (!Directory.Exists(directory))
            {
                if (isUser)
                {
                    Directory.CreateDirectory(directory);
                }
                return;
            }

            foreach (string file in Directory.GetFiles(directory, "*.stamp.json", SearchOption.TopDirectoryOnly).OrderBy(f => f))
            {
                StampEntry entry = new StampEntry { FilePath = file, IsUserContent = isUser };

                try
                {
                    string json = File.ReadAllText(file);
                    entry.Data = JsonUtility.FromJson<StampData>(json);
                }
                catch (Exception e)
                {
                    entry.Errors.Add($"Не удалось прочитать JSON: {e.Message}");
                }

                if (entry.Data != null)
                {
                    Validate(entry);
                }
                else if (entry.Errors.Count == 0)
                {
                    entry.Errors.Add("Пустой или нечитаемый файл.");
                }

                entry.IsValid = entry.Errors.Count == 0;
                entries.Add(entry);

                if (entry.IsValid)
                {
                    byId[entry.Data.id] = entry; // конфликт уже отсечён в Validate
                }
                else
                {
                    Debug.LogWarning($"[StampLibrary] '{Path.GetFileName(file)}' отклонён: {string.Join("; ", entry.Errors)}");
                }
            }
        }

        // ------------------------------------------------------------------
        // Доступ
        // ------------------------------------------------------------------

        public StampData FindById(string id)
        {
            return !string.IsNullOrWhiteSpace(id) && byId.TryGetValue(id, out StampEntry e) ? e.Data : null;
        }

        /// <summary>Все валидные штампы, имеющие ВСЕ перечисленные теги.</summary>
        public List<StampData> FindByTags(IReadOnlyList<string> requiredTags)
        {
            List<StampData> result = new List<StampData>();
            if (requiredTags == null || requiredTags.Count == 0)
            {
                foreach (StampEntry e in entries)
                {
                    if (e.IsValid) result.Add(e.Data);
                }
                return result;
            }

            if (!byTag.TryGetValue(requiredTags[0], out List<StampEntry> candidates))
            {
                return result;
            }

            foreach (StampEntry e in candidates)
            {
                bool all = true;
                for (int i = 1; i < requiredTags.Count; i++)
                {
                    if (!e.Data.tags.Contains(requiredTags[i], StringComparer.OrdinalIgnoreCase)) { all = false; break; }
                }
                if (all) result.Add(e.Data);
            }
            return result;
        }

        // ------------------------------------------------------------------
        // Сохранение пользовательского штампа
        // ------------------------------------------------------------------

        public bool TrySaveUserStamp(StampData data, out string error)
        {
            error = null;
            if (data == null) { error = "Нет данных."; return false; }

            // user-префикс обязателен; генерируем id из имени, если не задан.
            if (string.IsNullOrWhiteSpace(data.id))
            {
                data.id = "user.stamp." + SlugFromName(data.name);
            }
            if (!data.id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
            {
                error = "Пользовательский id должен начинаться с 'user.'";
                return false;
            }
            if (byId.TryGetValue(data.id, out StampEntry existing) && !existing.IsUserContent)
            {
                error = $"Id '{data.id}' конфликтует с базовым контентом.";
                return false;
            }

            StampEntry probe = new StampEntry { Data = data, IsUserContent = true };
            Validate(probe);
            if (probe.Errors.Count > 0)
            {
                error = string.Join("; ", probe.Errors);
                return false;
            }

            Directory.CreateDirectory(UserStampsDirectory);
            string fileName = data.id.Replace('.', '_') + ".stamp.json";
            string path = Path.Combine(UserStampsDirectory, fileName);
            File.WriteAllText(path, JsonUtility.ToJson(data, prettyPrint: true));
            Debug.Log($"[StampLibrary] Штамп сохранён: {path}");

            Reload();
            return true;
        }

        public bool DeleteUserStamp(string id)
        {
            if (!byId.TryGetValue(id, out StampEntry e) || !e.IsUserContent || string.IsNullOrEmpty(e.FilePath))
            {
                return false;
            }
            File.Delete(e.FilePath);
            Reload();
            return true;
        }

        // ------------------------------------------------------------------
        // Валидация: уровень 1 (схема) + уровень 2 (ссылки)
        // ------------------------------------------------------------------

        private void Validate(StampEntry entry)
        {
            StampData d = entry.Data;

            // --- Уровень 1: схема ---
            if (string.IsNullOrWhiteSpace(d.id))
            {
                entry.Errors.Add("Пустой id.");
            }
            else
            {
                foreach (char c in d.id)
                {
                    if (!(char.IsLower(c) || char.IsDigit(c) || c == '_' || c == '.'))
                    {
                        entry.Errors.Add($"Недопустимый символ в id: '{c}' (разрешены a-z, 0-9, '_', '.').");
                        break;
                    }
                }

                if (byId.TryGetValue(d.id, out StampEntry conflict))
                {
                    // user не может перекрыть core; дубликаты в одной зоне тоже запрещены.
                    entry.Errors.Add(conflict.IsUserContent
                        ? $"Дубликат id '{d.id}' (уже есть в {Path.GetFileName(conflict.FilePath)})."
                        : $"Id '{d.id}' конфликтует с базовым контентом.");
                }

                if (entry.IsUserContent && !d.id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
                {
                    entry.Errors.Add("Пользовательский id должен начинаться с 'user.'");
                }
            }

            if (string.IsNullOrWhiteSpace(d.name)) entry.Errors.Add("Пустое имя.");
            if (d.footprintW < 1 || d.footprintL < 1) entry.Errors.Add("footprint должен быть ≥ 1×1.");
            if (d.floorSpan < 1) entry.Errors.Add("floorSpan должен быть ≥ 1.");
            if (d.weight <= 0f) entry.Errors.Add("weight должен быть > 0.");

            if (d.content == null)
            {
                entry.Errors.Add("Нет блока content.");
                return;
            }

            if (d.content.placedObjects.Count == 0 && d.content.walls.Count == 0 && d.content.pathStrokes.Count == 0)
            {
                entry.Errors.Add("Штамп пустой (нет объектов, стен и дорожек).");
            }

            foreach (StampSocket s in d.sockets)
            {
                bool hasCells = (s.cells != null && s.cells.Count > 0) ||
                                (s.area != null && s.area.w > 0 && s.area.l > 0);
                bool hasLegacyHost = s.hostObjectIndex >= 0 && s.hostObjectIndex < d.content.placedObjects.Count;
                if (!hasCells && !hasLegacyHost)
                {
                    entry.Errors.Add($"Сокет '{s.id}': нет клеток (cells/area).");
                }
                if (s.filterTags == null || s.filterTags.Count == 0)
                {
                    entry.Errors.Add($"Сокет '{s.id}': пустой filterTags.");
                }
                if (s.countMin > s.countMax)
                {
                    entry.Errors.Add($"Сокет '{s.id}': countMin > countMax.");
                }
            }

            // --- Уровень 2: ссылки на каталоги ---
            if (buildCatalog != null)
            {
                foreach (StampPlacedObject o in d.content.placedObjects)
                {
                    if (buildCatalog.FindById(o.definitionId) == null)
                    {
                        entry.Errors.Add($"Неизвестный definitionId '{o.definitionId}'.");
                    }
                }
            }
            if (wallCatalog != null)
            {
                foreach (StampWall w in d.content.walls)
                {
                    if (wallCatalog.FindWallById(w.wallDefinitionId) == null)
                    {
                        entry.Errors.Add($"Неизвестный wallDefinitionId '{w.wallDefinitionId}'.");
                    }
                    if (!string.IsNullOrEmpty(w.openingDefinitionId) && wallCatalog.FindOpeningById(w.openingDefinitionId) == null)
                    {
                        entry.Errors.Add($"Неизвестный openingDefinitionId '{w.openingDefinitionId}'.");
                    }
                }
            }
            if (pathCatalog != null)
            {
                foreach (StampPath p in d.content.pathStrokes)
                {
                    if (pathCatalog.FindById(p.definitionId) == null)
                    {
                        entry.Errors.Add($"Неизвестный path definitionId '{p.definitionId}'.");
                    }
                }
            }
        }

        // ------------------------------------------------------------------

        private void RebuildTagIndex()
        {
            foreach (StampEntry e in entries)
            {
                if (!e.IsValid) continue;
                foreach (string tag in e.Data.tags)
                {
                    if (string.IsNullOrWhiteSpace(tag)) continue;
                    if (!byTag.TryGetValue(tag, out List<StampEntry> list))
                    {
                        list = new List<StampEntry>();
                        byTag[tag] = list;
                    }
                    list.Add(e);
                }
            }
        }

        private static string SlugFromName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return Guid.NewGuid().ToString("N").Substring(0, 8);
            var sb = new System.Text.StringBuilder();
            foreach (char c in name.ToLowerInvariant())
            {
                if (char.IsLetterOrDigit(c) && c < 128) sb.Append(c);
                else if (c == ' ' || c == '-' || c == '_') sb.Append('_');
                // кириллица и прочее просто пропускаются; если пусто — guid
            }
            string slug = sb.ToString().Trim('_');
            return string.IsNullOrEmpty(slug) ? Guid.NewGuid().ToString("N").Substring(0, 8) : slug;
        }
    }
}
