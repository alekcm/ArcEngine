using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Библиотека шаблонов генерации (*.template.json), по образу
    /// StampLibraryService: StreamingAssets/MapGen/Templates (core, read-only)
    /// + persistentDataPath/MapGen/Templates (пользовательские).
    ///
    /// Системный минимум не навязывается: автор шаблона может осознанно
    /// убрать зал суда или личные комнаты; библиотека лишь помечает это
    /// в Notes.
    /// </summary>
    public class TemplateLibraryService : MonoBehaviour
    {
        private readonly List<TemplateEntry> entries = new List<TemplateEntry>();

        public event Action LibraryChanged;

        public IReadOnlyList<TemplateEntry> Entries => entries;

        public class TemplateEntry
        {
            public GenTemplate Data;
            public string FilePath;
            public bool IsUserContent;
            public bool IsValid;
            public List<string> Errors = new List<string>();
            public List<string> Notes = new List<string>(); // авто-исправления
        }

        public static string UserTemplatesDirectory =>
            Path.Combine(Application.persistentDataPath, "MapGen", "Templates");

        public static string CoreTemplatesDirectory =>
            Path.Combine(Application.streamingAssetsPath, "MapGen", "Templates");

        private void Awake()
        {
            Reload();
        }

        public void Reload()
        {
            entries.Clear();
            LoadDirectory(CoreTemplatesDirectory, isUser: false);
            LoadDirectory(UserTemplatesDirectory, isUser: true);

            // Встроенный шаблон всегда в списке (даже при пустых папках).
            if (!entries.Any(e => e.IsValid && e.Data.id == "core.template.mansion"))
            {
                entries.Insert(0, new TemplateEntry
                {
                    Data = GenTemplate.CreateDefault(4),
                    IsValid = true,
                    IsUserContent = false,
                });
            }

            LibraryChanged?.Invoke();
        }

        private void LoadDirectory(string directory, bool isUser)
        {
            if (!Directory.Exists(directory))
            {
                if (isUser) Directory.CreateDirectory(directory);
                return;
            }

            foreach (string file in Directory.GetFiles(directory, "*.template.json", SearchOption.TopDirectoryOnly).OrderBy(f => f))
            {
                TemplateEntry entry = new TemplateEntry { FilePath = file, IsUserContent = isUser };

                try
                {
                    entry.Data = JsonUtility.FromJson<GenTemplate>(File.ReadAllText(file));
                }
                catch (Exception e)
                {
                    entry.Errors.Add($"JSON не читается: {e.Message}");
                }

                if (entry.Data != null) Validate(entry);
                else if (entry.Errors.Count == 0) entry.Errors.Add("Пустой файл.");

                entry.IsValid = entry.Errors.Count == 0;
                entries.Add(entry);

                if (!entry.IsValid)
                {
                    Debug.LogWarning($"[TemplateLibrary] '{Path.GetFileName(file)}' отклонён: {string.Join("; ", entry.Errors)}");
                }
            }
        }

        public bool TrySaveUserTemplate(GenTemplate data, out string error)
        {
            error = null;
            if (data == null) { error = "Нет данных."; return false; }

            if (string.IsNullOrWhiteSpace(data.id))
            {
                data.id = "user.template." + Guid.NewGuid().ToString("N").Substring(0, 8);
            }
            if (!data.id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
            {
                error = "Пользовательский id должен начинаться с 'user.'";
                return false;
            }

            TemplateEntry probe = new TemplateEntry { Data = data, IsUserContent = true };
            Validate(probe);
            if (probe.Errors.Count > 0)
            {
                error = string.Join("; ", probe.Errors);
                return false;
            }

            Directory.CreateDirectory(UserTemplatesDirectory);
            string path = Path.Combine(UserTemplatesDirectory, data.id.Replace('.', '_') + ".template.json");
            File.WriteAllText(path, JsonUtility.ToJson(data, prettyPrint: true));
            Debug.Log($"[TemplateLibrary] Шаблон сохранён: {path}");

            Reload();
            return true;
        }

        public bool DeleteUserTemplate(string id)
        {
            TemplateEntry entry = entries.FirstOrDefault(e =>
                e.IsUserContent && e.Data != null && e.Data.id == id && !string.IsNullOrEmpty(e.FilePath));
            if (entry == null) return false;
            File.Delete(entry.FilePath);
            Reload();
            return true;
        }

        // ------------------------------------------------------------------
        // Валидация + защита системного минимума
        // ------------------------------------------------------------------

        private void Validate(TemplateEntry entry)
        {
            GenTemplate t = entry.Data;

            if (string.IsNullOrWhiteSpace(t.name)) entry.Errors.Add("Пустое имя шаблона.");
            if (t.floors < 1 || t.floors > 4) entry.Errors.Add("floors должен быть 1..4.");
            if (t.corridorWidth < 1 || t.corridorWidth > 4) entry.Errors.Add("corridorWidth должен быть 1..4.");
            if (t.roomDepthMin < 2 || t.roomDepthMax < t.roomDepthMin)
                entry.Errors.Add("Некорректная глубина комнат (min ≥ 2, max ≥ min).");

            foreach (GenLocationSpec spec in t.locations)
            {
                if (string.IsNullOrWhiteSpace(spec.id)) entry.Errors.Add("Локация без id.");
                if (spec.widthMin < 1 || spec.widthMax < spec.widthMin)
                    entry.Errors.Add($"«{spec.displayName}»: некорректная ширина.");
                if (!spec.countPerPlayer && spec.count < 0)
                    entry.Errors.Add($"«{spec.displayName}»: count < 0.");
            }

            // Системный минимум НЕ навязывается: автор шаблона волен убрать
            // зал суда или личные комнаты — это осознанное решение.
            // Мягкая пометка в Notes, чтобы было видно в списке.
            bool hasCourtroom = t.basementCourtroom || t.locations.Any(l => l.id == "courtroom" && l.required);
            if (!hasCourtroom) entry.Notes.Add("без зала суда");
            if (!t.locations.Any(l => l.id == "personal_room" && l.required)) entry.Notes.Add("без личных комнат");
        }
    }
}
