using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Единая точка запроса высоты земли (MVP-3.5). См. map-generator-design.md §7.
    ///
    /// Весь код (генератор, размещение объектов, дорожки) спрашивает высоту
    /// ТОЛЬКО через этот интерфейс. Это локализует всю боль рельефа в одном
    /// месте: сейчас FlatGround (плоскость), затем TerracedGround (дискретные
    /// уровни), потом, если захочется гор, HeightmapGround — без правок
    /// генератора/штампов/сохранений.
    ///
    /// Контракт:
    ///  - GetLevel(x,z) — целочисленный уровень террасы в КЛЕТКЕ (x,z);
    ///  - GetHeight(x,z) — мировая высота земли в этой клетке
    ///    (level * levelHeight). Под зданиями уровень принудительно 0.
    /// </summary>
    public interface IGroundHeightProvider
    {
        int GetLevel(int x, int z);
        float GetHeight(int x, int z);
        float LevelHeight { get; }
    }

    /// <summary>Плоская земля: всегда уровень 0, высота 0. Поведение MVP-2/3.</summary>
    public sealed class FlatGround : IGroundHeightProvider
    {
        public static readonly FlatGround Instance = new FlatGround();
        public int GetLevel(int x, int z) => 0;
        public float GetHeight(int x, int z) => 0f;
        public float LevelHeight => 0f;
    }

    /// <summary>
    /// Дискретные террасы: набор прямоугольных зон с целым elevationLevel.
    /// Высота = level * levelHeight. Зоны зданий принудительно держат level 0
    /// (как в The Sims — под фундаментом рельеф выровнен), для этого они
    /// добавляются как зоны уровня 0 с высоким приоритетом.
    ///
    /// Поиск уровня: по последней подходящей зоне с наивысшим приоритетом
    /// (зоны зданий перекрывают террасы сада). Вне всех зон — defaultLevel.
    /// </summary>
    public sealed class TerracedGround : IGroundHeightProvider
    {
        public struct Zone
        {
            public RectInt Rect;
            public int Level;
            public int Priority; // выше = важнее (здания > террасы)

            public Zone(RectInt rect, int level, int priority = 0)
            {
                Rect = rect;
                Level = level;
                Priority = priority;
            }
        }

        private readonly List<Zone> zones = new List<Zone>();
        private readonly int defaultLevel;
        private readonly float levelHeight;

        public float LevelHeight => levelHeight;

        public TerracedGround(float levelHeight = 1.0f, int defaultLevel = 0)
        {
            this.levelHeight = Mathf.Max(0f, levelHeight);
            this.defaultLevel = defaultLevel;
        }

        /// <summary>Добавить террасную зону (level из шаблона).</summary>
        public void AddZone(RectInt rect, int level, int priority = 0)
        {
            zones.Add(new Zone(rect, level, priority));
        }

        /// <summary>Зафиксировать зону здания на уровне 0 (высокий приоритет).</summary>
        public void AddBuildingFlatZone(RectInt rect)
        {
            zones.Add(new Zone(rect, 0, priority: 1000));
        }

        public int GetLevel(int x, int z)
        {
            bool found = false;
            int bestLevel = defaultLevel;
            int bestPriority = int.MinValue;

            for (int i = 0; i < zones.Count; i++)
            {
                Zone zone = zones[i];
                if (!Contains(zone.Rect, x, z)) continue;
                if (zone.Priority >= bestPriority)
                {
                    bestPriority = zone.Priority;
                    bestLevel = zone.Level;
                    found = true;
                }
            }

            return found ? bestLevel : defaultLevel;
        }

        public float GetHeight(int x, int z)
        {
            return GetLevel(x, z) * levelHeight;
        }

        private static bool Contains(RectInt r, int x, int z)
        {
            return x >= r.xMin && x < r.xMax && z >= r.yMin && z < r.yMax;
        }
    }
}
