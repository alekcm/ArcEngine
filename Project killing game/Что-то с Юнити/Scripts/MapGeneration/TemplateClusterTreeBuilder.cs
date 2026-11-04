using System;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Builds the logical GeneratedClusterPlan tree from template data.
    ///
    /// This class deliberately does not place rooms, walls or objects. It only creates
    /// the container hierarchy: map -> building -> wing -> nested zone -> ...
    /// The physical layout generator can then place rooms into these clusters.
    /// </summary>
    public class TemplateClusterTreeBuilder
    {
        private const int MaxDepth = 64;

        public GeneratedClusterPlan BuildInto(GeneratedMapLayout layout, MapGenerationTemplateData template, RectInt rootBounds)
        {
            if (layout == null)
            {
                throw new ArgumentNullException(nameof(layout));
            }

            layout.Clusters.Clear();

            GeneratedClusterPlan root = new GeneratedClusterPlan
            {
                ClusterId = "map",
                ParentClusterId = null,
                ClusterType = "map",
                DisplayName = string.IsNullOrWhiteSpace(template?.name) ? "Map" : template.name,
                Placement = GeneratedLocationPlacement.System,
                Floor = 0,
                Bounds = rootBounds,
                Required = true
            };
            root.Tags.Add("sys:map");
            layout.Clusters.Add(root);

            if (template?.requiredClusters == null)
            {
                return root;
            }

            for (int i = 0; i < template.requiredClusters.Count; i++)
            {
                BuildClusterInstances(layout, template.requiredClusters[i], root, i, 0);
            }

            return root;
        }

        private void BuildClusterInstances(GeneratedMapLayout layout, TemplateClusterRequirementData rule, GeneratedClusterPlan parent, int siblingIndex, int depth)
        {
            if (layout == null || rule == null || parent == null || depth > MaxDepth)
            {
                return;
            }

            int count = Mathf.Max(0, rule.minCount);
            if (rule.countPerPlayer)
            {
                count = Mathf.Max(1, count);
            }

            if (count <= 0)
            {
                return;
            }

            for (int instanceIndex = 0; instanceIndex < count; instanceIndex++)
            {
                GeneratedClusterPlan cluster = CreateCluster(rule, parent, siblingIndex, instanceIndex);
                layout.Clusters.Add(cluster);

                if (!parent.ChildClusterIds.Contains(cluster.ClusterId))
                {
                    parent.ChildClusterIds.Add(cluster.ClusterId);
                }

                if (rule.requiredClusters != null)
                {
                    for (int childIndex = 0; childIndex < rule.requiredClusters.Count; childIndex++)
                    {
                        BuildClusterInstances(layout, rule.requiredClusters[childIndex], cluster, childIndex, depth + 1);
                    }
                }
            }
        }

        private GeneratedClusterPlan CreateCluster(TemplateClusterRequirementData rule, GeneratedClusterPlan parent, int siblingIndex, int instanceIndex)
        {
            string type = !string.IsNullOrWhiteSpace(rule.clusterType) ? rule.clusterType : !string.IsNullOrWhiteSpace(rule.requiredTag) ? Sanitize(rule.requiredTag) : "cluster";
            string id = ResolveClusterId(rule, parent, type, siblingIndex, instanceIndex);

            GeneratedLocationPlacement placement = rule.restrictPlacement ? rule.placement : parent.Placement == GeneratedLocationPlacement.System ? GeneratedLocationPlacement.Indoor : parent.Placement;
            int floor = rule.restrictFloor ? rule.floor : parent.Floor;
            RectInt bounds = rule.hasBounds ? new RectInt(rule.boundsX, rule.boundsY, Mathf.Max(0, rule.boundsW), Mathf.Max(0, rule.boundsH)) : parent.Bounds;

            GeneratedClusterPlan cluster = new GeneratedClusterPlan
            {
                ClusterId = id,
                ParentClusterId = parent.ClusterId,
                ClusterType = type,
                DisplayName = string.IsNullOrWhiteSpace(rule.displayName) ? Humanize(type, instanceIndex) : rule.displayName,
                Placement = placement,
                Floor = floor,
                Bounds = bounds,
                Required = true
            };

            if (!string.IsNullOrWhiteSpace(rule.requiredTag))
            {
                cluster.Tags.Add(rule.requiredTag);
            }

            return cluster;
        }

        private static string ResolveClusterId(TemplateClusterRequirementData rule, GeneratedClusterPlan parent, string type, int siblingIndex, int instanceIndex)
        {
            if (!string.IsNullOrWhiteSpace(rule.clusterId) && rule.minCount <= 1)
            {
                return rule.clusterId;
            }

            if (!string.IsNullOrWhiteSpace(rule.clusterId))
            {
                return rule.clusterId + "_" + (instanceIndex + 1);
            }

            string parentPrefix = parent == null || string.IsNullOrWhiteSpace(parent.ClusterId) || parent.ClusterId == "map" ? string.Empty : parent.ClusterId + "_";
            return parentPrefix + Sanitize(type) + "_" + siblingIndex + "_" + (instanceIndex + 1);
        }

        private static string Sanitize(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "cluster";
            }

            char[] chars = value.ToLowerInvariant().ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (!char.IsLetterOrDigit(c) && c != '_' && c != '-')
                {
                    chars[i] = '_';
                }
            }

            return new string(chars);
        }

        private static string Humanize(string type, int instanceIndex)
        {
            if (string.IsNullOrWhiteSpace(type))
            {
                return "Cluster";
            }

            return instanceIndex <= 0 ? type : type + " " + (instanceIndex + 1);
        }
    }
}
