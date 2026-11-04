using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace MapEditorPrototype
{
    /// <summary>
    /// Lightweight schema/semantic validator for template JSON files.
    /// It does not check BuildCatalog/WallCatalog ids yet; this validator only verifies
    /// that required cluster/location/connector rules are well-formed and finite.
    /// </summary>
    public class MapGenerationTemplateValidator
    {
        private static readonly Regex IdRegex = new Regex("^[a-z0-9_.-]+$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private const int MaxDepth = 64;

        public MapGenerationValidationResult Validate(MapGenerationTemplateData template, bool userTemplate = false)
        {
            MapGenerationValidationResult result = new MapGenerationValidationResult();

            if (template == null)
            {
                result.Add(MapGenerationIssueSeverity.Error, "template.null", "Template is null.");
                return result;
            }

            ValidateId(template.id, userTemplate, result);

            if (template.formatVersion <= 0)
            {
                result.Add(MapGenerationIssueSeverity.Error, "template.bad_format_version", "Template formatVersion must be positive.", template.id);
            }

            if ((template.requiredLocations == null || template.requiredLocations.Count == 0) &&
                (template.requiredClusters == null || template.requiredClusters.Count == 0) &&
                (template.requiredConnectors == null || template.requiredConnectors.Count == 0))
            {
                result.Add(MapGenerationIssueSeverity.Warning, "template.empty_requirements", "Template has no required locations, clusters or connectors.", template.id);
            }

            ValidateLocationRules(template.requiredLocations, "template", result);
            ValidateConnectorRules(template.requiredConnectors, "template", result);
            ValidateClusterRules(template.requiredClusters, "template", result, 0);

            return result;
        }

        private static void ValidateId(string id, bool userTemplate, MapGenerationValidationResult result)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                result.Add(MapGenerationIssueSeverity.Error, "template.id_empty", "Template id is empty.");
                return;
            }

            if (!IdRegex.IsMatch(id))
            {
                result.Add(MapGenerationIssueSeverity.Error, "template.id_bad_format", "Template id may contain only letters, digits, '_', '-' and '.'.", id);
            }

            if (userTemplate && !id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
            {
                result.Add(MapGenerationIssueSeverity.Error, "template.user_id_prefix", "User template id must start with 'user.'.", id);
            }
        }

        private static void ValidateLocationRules(List<TemplateLocationRequirementData> rules, string context, MapGenerationValidationResult result)
        {
            if (rules == null)
            {
                return;
            }

            for (int i = 0; i < rules.Count; i++)
            {
                TemplateLocationRequirementData rule = rules[i];
                string ruleContext = context + ".location[" + i + "]";
                if (rule == null)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.location_rule_null", "Location requirement is null.", ruleContext);
                    continue;
                }

                if (rule.minCount < 0)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.location_min_negative", "Location requirement minCount cannot be negative.", ruleContext);
                }

                if (string.IsNullOrWhiteSpace(rule.locationId) && string.IsNullOrWhiteSpace(rule.requiredTag))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.location_no_matcher", "Location requirement must specify locationId or requiredTag.", ruleContext);
                }
            }
        }

        private static void ValidateConnectorRules(List<TemplateConnectorRequirementData> rules, string context, MapGenerationValidationResult result)
        {
            if (rules == null)
            {
                return;
            }

            for (int i = 0; i < rules.Count; i++)
            {
                TemplateConnectorRequirementData rule = rules[i];
                string ruleContext = context + ".connector[" + i + "]";
                if (rule == null)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.connector_rule_null", "Connector requirement is null.", ruleContext);
                    continue;
                }

                if (rule.minCount < 0)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.connector_min_negative", "Connector requirement minCount cannot be negative.", ruleContext);
                }
            }
        }

        private static void ValidateClusterRules(List<TemplateClusterRequirementData> rules, string context, MapGenerationValidationResult result, int depth)
        {
            if (rules == null)
            {
                return;
            }

            if (depth > MaxDepth)
            {
                result.Add(MapGenerationIssueSeverity.Error, "template.cluster_depth", "Cluster requirement tree is too deep.", context);
                return;
            }

            for (int i = 0; i < rules.Count; i++)
            {
                TemplateClusterRequirementData rule = rules[i];
                string ruleContext = context + ".cluster[" + i + "]";
                if (rule == null)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.cluster_rule_null", "Cluster requirement is null.", ruleContext);
                    continue;
                }

                if (rule.minCount < 0)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.cluster_min_negative", "Cluster requirement minCount cannot be negative.", ruleContext);
                }

                if (string.IsNullOrWhiteSpace(rule.clusterId) && string.IsNullOrWhiteSpace(rule.clusterType) && string.IsNullOrWhiteSpace(rule.requiredTag))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "template.cluster_no_matcher", "Cluster requirement must specify clusterId, clusterType or requiredTag.", ruleContext);
                }

                ValidateLocationRules(rule.requiredLocations, ruleContext, result);
                ValidateConnectorRules(rule.requiredConnectors, ruleContext, result);
                ValidateClusterRules(rule.requiredClusters, ruleContext, result, depth + 1);
            }
        }
    }
}
