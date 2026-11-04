using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    /// <summary>
    /// Шаблон генерации (*.template.json). Сериализуется JsonUtility.
    /// Игроки создают свои шаблоны через TemplateEditorUi без кода.
    /// </summary>
    [Serializable]
    public class GenTemplate
    {
        public int formatVersion = 1;
        public string id = "";
        public string name = "";
        public string author = "";

        /// <summary>Наземных этажей (1..4).</summary>
        public int floors = 2;
        /// <summary>Подвал с залом суда и лифтом.</summary>
        public bool basementCourtroom = true;

        /// <summary>Стиль коридора: spine (пока единственный; loop/cross — позже).</summary>
        public string corridorStyle = "spine";
        public int corridorWidth = 2;
        /// <summary>Глубина комнатных полос по обе стороны коридора (клеток).</summary>
        public int roomDepthMin = 5;
        public int roomDepthMax = 7;

        public List<GenLocationSpec> locations = new List<GenLocationSpec>();

        /// <summary>Встроенный шаблон-образец «Особняк» (и фоллбек).</summary>
        public static GenTemplate CreateDefault(int personalRoomCount)
        {
            GenTemplate t = new GenTemplate
            {
                id = "core.template.mansion",
                name = "Особняк (встроенный)",
                author = "core",
            };

            t.locations.Add(new GenLocationSpec
            {
                id = "courtroom",
                displayName = "Зал суда",
                widthMin = 8, widthMax = 10,
                count = 1,
                required = true,
                floorPlacement = "ground",
            });

            t.locations.Add(new GenLocationSpec
            {
                id = "kitchen",
                displayName = "Кухня",
                widthMin = 5, widthMax = 7,
                count = 1,
                required = true,
                floorPlacement = "ground",
                requiredStampTagSets = new List<TagSet> { new TagSet("fridge"), new TagSet("stove"), new TagSet("sink") },
            });

            t.locations.Add(new GenLocationSpec
            {
                id = "dining",
                displayName = "Столовая",
                widthMin = 5, widthMax = 7,
                count = 1,
                required = true,
                floorPlacement = "ground",
                adjacentTo = "kitchen",
                requiredStampTagSets = new List<TagSet> { new TagSet("dining_set") },
            });

            t.locations.Add(new GenLocationSpec
            {
                id = "personal_room",
                displayName = "Личная комната",
                widthMin = 4, widthMax = 5,
                count = personalRoomCount,
                countPerPlayer = true,
                required = true,
                floorPlacement = "any",
                groupKey = "dorm_wing",
                requiredStampTagSets = new List<TagSet> { new TagSet("bed") },
            });

            t.locations.Add(new GenLocationSpec
            {
                id = "storage",
                displayName = "Кладовая",
                widthMin = 2, widthMax = 3,
                count = 2,
                required = false,
                floorPlacement = "any",
            });

            return t;
        }
    }

    [Serializable]
    public class GenLocationSpec
    {
        public string id = "";
        public string displayName = "";
        public int widthMin = 4;
        public int widthMax = 6;

        /// <summary>Если countPerPlayer — count игнорируется, берётся число игроков.</summary>
        public int count = 1;
        public bool countPerPlayer;

        public bool required = true;

        /// <summary>ground | upper | any — на каких этажах размещать.</summary>
        public string floorPlacement = "any";

        /// <summary>«Крыло»: локации с одинаковым groupKey встают подряд, стена к стене.</summary>
        public string groupKey = "";

        /// <summary>Id локации, рядом с которой эта обязана стоять (кухня ↔ столовая).</summary>
        public string adjacentTo = "";

        /// <summary>
        /// Каждый TagSet — один обязательный предмет: «штамп со ВСЕМИ этими
        /// тегами». Несколько TagSet = несколько обязательных предметов.
        /// </summary>
        public List<TagSet> requiredStampTagSets = new List<TagSet>();

        public GenLocationSpec Clone(int newCount)
        {
            return new GenLocationSpec
            {
                id = id,
                displayName = displayName,
                widthMin = widthMin,
                widthMax = widthMax,
                count = newCount,
                countPerPlayer = false,
                required = required,
                floorPlacement = floorPlacement,
                groupKey = groupKey,
                adjacentTo = adjacentTo,
                requiredStampTagSets = requiredStampTagSets, // только чтение — можно шарить
            };
        }
    }

    [Serializable]
    public class TagSet
    {
        public List<string> tags = new List<string>();

        public TagSet() { }
        public TagSet(params string[] values) { tags.AddRange(values); }

        public override string ToString() => string.Join("+", tags);
    }
}
