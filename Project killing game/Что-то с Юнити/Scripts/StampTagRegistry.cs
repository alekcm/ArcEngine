using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Реестр известных тегов: встроенный словарь с описаниями +
    /// пользовательские теги (persistentDataPath/MapGen/user_tags.json).
    /// Игрок выбирает теги из списка; произвольный тег можно добавить —
    /// он сохранится и появится в списке у этого игрока навсегда.
    /// </summary>
    public static class StampTagRegistry
    {
        public class TagInfo
        {
            public string Tag;
            public string Description;
            public bool IsUser;

            public TagInfo(string tag, string description, bool isUser = false)
            {
                Tag = tag;
                Description = description;
                IsUser = isUser;
            }
        }

        [Serializable]
        private class UserTagsFile
        {
            public List<string> tags = new List<string>();
        }

        private static List<TagInfo> known;

        private static string UserTagsPath =>
            Path.Combine(Application.persistentDataPath, "MapGen", "user_tags.json");

        public static IReadOnlyList<TagInfo> Known
        {
            get
            {
                EnsureLoaded();
                return known;
            }
        }

        private static void EnsureLoaded()
        {
            if (known != null) return;

            known = new List<TagInfo>
            {
                // --- Предметные категории ---
                new TagInfo("bed", "Кровать"),
                new TagInfo("table", "Стол"),
                new TagInfo("chair", "Стул/кресло"),
                new TagInfo("sofa", "Диван"),
                new TagInfo("wardrobe", "Шкаф для одежды"),
                new TagInfo("shelf", "Полка/стеллаж"),
                new TagInfo("fridge", "Холодильник"),
                new TagInfo("stove", "Плита"),
                new TagInfo("sink", "Раковина"),
                new TagInfo("bathroom_unit", "Санузел (блок)"),
                new TagInfo("lamp", "Светильник"),
                new TagInfo("plant", "Растение"),
                new TagInfo("dining_set", "Обеденная группа (стол+стулья)"),

                // --- Принадлежность к типу комнаты ---
                new TagInfo("cat:kitchen", "Для кухни"),
                new TagInfo("cat:bedroom", "Для спальни/личной комнаты"),
                new TagInfo("cat:bathroom", "Для ванной"),
                new TagInfo("cat:dining", "Для столовой"),
                new TagInfo("cat:courtroom", "Для зала суда"),
                new TagInfo("cat:outdoor", "Для улицы/двора"),
                new TagInfo("cat:decor", "Декор (мелочь для скаттера)"),
                new TagInfo("cat:generic", "Подходит куда угодно"),

                // --- Размер (для пулов декора) ---
                new TagInfo("size:small", "Мелкий предмет (на стол/полку)"),
                new TagInfo("size:large", "Крупный предмет"),

                // --- Лодаут персонажа ---
                new TagInfo("loadout:bed", "Выбор кровати в профиле персонажа"),
                new TagInfo("loadout:storage", "Выбор шкафа в профиле персонажа"),
                new TagInfo("loadout:personal", "Личная вещь персонажа (вещь абсолюта)"),

                // --- Системные (использует генератор) ---
                new TagInfo("sys:courtroom_stand", "Стойка игрока в зале суда"),
                new TagInfo("sys:stair_shaft", "Лестница между этажами"),
                new TagInfo("sys:elevator", "Лифт (в т.ч. в зал суда)"),
                new TagInfo("sys:name_plate", "Табличка с именем владельца"),
            };

            // Пользовательские теги
            try
            {
                if (File.Exists(UserTagsPath))
                {
                    UserTagsFile file = JsonUtility.FromJson<UserTagsFile>(File.ReadAllText(UserTagsPath));
                    if (file?.tags != null)
                    {
                        foreach (string tag in file.tags)
                        {
                            if (!Contains(tag))
                            {
                                known.Add(new TagInfo(tag, "Пользовательский тег", isUser: true));
                            }
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[StampTagRegistry] Не удалось прочитать user_tags.json: {e.Message}");
            }
        }

        public static bool Contains(string tag)
        {
            EnsureLoaded();
            foreach (TagInfo info in known)
            {
                if (string.Equals(info.Tag, tag, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        /// <summary>
        /// Добавляет произвольный тег игрока: нормализует, валидирует,
        /// сохраняет в user_tags.json. normalized — итоговое имя тега.
        /// </summary>
        public static bool TryAddUserTag(string rawTag, out string normalized, out string error)
        {
            EnsureLoaded();
            error = null;
            normalized = (rawTag ?? "").Trim().ToLowerInvariant().Replace(' ', '_');

            if (string.IsNullOrEmpty(normalized))
            {
                error = "Пустой тег.";
                return false;
            }

            foreach (char c in normalized)
            {
                bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == ':';
                if (!ok)
                {
                    error = $"Недопустимый символ '{c}'. Разрешены: a-z, 0-9, '_', ':' (без кириллицы).";
                    return false;
                }
            }

            if (normalized.StartsWith("sys:", StringComparison.Ordinal))
            {
                error = "Префикс 'sys:' зарезервирован за системными тегами.";
                return false;
            }

            if (Contains(normalized))
            {
                return true; // уже есть — просто используем
            }

            known.Add(new TagInfo(normalized, "Пользовательский тег", isUser: true));

            try
            {
                UserTagsFile file = new UserTagsFile();
                foreach (TagInfo info in known)
                {
                    if (info.IsUser) file.tags.Add(info.Tag);
                }
                Directory.CreateDirectory(Path.GetDirectoryName(UserTagsPath));
                File.WriteAllText(UserTagsPath, JsonUtility.ToJson(file, prettyPrint: true));
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[StampTagRegistry] Не удалось сохранить user_tags.json: {e.Message}");
            }

            return true;
        }
    }
}
