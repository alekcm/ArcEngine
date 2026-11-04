using System;
using UnityEngine;

namespace MapEditorPrototype
{
    public enum ClusterLayoutPreset
    {
        Generic,
        MansionSpine
    }

    [Serializable]
    public class ClusterLayoutPlannerOptions
    {
        public ClusterLayoutPreset preset = ClusterLayoutPreset.MansionSpine;
        public RectInt mapBounds;
        public RectInt buildingBounds;
        public int buildingWidth = 24;
        public int buildingLength = 34;
        public int roomDepth = 10;
        public int roomLength = 6;
        public int outdoorPadding = 8;
        public bool includeCourtroom = true;
        public bool includeOutdoorYard = true;
    }

    /// <summary>
    /// Assigns physical planning metadata (floor, bounds, placement) to the logical
    /// cluster tree produced from template data.
    ///
    /// MVP-2 scope: this is still heuristic and mansion-oriented, but it is isolated
    /// from ClusteredMansionMapGenerator so later presets/settings can be added without
    /// touching room/wall export code.
    /// </summary>
    public class ClusterLayoutPlanner
    {
        public void Apply(GeneratedMapLayout layout, ClusterLayoutPlannerOptions options)
        {
            if (layout == null)
            {
                return;
            }

            options = options ?? new ClusterLayoutPlannerOptions();
            NormalizeOptions(options);

            ApplyTemplateHints(layout);

            switch (options.preset)
            {
                case ClusterLayoutPreset.MansionSpine:
                    ApplyMansionSpine(layout, options);
                    break;
                case ClusterLayoutPreset.Generic:
                default:
                    ApplyGeneric(layout, options);
                    break;
            }
        }

        private static void NormalizeOptions(ClusterLayoutPlannerOptions options)
        {
            options.buildingWidth = Mathf.Max(1, options.buildingWidth);
            options.buildingLength = Mathf.Max(1, options.buildingLength);
            options.roomDepth = Mathf.Max(1, options.roomDepth);
            options.roomLength = Mathf.Max(1, options.roomLength);
            options.outdoorPadding = Mathf.Max(0, options.outdoorPadding);

            if (options.buildingBounds.width <= 0 || options.buildingBounds.height <= 0)
            {
                options.buildingBounds = new RectInt(0, 0, options.buildingWidth, options.buildingLength);
            }

            if (options.mapBounds.width <= 0 || options.mapBounds.height <= 0)
            {
                options.mapBounds = new RectInt(
                    options.buildingBounds.xMin - options.outdoorPadding,
                    options.buildingBounds.yMin - options.outdoorPadding,
                    options.buildingBounds.width + options.outdoorPadding * 2,
                    options.buildingBounds.height + options.outdoorPadding * 2);
            }
        }

        private static void ApplyTemplateHints(GeneratedMapLayout layout)
        {
            for (int i = 0; i < layout.Clusters.Count; i++)
            {
                GeneratedClusterPlan cluster = layout.Clusters[i];
                if (cluster == null)
                {
                    continue;
                }

                if (cluster.Placement == GeneratedLocationPlacement.System)
                {
                    continue;
                }

                if (cluster.Bounds.width > 0 && cluster.Bounds.height > 0)
                {
                    // TemplateClusterTreeBuilder already applied explicit bounds.
                    continue;
                }

                GeneratedClusterPlan parent = layout.FindCluster(cluster.ParentClusterId);
                if (parent != null)
                {
                    cluster.Bounds = parent.Bounds;
                    if (cluster.Placement == GeneratedLocationPlacement.System)
                    {
                        cluster.Placement = parent.Placement;
                    }
                }
            }
        }

        private static void ApplyGeneric(GeneratedMapLayout layout, ClusterLayoutPlannerOptions options)
        {
            Set(layout, "map", GeneratedLocationPlacement.System, 0, options.mapBounds);

            for (int i = 0; i < layout.Clusters.Count; i++)
            {
                GeneratedClusterPlan cluster = layout.Clusters[i];
                if (cluster == null || cluster.ClusterId == "map")
                {
                    continue;
                }

                GeneratedClusterPlan parent = layout.FindCluster(cluster.ParentClusterId);
                RectInt bounds = parent != null && parent.Bounds.width > 0 && parent.Bounds.height > 0 ? parent.Bounds : options.buildingBounds;
                GeneratedLocationPlacement placement = cluster.Placement == GeneratedLocationPlacement.System ? GeneratedLocationPlacement.Indoor : cluster.Placement;
                Set(layout, cluster.ClusterId, placement, cluster.Floor, bounds);
            }
        }

