using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Библиотека локаций (*.location.json): скан папок, загрузка/валидация,
    /// индекс по id. Зеркалит StampLibraryService по структуре и правилам.
    ///
    /// Папки:
    ///   StreamingAssets/MapGen/Locations/*.location.json   — контент разработчика
    ///   persistentDataPath/MapGen/Locations/*.location.json — пользовательский
    ///
    /// Пользовательские id обязаны начинаться с "user." и не могут перекрывать
    /// базовые id.
    /// </summary>
    public class LocationLibraryService : MonoBehaviour
    {
        public event Action LibraryChanged;

        private readonly List<LocationEntry> entries = new List<LocationEntry>();
        private readonly Dictionary<string, LocationEntry> byId =
            new Dictionary<string, LocationEntry>(StringComparer.OrdinalIgnoreCase);

        public IReadOnlyList<LocationEntry> Entries => entries;

        public class LocationEntry
        {
            public LocationDefData Data;
            public string FilePath;
            public bool IsUserContent;
            public bool IsValid;
            public List<string> Errors = new List<string>();
        }

        public static string UserLocationsDirectory =>
            Path.Combine(Application.persistentDataPath, "MapGen", "Locations");

        public static string CoreLocationsDirectory =>
            Path.Combine(Application.streamingAssetsPath, "MapGen", "Locations");

        private void Awake()
        {
            Reload();
        }

        public void Reload()
        {
            entries.Clear();
            byId.Clear();

            LoadDirectory(CoreLocationsDirectory, isUser: false);
            LoadDirectory(UserLocationsDirectory, isUser: true);

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

            foreach (string file in Directory
                         .GetFiles(directory, "*.location.json", SearchOption.TopDirectoryOnly)
                         .OrderBy(f => f))
            {
                LocationEntry entry = new LocationEntry { FilePath = file, IsUserContent = isUser };

                try
                {
                    entry.Data = JsonUtility.FromJson<LocationDefData>(File.ReadAllText(file));
                }
                catch (Exception e)
                {
                    entry.Errors.Add($"Не удалось прочитать JSON: {e.Message}");
                }

                if (entry.Data == null && entry.Errors.Count == 0)
                {
                    entry.Errors.Add("Пустой или нечитаемый файл.");
                }

                if (entry.Data != null)
                {
                    Validate(entry);
                }

                entry.IsValid = entry.Errors.Count == 0;
                entries.Add(entry);

                if (entry.IsValid)
                {
                    byId[entry.Data.id] = entry;
                }
                else
                {
                    Debug.LogWarning($"[LocationLibrary] '{Path.GetFileName(file)}' отклонён: " +
                                     string.Join("; ", entry.Errors));
                }
            }
        }

        public LocationDefData FindById(string id)
        {
            return !string.IsNullOrWhiteSpace(id) && byId.TryGetValue(id, out LocationEntry e) ? e.Data : null;
        }

        // ------------------------------------------------------------------
        // Валидация (уровни 1–2: схема + базовая семантика).
        // ------------------------------------------------------------------

        private void Validate(LocationEntry entry)
        {
            LocationDefData d = entry.Data;

            if (string.IsNullOrWhiteSpace(d.id))
            {
                entry.Errors.Add("Не задан id.");
            }
            else
            {
                foreach (char c in d.id)
                {
                    bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '.';
                    if (!ok)
                    {
                        entry.Errors.Add($"id '{d.id}': недопустимый символ '{c}' (разрешено a-z 0-9 _ .).");
                        break;
                    }
                }

                if (entry.IsUserContent && !d.id.StartsWith("user.", StringComparison.Ordinal))
                {
                    entry.Errors.Add($"Пользовательская локация '{d.id}' должна начинаться с 'user.'.");
                }

                if (!entry.IsUserContent && d.id.StartsWith("user.", StringComparison.Ordinal))
                {
                    entry.Errors.Add($"Базовая локация '{d.id}' не должна иметь префикс 'user.'.");
                }
            }

            if (d.minW <= 0 || d.minL <= 0)
            {
                entry.Errors.Add("minW/minL должны быть > 0.");
            }
            if (d.maxW < d.minW || d.maxL < d.minL)
            {
                entry.Errors.Add("maxW/maxL не могут быть меньше minW/minL.");
            }

            if (d.slots == null)
            {
                return;
            }

            HashSet<string> slotIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (LocationSlotData s in d.slots)
            {
                if (s == null)
                {
                    continue;
                }
                if (string.IsNullOrWhiteSpace(s.id))
                {
                    entry.Errors.Add("Слот без id.");
                }
                else if (!slotIds.Add(s.id))
                {
                    entry.Errors.Add($"Дублирующийся id слота '{s.id}'.");
                }

                if (s.filterTags == null || s.filterTags.Count == 0)
                {
                    entry.Errors.Add($"Слот '{s.id}': пустой filterTags.");
                }
                if (s.countMin > s.countMax)
                {
                    entry.Errors.Add($"Слот '{s.id}': countMin > countMax.");
                }
                if (s.countMin < 0)
                {
                    entry.Errors.Add($"Слот '{s.id}': countMin < 0.");
                }
            }
        }
    }
}
