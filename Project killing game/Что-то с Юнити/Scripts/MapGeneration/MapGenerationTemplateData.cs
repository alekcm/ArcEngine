using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// JSON/Inspector-friendly description of required map structure.
    ///
    /// This is intentionally data-only: no ScriptableObject dependency is required,
    /// so later the same structure can be loaded from StreamingAssets/persistentDataPath
    /// and edited by players through UI.
    /// </summary>
    [Serializable]
    public class MapGenerationTemplateData
    {
        public int formatVersion = 1;
        public string id;
        public string name;
        [TextArea] public string description;

        public bool requireOutdoorConnectivity = true;
        public List<TemplateLocationRequirementData> requiredLocations = new List<TemplateLocationRequirementData>();
        public List<TemplateClusterRequirementData> requiredClusters = new List<TemplateClusterRequirementData>();
        public List<TemplateConnectorRequirementData> requiredConnectors = new List<TemplateConnectorRequirementData>();
    }

    [Serializable]
    public class TemplateLocationRequirementData
    {
        public string ruleId;
        public string locationId;
        public string requiredTag;
        public GeneratedLocationPlacement placement = GeneratedLocationPlacement.Indoor;
        public bool restrictPlacement;
        public int minCount = 1;
        public bool countPerPlayer;

        /// <summary>Оверрайды слотов локации в точке вызова (LocationOverrideApplier).</summary>
        public List<TemplateLocationOverrideData> overrides = new List<TemplateLocationOverrideData>();

        /// <summary>Явный список вариантов локации (LocationVariantResolver). Пусто → строго по locationId.</summary>
        public List<string> variantIds = new List<string>();

        /// <summary>Политика выбора варианта: ""(auto) | "byId" | "first" | "random" | "weighted".</summary>
        public string variantPolicy = "";
    }

    [Serializable]
    public class TemplateClusterRequirementData
    {
        public string ruleId;
        public string clusterId;
        public string clusterType;
        public string displayName;
        public string requiredTag;
        public GeneratedLocationPlacement placement = GeneratedLocationPlacement.Indoor;
        public bool restrictPlacement;
        public int floor;
        public bool restrictFloor;
        public int boundsX;
        public int boundsY;
        public int boundsW;
        public int boundsH;
        public bool hasBounds;
        public int minCount = 1;
        public bool countPerPlayer;

        /// <summary>
        /// Required locations that must exist somewhere inside this cluster,
        /// including any nested child clusters.
        /// </summary>
        public List<TemplateLocationRequirementData> requiredLocations = new List<TemplateLocationRequirementData>();

        /// <summary>
        /// Required child clusters. They can contain their own children recursively.
        /// </summary>
        public List<TemplateClusterRequirementData> requiredClusters = new List<TemplateClusterRequirementData>();

        /// <summary>
        /// Required connectors related to this cluster.
        /// </summary>
        public List<TemplateConnectorRequirementData> requiredConnectors = new List<TemplateConnectorRequirementData>();

        /// <summary>
        /// Ссылка на переиспользуемый кластерный фрагмент (*.cluster.json, напр.
        /// "core.cluster.med_block"). Раскрывается TemplateRefExpander: содержимое
        /// фрагмента инлайнится, параметры вызова (floor/bounds/minCount/placement) —
        /// из этой записи, затем применяются overrides. Пусто → обычный инлайн-кластер.
        /// </summary>
        public string clusterRef = "";

        /// <summary>
        /// Оверрайды локаций внутри поддерева этого кластера (в т.ч. раскрытого из
        /// clusterRef). Применяются TemplateRefExpander (адресация по ruleId/tag/locationId).
        /// </summary>
        public List<TemplateClusterLocationOverrideData> overrides = new List<TemplateClusterLocationOverrideData>();
    }

    [Serializable]
    public class TemplateConnectorRequirementData
    {
        public string ruleId;
        public GeneratedConnectorKind kind = GeneratedConnectorKind.Door;
        public bool restrictKind = true;
        public string fromLocationId;
        public string fromTag;
        public string toLocationId;
        public string toTag;
        public int minCount = 1;
    }

    public static class MapGenerationTemplateRuleConverter
    {
        public static MapGenerationValidationOptions ToValidationOptions(MapGenerationTemplateData template, int playerCount, string startRoomId)
        {
            MapGenerationValidationOptions options = new MapGenerationValidationOptions
            {
                ExpectedPlayerCount = Mathf.Max(0, playerCount),
                StartRoomId = startRoomId,
                RequireOutdoorConnectivity = template == null || template.requireOutdoorConnectivity
            };

            if (template == null)
            {
                return options;
            }

            if (template.requiredLocations != null)
            {
                for (int i = 0; i < template.requiredLocations.Count; i++)
                {
                    RequiredLocationRule rule = ToRuntimeRule(template.requiredLocations[i]);
                    if (rule != null) options.RequiredLocations.Add(rule);
                }
            }

            if (template.requiredClusters != null)
            {
                for (int i = 0; i < template.requiredClusters.Count; i++)
                {
                    RequiredClusterRule rule = ToRuntimeRule(template.requiredClusters[i]);
                    if (rule != null) options.RequiredClusters.Add(rule);
                }
            }

            if (template.requiredConnectors != null)
            {
                for (int i = 0; i < template.requiredConnectors.Count; i++)
                {
                    RequiredConnectorRule rule = ToRuntimeRule(template.requiredConnectors[i]);
                    if (rule != null) options.RequiredConnectors.Add(rule);
                }
            }

            return options;
        }

        public static RequiredLocationRule ToRuntimeRule(TemplateLocationRequirementData data)
        {
            if (data == null)
            {
                return null;
            }

            return new RequiredLocationRule
            {
                RuleId = data.ruleId,
                LocationId = data.locationId,
                RequiredTag = data.requiredTag,
                Placement = data.placement,
                RestrictPlacement = data.restrictPlacement,
                MinCount = data.minCount,
                CountPerPlayer = data.countPerPlayer
            };
        }

        public static RequiredClusterRule ToRuntimeRule(TemplateClusterRequirementData data)
        {
            if (data == null)
            {
                return null;
            }

            RequiredClusterRule rule = new RequiredClusterRule
            {
                RuleId = data.ruleId,
                ClusterId = data.clusterId,
                ClusterType = data.clusterType,
                RequiredTag = data.requiredTag,
                Placement = data.placement,
                RestrictPlacement = data.restrictPlacement,
                MinCount = data.minCount,
                CountPerPlayer = data.countPerPlayer
            };

            if (data.requiredLocations != null)
            {
                for (int i = 0; i < data.requiredLocations.Count; i++)
                {
                    RequiredLocationRule child = ToRuntimeRule(data.requiredLocations[i]);
                    if (child != null) rule.RequiredLocations.Add(child);
                }
            }

            if (data.requiredClusters != null)
            {
                for (int i = 0; i < data.requiredClusters.Count; i++)
                {
                    RequiredClusterRule child = ToRuntimeRule(data.requiredClusters[i]);
                    if (child != null) rule.RequiredClusters.Add(child);
                }
            }

            if (data.requiredConnectors != null)
            {
                for (int i = 0; i < data.requiredConnectors.Count; i++)
                {
                    RequiredConnectorRule child = ToRuntimeRule(data.requiredConnectors[i]);
                    if (child != null) rule.RequiredConnectors.Add(child);
                }
            }

            return rule;
        }

        public static RequiredConnectorRule ToRuntimeRule(TemplateConnectorRequirementData data)
        {
            if (data == null)
            {
                return null;
            }

            return new RequiredConnectorRule
            {
                RuleId = data.ruleId,
                Kind = data.kind,
                RestrictKind = data.restrictKind,
                FromLocationId = data.fromLocationId,
                FromTag = data.fromTag,
                ToLocationId = data.toLocationId,
                ToTag = data.toTag,
                MinCount = data.minCount
            };
        }
    }

    public static class MapGenerationTemplateJsonUtility
    {
        public static string ToJson(MapGenerationTemplateData template, bool prettyPrint = true)
        {
            return JsonUtility.ToJson(template, prettyPrint);
        }

        public static MapGenerationTemplateData FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            return JsonUtility.FromJson<MapGenerationTemplateData>(json);
        }
    }
}