        private static void ApplyMansionSpine(GeneratedMapLayout layout, ClusterLayoutPlannerOptions options)
        {
            RectInt map = options.mapBounds;
            RectInt building = options.buildingBounds;
            RectInt staff = new RectInt(building.xMin, building.yMin, building.width, Mathf.Min(building.height, options.roomLength * 2));
            RectInt janitor = new RectInt(building.xMin, building.yMin, options.roomDepth + 1, Mathf.Min(building.height, options.roomLength * 2));
            RectInt janitorLiving = new RectInt(janitor.xMin, janitor.yMin, janitor.width, Mathf.Min(options.roomLength, janitor.height));
            RectInt janitorStorage = new RectInt(janitor.xMin, janitor.yMin + options.roomLength, janitor.width, Mathf.Min(options.roomLength, Mathf.Max(0, janitor.height - options.roomLength)));
            RectInt medical = new RectInt(building.xMax - options.roomDepth - 1, building.yMin, options.roomDepth + 1, Mathf.Min(options.roomLength, building.height));
            RectInt court = new RectInt(building.xMin + 2, building.yMin + 2, Mathf.Max(1, building.width - 4), Mathf.Max(1, building.height - 4));

            Set(layout, "map", GeneratedLocationPlacement.System, 0, map);
            Set(layout, "mansion", GeneratedLocationPlacement.Indoor, 0, building);
            Set(layout, "dormitory", GeneratedLocationPlacement.Indoor, 0, building);
            Set(layout, "dorm_wing_floor0", GeneratedLocationPlacement.Indoor, 0, building);
            Set(layout, "dorm_wing_floor1", GeneratedLocationPlacement.Indoor, 1, building);
            Set(layout, "staff_area", GeneratedLocationPlacement.Indoor, 0, staff);
            Set(layout, "janitor_area", GeneratedLocationPlacement.Indoor, 0, janitor);
            Set(layout, "janitor_living", GeneratedLocationPlacement.Indoor, 0, janitorLiving);
            Set(layout, "janitor_storage", GeneratedLocationPlacement.Indoor, 0, janitorStorage);
            Set(layout, "medical_staff_area", GeneratedLocationPlacement.Indoor, 0, medical);

            if (options.includeCourtroom)
            {
                Set(layout, "court_block", GeneratedLocationPlacement.Indoor, -1, court);
            }

            if (options.includeOutdoorYard)
            {
                Set(layout, "outdoor_grounds", GeneratedLocationPlacement.Outdoor, 0, map);
            }

            ApplyFallbackToChildren(layout);
        }

        private static void ApplyFallbackToChildren(GeneratedMapLayout layout)
        {
            for (int pass = 0; pass < 4; pass++)
            {
                for (int i = 0; i < layout.Clusters.Count; i++)
                {
                    GeneratedClusterPlan cluster = layout.Clusters[i];
                    if (cluster == null || string.IsNullOrWhiteSpace(cluster.ParentClusterId))
                    {
                        continue;
                    }

                    GeneratedClusterPlan parent = layout.FindCluster(cluster.ParentClusterId);
                    if (parent == null)
                    {
                        continue;
                    }

                    if (cluster.Bounds.width <= 0 || cluster.Bounds.height <= 0)
                    {
                        cluster.Bounds = parent.Bounds;
                    }

                    if (cluster.Placement == GeneratedLocationPlacement.System && parent.Placement != GeneratedLocationPlacement.System)
                    {
                        cluster.Placement = parent.Placement;
                    }
                }
            }
        }

        private static void Set(GeneratedMapLayout layout, string clusterId, GeneratedLocationPlacement placement, int floor, RectInt bounds)
        {
            GeneratedClusterPlan cluster = layout.FindCluster(clusterId);
            if (cluster == null)
            {
                return;
            }

            cluster.Placement = placement;
            cluster.Floor = floor;
            cluster.Bounds = bounds;
        }
    }
}
