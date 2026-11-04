using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    /// <summary>
    /// Формат локации (*.location.json). См. data-format-spec.md, раздел 2.
    ///
    /// Локация — это логическая комната/зона (Кухня, Личная комната, Зал суда),
    /// которая наполняется НЕ конкретной мебелью, а СЛОТАМИ. Слот — это запрос
    /// «поставь сюда штамп с такими тегами» + правило размещения (anchor).
    ///
    /// Сериализуется через JsonUtility → только [Serializable]-поля, без
    /// словарей/свойств (как StampData). Поля count хранятся плоско
    /// (countMin/countMax) — JsonUtility не умеет вложенные {min,max} без
    /// отдельного типа, а плоско проще валидировать.
    /// </summary>
    [Serializable]
    public class LocationDefData
    {
        public int formatVersion = 1;
        public int contentVersion = 1;

        public string id;
        public string name;
        public List<string> tags = new List<string>();

        // Размер комнаты в клетках (грубая подсказка генератору/валидатору).
        public int minW = 4;
        public int minL = 4;
        public int maxW = 16;
        public int maxL = 16;

        // Размещение.
        public bool indoor = true;
        // "any" | "0" | "1" | "basement" | "top" | список через запятую "0,1"
        public string floors = "any";
        public string groupKey = "";

        // Палитра комнаты (null/пусто = палитра шаблона). Пока только хранится.
        public string wallStyle = "";
        public string floorMaterial = "";

        /// <summary>Вес локации при weighted-выборе варианта (LocationVariantResolver). По умолчанию 1.</summary>
        public float weight = 1f;

        public List<LocationSlotData> slots = new List<LocationSlotData>();
        public LocationDecorData decor = new LocationDecorData();
    }

    [Serializable]
    public class LocationSlotData
    {
        public string id;
        public List<string> filterTags = new List<string>();
        public bool required;
        public int countMin = 1;
        public int countMax = 1;

        // Wall | Corner | Center | NearDoor | NearWindow | Surface | Free.
        // Пусто = взять anchor из самого штампа (как сохранил автор штампа).
        public string anchor = "";

        // Категория лодаута владельца (bed/storage/personal). Пусто = не из лодаута.
        public string loadoutCategory = "";

        // Вероятность каждой optional-вставки (для required игнорируется).
        public float probability = 1f;

        /// <summary>Непусто → всегда ставить конкретный штамп (в обход тегов/лодаута). Из оверрайда forceStampId.</summary>
        public string forceStampId = "";
    }

    [Serializable]
    public class LocationDecorData
    {
        public float density;
        public List<string> filterTags = new List<string>();
    }
}
