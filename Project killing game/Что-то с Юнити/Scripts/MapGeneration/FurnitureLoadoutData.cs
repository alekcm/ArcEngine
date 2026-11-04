using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    /// <summary>
    /// Лодаут мебели персонажа (*.loadout.json, часть профиля).
    /// См. data-format-spec.md, раздел 4.
    ///
    /// Игрок для каждой категории слота (bed/storage/personal) выбирает свои
    /// штампы из пула с тегом loadout:&lt;категория&gt;. При генерации личной
    /// комнаты владельца штамп берётся отсюда (приоритетнее тегов слота).
    ///
    /// JsonUtility не умеет произвольные словари, поэтому choices хранится
    /// плоским списком категорий (LoadoutChoiceData), а не Dictionary.
    /// Это так же удобно редактировать руками.
    /// </summary>
    [Serializable]
    public class FurnitureLoadoutData
    {
        public int formatVersion = 1;
        public int contentVersion = 1;

        public string characterId;

        // Любимый цвет персонажа (для будущего colorway-резолва личной комнаты).
        // Пример: "color:red". Пока только хранится.
        public string signatureColor = "";

        public List<LoadoutChoiceData> choices = new List<LoadoutChoiceData>();

        /// <summary>Список выбранных штамп-id для категории (в порядке приоритета).</summary>
        public IReadOnlyList<string> GetChoice(string category)
        {
            if (choices == null || string.IsNullOrWhiteSpace(category))
            {
                return null;
            }

            foreach (LoadoutChoiceData c in choices)
            {
                if (c != null && string.Equals(c.category, category, StringComparison.OrdinalIgnoreCase))
                {
                    return c.stampIds;
                }
            }

            return null;
        }
    }

    [Serializable]
    public class LoadoutChoiceData
    {
        // Категория слота: "bed" | "storage" | "personal" | ...
        public string category;

        // Один или несколько штамп-id. Для bed/storage обычно один,
        // для personal — несколько (личные вещи абсолюта).
        public List<string> stampIds = new List<string>();
    }
}
