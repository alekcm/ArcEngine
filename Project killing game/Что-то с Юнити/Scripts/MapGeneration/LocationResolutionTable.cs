using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    /// <summary>
    /// Индекс «комната → локационное требование шаблона» по раскрытому
    /// (TemplateRefExpander) шаблону. Генератор использует его при наполнении
    /// комнат: зная locationId/теги комнаты, находит её требование — и
    /// применяет variantIds/variantPolicy/overrides из него.
    ///
    /// Дубликаты ключей: первое вхождение побеждает (порядок обхода дерева
    /// сверху вниз, как в файле шаблона) — детерминированно.
    /// </summary>
    public class LocationResolutionTable
    {
        private readonly Dictionary<string, TemplateLocationRequirementData> byRuleId =
            new Dictionary<string, TemplateLocationRequirementData>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, TemplateLocationRequirementData> byLocationId =
            new Dictionary<string, TemplateLocationRequirementData>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, TemplateLocationRequirementData> byVariantId =
            new Dictionary<string, TemplateLocationRequirementData>(StringComparer.OrdinalIgnoreCase);
        private readonly List<TemplateLocationRequirementData> tagRules =
            new List<TemplateLocationRequirementData>();

        public int RuleCount => byRuleId.Count + tagRules.Count; // ориентировочно, для логов

        // ------------------------------------------------------------------

        public static LocationResolutionTable Build(MapGenerationTemplateData template)
        {
            var table = new LocationResolutionTable();
            if (template == null)
            {
                return table;
            }

            if (template.requiredLocations != null)
            {
                foreach (TemplateLocationRequirementData rule in template.requiredLocations)
                {
                    table.Register(rule);
                }
            }

            if (template.requiredClusters != null)
            {
                foreach (TemplateClusterRequirementData cluster in template.requiredClusters)
                {
                    table.RegisterCluster(cluster);
                }
            }

            return table;
        }

        private void RegisterCluster(TemplateClusterRequirementData cluster)
        {
            if (cluster == null)
            {
                return;
            }

            if (cluster.requiredLocations != null)
            {
                foreach (TemplateLocationRequirementData rule in cluster.requiredLocations)
                {
                    Register(rule);
                }
            }

            if (cluster.requiredClusters != null)
            {
                foreach (TemplateClusterRequirementData child in cluster.requiredClusters)
                {
                    RegisterCluster(child);
                }
            }
        }

        private void Register(TemplateLocationRequirementData rule)
        {
            if (rule == null)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(rule.ruleId) && !byRuleId.ContainsKey(rule.ruleId))
            {
                byRuleId.Add(rule.ruleId, rule);
            }

            if (!string.IsNullOrWhiteSpace(rule.locationId) && !byLocationId.ContainsKey(rule.locationId))
            {
                byLocationId.Add(rule.locationId, rule);
            }

            if (rule.variantIds != null)
            {
                foreach (string variantId in rule.variantIds)
                {
                    if (!string.IsNullOrWhiteSpace(variantId) && !byVariantId.ContainsKey(variantId))
                    {
                        byVariantId.Add(variantId, rule);
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(rule.requiredTag))
            {
                tagRules.Add(rule);
            }
        }

        // ------------------------------------------------------------------

        /// <summary>
        /// Найти требование для комнаты: сначала по точному locationId,
        /// затем как по variantId (комната уже заспавнена как вариант),
        /// затем по совпадению requiredTag с тегами комнаты.
        /// null — комната шаблоном не требуется (легаси-путь FindById).
        /// </summary>
        public TemplateLocationRequirementData FindForRoom(string locationId, IReadOnlyList<string> roomTags)
        {
            if (!string.IsNullOrWhiteSpace(locationId))
            {
                if (byLocationId.TryGetValue(locationId, out TemplateLocationRequirementData byId))
                {
                    return byId;
                }

                if (byVariantId.TryGetValue(locationId, out TemplateLocationRequirementData byVariant))
                {
                    return byVariant;
                }
            }

            if (roomTags != null)
            {
                for (int i = 0; i < roomTags.Count; i++)
                {
                    TemplateLocationRequirementData rule = FindByTag(roomTags[i]);
                    if (rule != null)
                    {
                        return rule;
                    }
                }
            }

            return null;
        }

        public TemplateLocationRequirementData FindByRuleId(string ruleId)
        {
            return !string.IsNullOrWhiteSpace(ruleId) &&
                   byRuleId.TryGetValue(ruleId, out TemplateLocationRequirementData rule)
                ? rule
                : null;
        }

        private TemplateLocationRequirementData FindByTag(string tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                return null;
            }

            for (int i = 0; i < tagRules.Count; i++)
            {
                if (string.Equals(tagRules[i].requiredTag, tag, StringComparison.OrdinalIgnoreCase))
                {
                    return tagRules[i];
                }
            }

            return null;
        }
    }
}
