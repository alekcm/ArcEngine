using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Раскрывает clusterRef в шаблоне карты (MVP «переиспользуемые блоки»):
    ///
    ///   { "ruleId": "med_wing", "clusterRef": "core.cluster.med_block",
    ///     "floor": 1, "restrictFloor": true, "overrides": [ ... ] }
    ///
    /// превращается в полноценное поддерево TemplateClusterRequirementData:
    /// дети/локации/коннекторы берутся из фрагмента, параметры вызова
    /// (floor/placement/bounds/minCount) — из записи вызова, затем применяются
    /// оверрайды точки вызова, а id внутри поддерева префиксуются
    /// ("med_wing/med_block_root/storage"), чтобы два вызова одного блока
    /// в одном шаблоне не конфликтовали.
    ///
    /// Работает только с данными (копии через JsonUtility) — исходные данные
    /// библиотеки фрагментов и файлы на диске не меняются.
    ///
    /// Порядок применения при вложенных ref: внутренний фрагмент раскрывается
    /// и получает свои оверрайды первым, внешняя точка вызова — последней,
    /// поэтому оверрайды снаружи ПЕРЕКРЫВАЮТ внутренние (добавляются позже
    /// в список overrides и выигрывают при конфликте replace-подобных полей).
    /// </summary>
    public static class TemplateRefExpander
    {
        private const int MaxDepth = 16;

        /// <summary>Есть ли в шаблоне хотя бы один clusterRef (быстрая проверка без раскрытия).</summary>
        public static bool ContainsClusterRefs(MapGenerationTemplateData template)
        {
            if (template?.requiredClusters == null)
            {
                return false;
            }

            var stack = new Stack<TemplateClusterRequirementData>(template.requiredClusters);
            while (stack.Count > 0)
            {
                TemplateClusterRequirementData r = stack.Pop();
                if (r == null)
                {
                    continue;
                }
                if (!string.IsNullOrWhiteSpace(r.clusterRef))
                {
                    return true;
                }
                if (r.requiredClusters != null)
                {
                    for (int i = 0; i < r.requiredClusters.Count; i++)
                    {
                        stack.Push(r.requiredClusters[i]);
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// Раскрыть все clusterRef шаблона. Возвращает НОВЫЙ шаблон
        /// (source не мутируется). errors собирает человекочитаемые проблемы
        /// (нет фрагмента, цикл, глубина, оверрайд без цели) — раскрытие
        /// продолжается максимально, проблемные куски остаются как есть.
        /// </summary>
        public static MapGenerationTemplateData Expand(
            MapGenerationTemplateData source,
            ClusterFragmentLibraryService fragments,
            List<string> errors)
        {
            if (source == null)
            {
                return null;
            }

            errors = errors ?? new List<string>();
            MapGenerationTemplateData result = Clone(source);
            if (result?.requiredClusters == null)
            {
                return result;
            }

            var chain = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < result.requiredClusters.Count; i++)
            {
                result.requiredClusters[i] = ExpandRule(result.requiredClusters[i], fragments, errors, chain, 0);
            }

            return result;
        }

        // ------------------------------------------------------------------

        private static TemplateClusterRequirementData ExpandRule(
            TemplateClusterRequirementData rule,
            ClusterFragmentLibraryService fragments,
            List<string> errors,
            HashSet<string> refChain,
            int depth)
        {
            if (rule == null)
            {
                return null;
            }

            if (depth > MaxDepth)
            {
                errors.Add($"'{rule.ruleId}': превышена глубина вложенности clusterRef ({MaxDepth}).");
                return rule;
            }

            bool fromRef = false;
            if (!string.IsNullOrWhiteSpace(rule.clusterRef))
            {
                if (fragments == null)
                {
                    errors.Add($"'{rule.ruleId}': clusterRef '{rule.clusterRef}', но библиотека фрагментов недоступна.");
                }
                else if (!refChain.Add(rule.clusterRef))
                {
                    errors.Add($"'{rule.ruleId}': цикл clusterRef — '{rule.clusterRef}' уже раскрывается выше по дереву.");
                }
                else
                {
                    try
                    {
                        TemplateClusterRequirementData fragment = fragments.FindById(rule.clusterRef);
                        if (fragment == null)
                        {
                            errors.Add($"'{rule.ruleId}': фрагмент '{rule.clusterRef}' не найден в ClusterFragmentLibraryService.");
                        }
                        else
                        {
                            rule = InlineFragment(rule, fragment);
                            fromRef = true;
                        }
                    }
                    finally
                    {
                        refChain.Remove(rule.clusterRef ?? string.Empty);
                    }
                }
            }

            // Оверрайды точки вызова применяются к уже слитому поддереву,
            // когда id ещё НЕ префиксованы (адреса = внутренние id фрагмента).
            if (rule.overrides != null && rule.overrides.Count > 0)
            {
                ApplyClusterOverrides(rule, errors);
            }

            if (rule.requiredClusters != null)
            {
                for (int i = 0; i < rule.requiredClusters.Count; i++)
                {
                    rule.requiredClusters[i] = ExpandRule(rule.requiredClusters[i], fragments, errors, refChain, depth + 1);
                }
            }

            // Префиксация id внутри поддерева — после раскрытия детей.
            // Уникальность инстансов блока: "med_wing/storage", "med_wing_east/storage".
            if (fromRef)
            {
                PrefixSubtreeIds(rule);
            }

            return rule;
        }

        /// <summary>
        /// Слить запись вызова и фрагмент: содержимое — из фрагмента,
        /// идентичность/параметры — из точки вызова. Собственные дети записи
        /// вызова (если есть) ДОБАВЛЯЮТСЯ к содержимому фрагмента.
        /// </summary>
        private static TemplateClusterRequirementData InlineFragment(
            TemplateClusterRequirementData callSite,
            TemplateClusterRequirementData fragment)
        {
            TemplateClusterRequirementData f = Clone(fragment);
            TemplateClusterRequirementData merged = Clone(callSite);

            merged.clusterId = FirstNonEmpty(callSite.clusterId, callSite.ruleId, f.clusterId);
            merged.clusterType = FirstNonEmpty(callSite.clusterType, f.clusterType);
            merged.displayName = FirstNonEmpty(callSite.displayName, f.displayName);
            if (string.IsNullOrWhiteSpace(merged.requiredTag))
            {
                merged.requiredTag = f.requiredTag;
            }

            merged.requiredLocations = ConcatCloned(f.requiredLocations, callSite.requiredLocations);
            merged.requiredClusters = ConcatCloned(f.requiredClusters, callSite.requiredClusters);
            merged.requiredConnectors = ConcatCloned(f.requiredConnectors, callSite.requiredConnectors);

            // floor/placement/bounds/minCount — уже взяты из callSite (merged = его копия).
            return merged;
        }

        /// <summary>
        /// Применить оверрайды записи вызова к локационным требованиям её поддерева.
        /// Адресация: targetRuleId ("*" = все) → targetTag → targetLocationId (первое непустое правило).
        /// Внешние оверрайды добавляются ПОСЛЕ внутренних → выигрывают при конфликте.
        /// </summary>
        private static void ApplyClusterOverrides(TemplateClusterRequirementData root, List<string> errors)
        {
            List<TemplateLocationRequirementData> allLocations = new List<TemplateLocationRequirementData>();
            CollectLocationRules(root, allLocations);

            foreach (TemplateClusterLocationOverrideData o in root.overrides)
            {
                if (o == null)
                {
                    continue;
                }

                List<TemplateLocationRequirementData> targets = FindOverrideTargets(o, allLocations);
                if (targets.Count == 0)
                {
                    errors.Add($"'{root.ruleId}': оверрайд не нашёл цели " +
                               $"(ruleId='{o.targetRuleId}', tag='{o.targetTag}', locationId='{o.targetLocationId}').");
                    continue;
                }

                foreach (TemplateLocationRequirementData target in targets)
                {
                    if (o.slotOverrides != null && o.slotOverrides.Count > 0)
                    {
                        target.overrides = target.overrides ?? new List<TemplateLocationOverrideData>();
                        foreach (TemplateLocationOverrideData so in o.slotOverrides)
                        {
                            target.overrides.Add(Clone(so));
                        }
                    }

                    if (o.setVariantIds != null && o.setVariantIds.Count > 0)
                    {
                        target.variantIds = new List<string>(o.setVariantIds);
                    }

                    if (o.addVariantIds != null)
                    {
                        target.variantIds = target.variantIds ?? new List<string>();
                        foreach (string id in o.addVariantIds)
                        {
                            if (!string.IsNullOrWhiteSpace(id) && !ContainsIgnoreCase(target.variantIds, id))
                            {
                                target.variantIds.Add(id);
                            }
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(o.variantPolicy))
                    {
                        target.variantPolicy = o.variantPolicy;
                    }
                }
            }
        }

        private static List<TemplateLocationRequirementData> FindOverrideTargets(
            TemplateClusterLocationOverrideData o,
            List<TemplateLocationRequirementData> allLocations)
        {
            List<TemplateLocationRequirementData> targets = new List<TemplateLocationRequirementData>();

            foreach (TemplateLocationRequirementData rule in allLocations)
            {
                if (rule == null)
                {
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(o.targetRuleId))
                {
                    bool all = o.targetRuleId == "*";
                    if (all || string.Equals(rule.ruleId, o.targetRuleId, StringComparison.OrdinalIgnoreCase))
                    {
                        targets.Add(rule);
                    }
                    continue; // ruleId-адресация приоритетна
                }

                if (!string.IsNullOrWhiteSpace(o.targetTag))
                {
                    if (string.Equals(rule.requiredTag, o.targetTag, StringComparison.OrdinalIgnoreCase))
                    {
                        targets.Add(rule);
                    }
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(o.targetLocationId))
                {
                    if (string.Equals(rule.locationId, o.targetLocationId, StringComparison.OrdinalIgnoreCase) ||
                        ContainsIgnoreCase(rule.variantIds, o.targetLocationId))
                    {
                        targets.Add(rule);
                    }
                }
            }

            return targets;
        }

        private static void CollectLocationRules(
            TemplateClusterRequirementData root,
            List<TemplateLocationRequirementData> output)
        {
            if (root == null)
            {
                return;
            }

            if (root.requiredLocations != null)
            {
                output.AddRange(root.requiredLocations);
            }

            if (root.requiredClusters != null)
            {
                foreach (TemplateClusterRequirementData child in root.requiredClusters)
                {
                    CollectLocationRules(child, output);
                }
            }
        }

        /// <summary>
        /// Префикснуть id внутренностей поддерева ("rootId/childId"), кроме
        /// id самого корня (он уже финальный — взят из точки вызова).
        /// locationId/variantIds НЕ трогаем — это глобальные адреса файлов.
        /// </summary>
        private static void PrefixSubtreeIds(TemplateClusterRequirementData root)
        {
            string prefix = root.clusterId;
            if (string.IsNullOrWhiteSpace(prefix))
            {
                return;
            }

            if (root.requiredLocations != null)
            {
                foreach (TemplateLocationRequirementData loc in root.requiredLocations)
                {
                    if (loc != null && !string.IsNullOrWhiteSpace(loc.ruleId))
                    {
                        loc.ruleId = prefix + "/" + loc.ruleId;
                    }
                }
            }

            if (root.requiredClusters != null)
            {
                foreach (TemplateClusterRequirementData child in root.requiredClusters)
                {
                    PrefixClusterIds(child, prefix);
                }
            }
        }

        private static void PrefixClusterIds(TemplateClusterRequirementData cluster, string prefix)
        {
            if (cluster == null)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(cluster.clusterId))
            {
                cluster.clusterId = prefix + "/" + cluster.clusterId;
            }
            if (!string.IsNullOrWhiteSpace(cluster.ruleId))
            {
                cluster.ruleId = prefix + "/" + cluster.ruleId;
            }

            if (cluster.requiredLocations != null)
            {
                foreach (TemplateLocationRequirementData loc in cluster.requiredLocations)
                {
                    if (loc != null && !string.IsNullOrWhiteSpace(loc.ruleId))
                    {
                        loc.ruleId = prefix + "/" + loc.ruleId;
                    }
                }
            }

            if (cluster.requiredClusters != null)
            {
                foreach (TemplateClusterRequirementData child in cluster.requiredClusters)
                {
                    PrefixClusterIds(child, prefix);
                }
            }
        }

        // ------------------------------------------------------------------
        // Хелперы.
        // ------------------------------------------------------------------

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (string v in values)
            {
                if (!string.IsNullOrWhiteSpace(v))
                {
                    return v;
                }
            }
            return "";
        }

        private static List<T> ConcatCloned<T>(List<T> first, List<T> second) where T : class
        {
            List<T> result = new List<T>();
            if (first != null)
            {
                foreach (T item in first)
                {
                    result.Add(Clone(item));
                }
            }
            if (second != null)
            {
                foreach (T item in second)
                {
                    result.Add(Clone(item));
                }
            }
            return result;
        }

        private static bool ContainsIgnoreCase(List<string> list, string value)
        {
            if (list == null || string.IsNullOrWhiteSpace(value))
            {
                return false;
            }
            foreach (string item in list)
            {
                if (string.Equals(item, value, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>Глубокая копия data-only классов формата через JsonUtility.</summary>
        private static T Clone<T>(T value) where T : class
        {
            if (value == null)
            {
                return null;
            }
            return JsonUtility.FromJson<T>(JsonUtility.ToJson(value));
        }
    }
}
