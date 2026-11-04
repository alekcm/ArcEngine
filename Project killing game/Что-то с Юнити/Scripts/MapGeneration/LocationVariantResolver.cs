using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Выбор конкретной LocationDefData для локационного требования шаблона.
    ///
    /// Политики (TemplateLocationRequirementData.variantPolicy):
    ///   "byId"     — строго locationId (один конкретный медпункт);
    ///   "first"    — первый доступный из variantIds (детерминированно);
    ///   "random"   — равновероятный случайный из variantIds;
    ///   "weighted" — взвешенный по weight локаций (дефолт при заданном variantIds);
    ///   "" (auto)  — locationId задан и variantIds пуст → byId; иначе weighted.
    ///
    /// ВАЖНО: резолвер НИКОГДА не ищет по тегу всю библиотеку — состав
    /// кандидатов всегда явно перечислен в шаблоне (variantIds). Иначе новая
    /// локация с тем же тегом (медпункт-каяк с карты круиза) начала бы
    /// спавниться в особняке без ведома автора шаблона.
    ///
    /// Вся случайность — через переданный rng генератора: при одном seed
    /// выбор варианта воспроизводим.
    /// </summary>
    public static class LocationVariantResolver
    {
        public const string PolicyAuto = "";
        public const string PolicyById = "byId";
        public const string PolicyFirst = "first";
        public const string PolicyRandom = "random";
        public const string PolicyWeighted = "weighted";

        /// <summary>Нормализовать строку политики (неизвестные значения → auto).</summary>
        public static string NormalizePolicy(string policy)
        {
            switch ((policy ?? "").Trim().ToLowerInvariant())
            {
                case PolicyById: return PolicyById;
                case PolicyFirst: return PolicyFirst;
                case PolicyRandom: return PolicyRandom;
                case PolicyWeighted: return PolicyWeighted;
                default: return PolicyAuto;
            }
        }

        /// <summary>
        /// Выбрать локацию по требованию. Возвращает null, если ни один
        /// кандидат не найден в библиотеке (вызывающий решает про fallback).
        /// </summary>
        public static LocationDefData Resolve(
            TemplateLocationRequirementData rule,
            LocationLibraryService library,
            System.Random rng)
        {
            if (rule == null || library == null)
            {
                return null;
            }

            string policy = NormalizePolicy(rule.variantPolicy);

            // auto: явный locationId без списка вариантов → строгая привязка.
            if (policy == PolicyAuto)
            {
                bool hasVariants = rule.variantIds != null && rule.variantIds.Count > 0;
                policy = !string.IsNullOrWhiteSpace(rule.locationId) && !hasVariants
                    ? PolicyById
                    : PolicyWeighted;
            }

            switch (policy)
            {
                case PolicyById:
                {
                    LocationDefData byId = library.FindById(rule.locationId);
                    // Отказоустойчивость: byId без locationId (или с битым id),
                    // но с явным списком variantIds → детерминированно берём
                    // первый вариант, а не «ничего». Типичная ошибка контента —
                    // лучше предсказуемый результат, чем пустая комната.
                    if (byId == null)
                    {
                        List<LocationDefData> fallback = ResolveCandidates(rule.variantIds, library);
                        byId = fallback.Count > 0 ? fallback[0] : null;
                    }
                    return byId;
                }

                case PolicyFirst:
                {
                    List<LocationDefData> candidates = ResolveCandidates(rule.variantIds, library);
                    return candidates.Count > 0 ? candidates[0] : null;
                }

                case PolicyRandom:
                {
                    List<LocationDefData> candidates = ResolveCandidates(rule.variantIds, library);
                    if (candidates.Count == 0)
                    {
                        return null;
                    }
                    System.Random random = rng ?? new System.Random();
                    return candidates[random.Next(candidates.Count)];
                }

                case PolicyWeighted:
                default:
                {
                    List<LocationDefData> candidates = ResolveCandidates(rule.variantIds, library);
                    if (candidates.Count == 0)
                    {
                        return null;
                    }
                    if (candidates.Count == 1)
                    {
                        return candidates[0];
                    }

                    System.Random random = rng ?? new System.Random();
                    float total = 0f;
                    for (int i = 0; i < candidates.Count; i++)
                    {
                        total += Mathf.Max(0.0001f, candidates[i].weight);
                    }

                    double roll = random.NextDouble() * total;
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
            }
        }

        /// <summary>Резолв variantIds в объекты локаций (порядок списка, дубликаты отбрасываются).</summary>
        private static List<LocationDefData> ResolveCandidates(List<string> variantIds, LocationLibraryService library)
        {
            List<LocationDefData> result = new List<LocationDefData>();
            if (variantIds == null)
            {
                return result;
            }

            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string id in variantIds)
            {
                if (string.IsNullOrWhiteSpace(id) || !seen.Add(id))
                {
                    continue;
                }

                LocationDefData def = library.FindById(id);
                if (def != null)
                {
                    result.Add(def);
                }
            }

            return result;
        }
    }
}
