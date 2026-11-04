using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    /// <summary>
    /// Формат штампа (*.stamp.json). См. design/data-format-spec.md, раздел 1.
    /// Сериализуется через JsonUtility, поэтому только [Serializable]-поля,
    /// без словарей и свойств.
    /// Сокеты и clearance присутствуют в формате с самого начала (MVP-0 их
    /// не использует, но файлы, созданные сейчас, не потребуют миграции).
    /// </summary>
    [Serializable]
    public class StampData
    {
        public int formatVersion = 1;
        public int contentVersion = 1;

        public string id;
        public string name;
        public string author;
        public List<string> tags = new List<string>();

        // Размер в клетках ОСНОВНОЙ сетки (Furniture-cellSize).
        public int footprintW = 1;
        public int footprintL = 1;
        public int floorSpan = 1;

        // Wall | Corner | Center | NearDoor | NearWindow | Surface | Free
        public string anchor = "Free";
        public string anchorEdge = "";

        public float weight = 1f;

        public List<StampClearanceRect> clearance = new List<StampClearanceRect>();
        public StampContent content = new StampContent();
        public List<StampSocket> sockets = new List<StampSocket>();
    }

    [Serializable]
    public class StampContent
    {
        public List<StampPlacedObject> placedObjects = new List<StampPlacedObject>();
        public List<StampWall> walls = new List<StampWall>();
        public List<StampPath> pathStrokes = new List<StampPath>();
    }

    [Serializable]
    public class StampPlacedObject
    {
        public string definitionId;
        public bool useGridPlacement = true;

        // Для grid-объектов: origin-клетка В КЛЕТКАХ СЛОЯ ОБЪЕКТА
        // (декор имеет свой cellSize), относительно юго-западного угла штампа.
        public int cellX;
        public int cellY;

        public int rotationSteps;
        public float rotationY;

        // Высота относительно gridOrigin.y на момент захвата
        // (объекты на столах сохраняют свою высоту).
        public float baseY;

        // Для free-объектов: мировая позиция относительно угла штампа.
        public SerializableVector3 localPosition;
    }

    [Serializable]
    public class StampWall
    {
        // Координаты ребра в клетках основной сетки, относительно угла штампа.
        public int x;
        public int y;
        public int orientation; // (int)WallOrientation
        public string wallDefinitionId;
        public string openingDefinitionId;
    }

    [Serializable]
    public class StampPath
    {
        public string definitionId;
        public float width;
        public List<SerializableVector3> localPoints = new List<SerializableVector3>();
    }

    [Serializable]
    public class StampClearanceRect
    {
        // В клетках основной сетки, относительно угла штампа.
        // Может выходить за footprint (полоса перед дверцей).
        public int x;
        public int y;
        public int w = 1;
        public int l = 1;
    }

    [Serializable]
    public class StampSocket
    {
        public string id;
        public string kind = "Area"; // Area | Surface (Point — зарезервировано)
        public StampClearanceRect area = new StampClearanceRect(); // легаси/фоллбек
        /// <summary>Закрашенные клетки сокета (локальные координаты штампа).</summary>
        public List<StampClearanceRect> cells = new List<StampClearanceRect>();
        public int hostObjectIndex = -1; // легаси; Surface теперь ищет предмет по клетке
        public List<string> filterTags = new List<string>();
        public bool required;
        public int countMin;
        public int countMax = 1;
        public float probability = 1f;
    }
}
