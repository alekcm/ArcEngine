using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    [Serializable]
    public class RequiredLocationRule
    {
        public string RuleId;
        public string LocationId;
        public string RequiredTag;
        public GeneratedLocationPlacement Placement;
        public bool RestrictPlacement;
        public int MinCount = 1;
        public bool CountPerPlayer;

        public int ResolveMinCount(int playerCount)
        {
            if (CountPerPlayer)
            {
                return Math.Max(0, playerCount);
            }

            return Math.Max(0, MinCount);
        }
    }

    [Serializable]
    public class RequiredClusterRule
    {
        public string RuleId;
        public string ClusterId;
        public string ClusterType;
        public string RequiredTag;
        public GeneratedLocationPlacement Placement;
        public bool RestrictPlacement;
        public int MinCount = 1;
        public bool CountPerPlayer;
        public readonly List<RequiredLocationRule> RequiredLocations = new List<RequiredLocationRule>();
        public readonly List<RequiredClusterRule> RequiredClusters = new List<RequiredClusterRule>();
        public readonly List<RequiredConnectorRule> RequiredConnectors = new List<RequiredConnectorRule>();

        public int ResolveMinCount(int playerCount)
        {
            if (CountPerPlayer)
            {
                return Math.Max(0, playerCount);
            }

            return Math.Max(0, MinCount);
        }
    }

    [Serializable]
    public class RequiredConnectorRule
    {
        public string RuleId;
        public GeneratedConnectorKind Kind;
        public bool RestrictKind = true;
        public string FromLocationId;
        public string FromTag;
        public string ToLocationId;
        public string ToTag;
        public int MinCount = 1;
    }

    [Serializable]
    public class MapGenerationValidationOptions
    {
        public bool RequireOutdoorConnectivity = true;
        public int ExpectedPlayerCount;
        public string StartRoomId;
        public readonly List<RequiredLocationRule> RequiredLocations = new List<RequiredLocationRule>();
        public readonly List<RequiredClusterRule> RequiredClusters = new List<RequiredClusterRule>();
        public readonly List<RequiredConnectorRule> RequiredConnectors = new List<RequiredConnectorRule>();
    }

    /// <summary>
    /// Валидатор промежуточного layout-графа генератора.
    ///
    /// Он проверяет не физику Unity, а игровую структуру карты:
    /// комнаты, обязательные локации, двери, лестницы, лифт и связь с двором.
    /// Это именно тот слой, который нужен MVP-2: генерация может продолжать
    /// строить стены/пол как раньше, но перед экспортом в WorldState мы уже
    /// можем честно сказать «карта играбельна / шаблон невыполним».
    /// </summary>
    public class MapGenerationValidator
    {
        public MapGenerationValidationResult Validate(GeneratedMapLayout layout, MapGenerationValidationOptions options = null)
        {
            MapGenerationValidationResult result = new MapGenerationValidationResult();
            options = options ?? new MapGenerationValidationOptions();

            if (layout == null)
            {
                result.Add(MapGenerationIssueSeverity.Error, "layout.null", "Layout is null.");
                return result;
            }

            List<GeneratedRoomPlan> rooms = CollectRooms(layout);
            Dictionary<string, GeneratedRoomPlan> roomsById = BuildRoomIndex(rooms, result);

            ValidateBasicRooms(rooms, result);
            ValidateRequiredLocations(rooms, layout, options, result);
            ValidateRequiredClusters(layout, roomsById, options, result);
            ValidateRequiredConnectors(layout, roomsById, options, result);
            ValidateConnectivity(layout, roomsById, options, result);

            return result;
        }

        private static List<GeneratedRoomPlan> CollectRooms(GeneratedMapLayout layout)
        {
            List<GeneratedRoomPlan> rooms = new List<GeneratedRoomPlan>();
            for (int floorIndex = 0; floorIndex < layout.Floors.Count; floorIndex++)
            {
                GeneratedFloorPlan floor = layout.Floors[floorIndex];
                if (floor == null)
                {
                    continue;
                }

                for (int roomIndex = 0; roomIndex < floor.Rooms.Count; roomIndex++)
                {
                    if (floor.Rooms[roomIndex] != null)
                    {
                        rooms.Add(floor.Rooms[roomIndex]);
                    }
                }
            }

            return rooms;
        }

        private static Dictionary<string, GeneratedRoomPlan> BuildRoomIndex(List<GeneratedRoomPlan> rooms, MapGenerationValidationResult result)
        {
            Dictionary<string, GeneratedRoomPlan> index = new Dictionary<string, GeneratedRoomPlan>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < rooms.Count; i++)
            {
                GeneratedRoomPlan room = rooms[i];
                if (room == null)
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(room.RoomId))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "room.no_id", "Generated room has empty RoomId.");
                    continue;
                }

                if (index.ContainsKey(room.RoomId))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "room.duplicate_id", "Duplicate generated room id.", room.RoomId);
                    continue;
                }

                index.Add(room.RoomId, room);
            }

            return index;
        }

        private static void ValidateBasicRooms(List<GeneratedRoomPlan> rooms, MapGenerationValidationResult result)
        {
            for (int i = 0; i < rooms.Count; i++)
            {
                GeneratedRoomPlan room = rooms[i];
                if (room == null)
                {
                    continue;
                }

                if (room.Rect.width <= 0 || room.Rect.height <= 0)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "room.bad_rect", "Room rectangle has non-positive size.", room.RoomId);
                }

                if (room.Placement == GeneratedLocationPlacement.Indoor && room.DoorEdges.Count == 0)
                {
                    result.Add(MapGenerationIssueSeverity.Error, "room.no_door", "Indoor room has no door edge.", room.RoomId);
                }
            }
        }

        private static void ValidateRequiredLocations(List<GeneratedRoomPlan> rooms, GeneratedMapLayout layout, MapGenerationValidationOptions options, MapGenerationValidationResult result)
        {
            if (options.RequiredLocations == null || options.RequiredLocations.Count == 0)
            {
                return;
            }

            for (int ruleIndex = 0; ruleIndex < options.RequiredLocations.Count; ruleIndex++)
            {
                RequiredLocationRule rule = options.RequiredLocations[ruleIndex];
                if (rule == null)
                {
                    continue;
                }

                int expected = rule.ResolveMinCount(options.ExpectedPlayerCount);
                if (expected <= 0)
                {
                    continue;
                }

                int actual = 0;

                for (int roomIndex = 0; roomIndex < rooms.Count; roomIndex++)
                {
                    if (MatchesLocationRule(rooms[roomIndex], rule))
                    {
                        actual++;
                    }
                }

                for (int zoneIndex = 0; zoneIndex < layout.OutdoorZones.Count; zoneIndex++)
                {
                    if (MatchesLocationRule(layout.OutdoorZones[zoneIndex], rule))
                    {
                        actual++;
                    }
                }

                if (actual < expected)
                {
                    string ruleName = string.IsNullOrWhiteSpace(rule.RuleId) ? DescribeLocationRule(rule) : rule.RuleId;
                    result.Add(MapGenerationIssueSeverity.Error, "required.location_missing", $"Required location '{ruleName}': {actual}, expected at least {expected}.", ruleName);
                }
            }
        }

        private static void ValidateRequiredClusters(GeneratedMapLayout layout, Dictionary<string, GeneratedRoomPlan> roomsById, MapGenerationValidationOptions options, MapGenerationValidationResult result)
        {
            if (options.RequiredClusters == null || options.RequiredClusters.Count == 0)
            {
                return;
            }

            Dictionary<string, GeneratedOutdoorZonePlan> zonesById = BuildOutdoorZoneIndex(layout);
            for (int ruleIndex = 0; ruleIndex < options.RequiredClusters.Count; ruleIndex++)
            {
                ValidateClusterRule(layout, options.RequiredClusters[ruleIndex], null, roomsById, zonesById, options.ExpectedPlayerCount, result);
            }
        }

        private static void ValidateClusterRule(
            GeneratedMapLayout layout,
            RequiredClusterRule rule,
            GeneratedClusterPlan parentCluster,
            Dictionary<string, GeneratedRoomPlan> roomsById,
            Dictionary<string, GeneratedOutdoorZonePlan> zonesById,
            int playerCount,
            MapGenerationValidationResult result)
        {
            if (layout == null || rule == null)
            {
                return;
            }

            List<GeneratedClusterPlan> matches = FindMatchingClusters(layout, rule, parentCluster);
            int expected = rule.ResolveMinCount(playerCount);
            if (matches.Count < expected)
            {
                string ruleName = string.IsNullOrWhiteSpace(rule.RuleId) ? DescribeClusterRule(rule) : rule.RuleId;
                string parentSuffix = parentCluster == null ? string.Empty : $" inside '{parentCluster.ClusterId}'";
                result.Add(MapGenerationIssueSeverity.Error, "required.cluster_missing", $"Required cluster '{ruleName}'{parentSuffix}: {matches.Count}, expected at least {expected}.", ruleName);
                return;
            }

            for (int matchIndex = 0; matchIndex < matches.Count; matchIndex++)
            {
                GeneratedClusterPlan cluster = matches[matchIndex];
                ValidateClusterContents(layout, cluster, rule, roomsById, zonesById, playerCount, result);
            }
        }

        private static void ValidateClusterContents(
            GeneratedMapLayout layout,
            GeneratedClusterPlan cluster,
            RequiredClusterRule rule,
            Dictionary<string, GeneratedRoomPlan> roomsById,
            Dictionary<string, GeneratedOutdoorZonePlan> zonesById,
            int playerCount,
            MapGenerationValidationResult result)
        {
            if (cluster == null || rule == null)
            {
                return;
            }

            for (int i = 0; i < rule.RequiredLocations.Count; i++)
            {
                RequiredLocationRule locationRule = rule.RequiredLocations[i];
                if (locationRule == null)
                {
                    continue;
                }

                int expected = locationRule.ResolveMinCount(playerCount);
                int actual = CountLocationsInCluster(layout, cluster, locationRule, roomsById, zonesById);
                if (actual < expected)
                {
                    string ruleName = string.IsNullOrWhiteSpace(locationRule.RuleId) ? DescribeLocationRule(locationRule) : locationRule.RuleId;
                    result.Add(MapGenerationIssueSeverity.Error, "required.cluster_location_missing", $"Cluster '{cluster.ClusterId}' requires location '{ruleName}': {actual}, expected at least {expected}.", cluster.ClusterId);
                }
            }

            for (int i = 0; i < rule.RequiredClusters.Count; i++)
            {
                ValidateClusterRule(layout, rule.RequiredClusters[i], cluster, roomsById, zonesById, playerCount, result);
            }

            for (int i = 0; i < rule.RequiredConnectors.Count; i++)
            {
                RequiredConnectorRule connectorRule = rule.RequiredConnectors[i];
                if (connectorRule == null)
                {
                    continue;
                }

                int expected = Math.Max(0, connectorRule.MinCount);
                int actual = 0;
                for (int connectorIndex = 0; connectorIndex < layout.Connectors.Count; connectorIndex++)
                {
                    GeneratedConnectorPlan connector = layout.Connectors[connectorIndex];
                    if (connector == null)
                    {
                        continue;
                    }

                    bool fromInside = IsEndpointInsideCluster(connector.FromId, cluster, layout, roomsById, zonesById);
                    bool toInside = IsEndpointInsideCluster(connector.ToId, cluster, layout, roomsById, zonesById);
                    if ((fromInside || toInside) && MatchesConnectorRule(connector, connectorRule, roomsById, zonesById))
                    {
                        actual++;
                    }
                }

                if (actual < expected)
                {
                    string ruleName = string.IsNullOrWhiteSpace(connectorRule.RuleId) ? DescribeConnectorRule(connectorRule) : connectorRule.RuleId;
                    result.Add(MapGenerationIssueSeverity.Error, "required.cluster_connector_missing", $"Cluster '{cluster.ClusterId}' requires connector '{ruleName}': {actual}, expected at least {expected}.", cluster.ClusterId);
                }
            }
        }

        private static List<GeneratedClusterPlan> FindMatchingClusters(GeneratedMapLayout layout, RequiredClusterRule rule, GeneratedClusterPlan parentCluster)
        {
            List<GeneratedClusterPlan> matches = new List<GeneratedClusterPlan>();
            if (layout == null || rule == null)
            {
                return matches;
            }

            for (int i = 0; i < layout.Clusters.Count; i++)
            {
                GeneratedClusterPlan cluster = layout.Clusters[i];
                if (!MatchesClusterRule(cluster, rule))
                {
                    continue;
                }

                if (parentCluster != null && !IsClusterInsideCluster(cluster, parentCluster, layout))
                {
                    continue;
                }

                matches.Add(cluster);
            }

            return matches;
        }

        private static bool MatchesClusterRule(GeneratedClusterPlan cluster, RequiredClusterRule rule)
        {
            if (cluster == null || rule == null)
            {
                return false;
            }

            if (rule.RestrictPlacement && cluster.Placement != rule.Placement)
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.ClusterId) && !string.Equals(cluster.ClusterId, rule.ClusterId, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.ClusterType) && !string.Equals(cluster.ClusterType, rule.ClusterType, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.RequiredTag) && !cluster.HasTag(rule.RequiredTag))
            {
                return false;
            }

            return !string.IsNullOrWhiteSpace(rule.ClusterId) || !string.IsNullOrWhiteSpace(rule.ClusterType) || !string.IsNullOrWhiteSpace(rule.RequiredTag);
        }

        private static int CountLocationsInCluster(GeneratedMapLayout layout, GeneratedClusterPlan cluster, RequiredLocationRule rule, Dictionary<string, GeneratedRoomPlan> roomsById, Dictionary<string, GeneratedOutdoorZonePlan> zonesById)
        {
            return CountLocationsInClusterRecursive(layout, cluster, rule, roomsById, zonesById, new HashSet<string>(StringComparer.OrdinalIgnoreCase), 0);
        }

        private static int CountLocationsInClusterRecursive(
            GeneratedMapLayout layout,
            GeneratedClusterPlan cluster,
            RequiredLocationRule rule,
            Dictionary<string, GeneratedRoomPlan> roomsById,
            Dictionary<string, GeneratedOutdoorZonePlan> zonesById,
            HashSet<string> visitedClusters,
            int depth)
        {
            int count = 0;
            if (layout == null || cluster == null || rule == null || string.IsNullOrWhiteSpace(cluster.ClusterId) || depth > 64)
            {
                return count;
            }

            if (!visitedClusters.Add(cluster.ClusterId))
            {
                return count;
            }

            for (int i = 0; i < cluster.RoomIds.Count; i++)
            {
                GeneratedRoomPlan room;
                if (roomsById.TryGetValue(cluster.RoomIds[i], out room) && MatchesLocationRule(room, rule))
                {
                    count++;
                }
            }

            for (int i = 0; i < cluster.OutdoorZoneIds.Count; i++)
            {
                GeneratedOutdoorZonePlan zone;
                if (zonesById.TryGetValue(cluster.OutdoorZoneIds[i], out zone) && MatchesLocationRule(zone, rule))
                {
                    count++;
                }
            }

            for (int i = 0; i < cluster.ChildClusterIds.Count; i++)
            {
                GeneratedClusterPlan child = layout.FindCluster(cluster.ChildClusterIds[i]);
                count += CountLocationsInClusterRecursive(layout, child, rule, roomsById, zonesById, visitedClusters, depth + 1);
            }

            for (int i = 0; i < layout.Clusters.Count; i++)
            {
                GeneratedClusterPlan maybeChild = layout.Clusters[i];
                if (maybeChild != null && string.Equals(maybeChild.ParentClusterId, cluster.ClusterId, StringComparison.OrdinalIgnoreCase))
                {
                    count += CountLocationsInClusterRecursive(layout, maybeChild, rule, roomsById, zonesById, visitedClusters, depth + 1);
                }
            }

            return count;
        }

        private static bool IsEndpointInsideCluster(string endpointId, GeneratedClusterPlan cluster, GeneratedMapLayout layout, Dictionary<string, GeneratedRoomPlan> roomsById, Dictionary<string, GeneratedOutdoorZonePlan> zonesById)
        {
            if (layout == null || cluster == null || string.IsNullOrWhiteSpace(endpointId))
            {
                return false;
            }

            GeneratedRoomPlan room;
            if (roomsById.TryGetValue(endpointId, out room))
            {
                return string.Equals(room.ClusterId, cluster.ClusterId, StringComparison.OrdinalIgnoreCase) ||
                       cluster.RoomIds.Contains(endpointId) ||
                       IsClusterDescendantOf(room.ClusterId, cluster.ClusterId, layout);
            }

            GeneratedOutdoorZonePlan zone;
            if (zonesById.TryGetValue(endpointId, out zone))
            {
                return string.Equals(zone.ClusterId, cluster.ClusterId, StringComparison.OrdinalIgnoreCase) ||
                       cluster.OutdoorZoneIds.Contains(endpointId) ||
                       IsClusterDescendantOf(zone.ClusterId, cluster.ClusterId, layout);
            }

            return false;
        }

        private static bool IsClusterInsideCluster(GeneratedClusterPlan child, GeneratedClusterPlan parent, GeneratedMapLayout layout)
        {
            if (child == null || parent == null || layout == null)
            {
                return false;
            }

            if (string.Equals(child.ParentClusterId, parent.ClusterId, StringComparison.OrdinalIgnoreCase) || parent.ChildClusterIds.Contains(child.ClusterId))
            {
                return true;
            }

            return IsClusterDescendantOf(child.ClusterId, parent.ClusterId, layout);
        }

        private static bool IsClusterDescendantOf(string childClusterId, string parentClusterId, GeneratedMapLayout layout)
        {
            if (string.IsNullOrWhiteSpace(childClusterId) || string.IsNullOrWhiteSpace(parentClusterId) || layout == null)
            {
                return false;
            }

            GeneratedClusterPlan current = layout.FindCluster(childClusterId);
            int guard = 0;
            while (current != null && !string.IsNullOrWhiteSpace(current.ParentClusterId) && guard++ < 64)
            {
                if (string.Equals(current.ParentClusterId, parentClusterId, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                current = layout.FindCluster(current.ParentClusterId);
            }

            return false;
        }

        private static void ValidateRequiredConnectors(GeneratedMapLayout layout, Dictionary<string, GeneratedRoomPlan> roomsById, MapGenerationValidationOptions options, MapGenerationValidationResult result)
        {
            if (options.RequiredConnectors == null || options.RequiredConnectors.Count == 0)
            {
                return;
            }

            Dictionary<string, GeneratedOutdoorZonePlan> zonesById = BuildOutdoorZoneIndex(layout);

            for (int ruleIndex = 0; ruleIndex < options.RequiredConnectors.Count; ruleIndex++)
            {
                RequiredConnectorRule rule = options.RequiredConnectors[ruleIndex];
                if (rule == null)
                {
                    continue;
                }

                int expected = Math.Max(0, rule.MinCount);
                if (expected <= 0)
                {
                    continue;
                }

                int actual = 0;
                for (int connectorIndex = 0; connectorIndex < layout.Connectors.Count; connectorIndex++)
                {
                    if (MatchesConnectorRule(layout.Connectors[connectorIndex], rule, roomsById, zonesById))
                    {
                        actual++;
                    }
                }

                if (actual < expected)
                {
                    string ruleName = string.IsNullOrWhiteSpace(rule.RuleId) ? DescribeConnectorRule(rule) : rule.RuleId;
                    result.Add(MapGenerationIssueSeverity.Error, "required.connector_missing", $"Required connector '{ruleName}': {actual}, expected at least {expected}.", ruleName);
                }
            }
        }

        private static bool MatchesLocationRule(GeneratedRoomPlan room, RequiredLocationRule rule)
        {
            if (room == null || rule == null)
            {
                return false;
            }

            if (rule.RestrictPlacement && room.Placement != rule.Placement)
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.LocationId) && !string.Equals(room.LocationId, rule.LocationId, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.RequiredTag) && !room.HasTag(rule.RequiredTag))
            {
                return false;
            }

            return !string.IsNullOrWhiteSpace(rule.LocationId) || !string.IsNullOrWhiteSpace(rule.RequiredTag);
        }

        private static bool MatchesLocationRule(GeneratedOutdoorZonePlan zone, RequiredLocationRule rule)
        {
            if (zone == null || rule == null)
            {
                return false;
            }

            if (rule.RestrictPlacement && rule.Placement != GeneratedLocationPlacement.Outdoor)
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.LocationId) && !string.Equals(zone.LocationId, rule.LocationId, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(rule.RequiredTag) && !HasTag(zone.Tags, rule.RequiredTag))
            {
                return false;
            }

            return !string.IsNullOrWhiteSpace(rule.LocationId) || !string.IsNullOrWhiteSpace(rule.RequiredTag);
        }

        private static bool MatchesConnectorRule(GeneratedConnectorPlan connector, RequiredConnectorRule rule, Dictionary<string, GeneratedRoomPlan> roomsById, Dictionary<string, GeneratedOutdoorZonePlan> zonesById)
        {
            if (connector == null || rule == null)
            {
                return false;
            }

            if (rule.RestrictKind && connector.Kind != rule.Kind)
            {
                return false;
            }

            bool forward = MatchesEndpoint(connector.FromId, rule.FromLocationId, rule.FromTag, roomsById, zonesById) &&
                           MatchesEndpoint(connector.ToId, rule.ToLocationId, rule.ToTag, roomsById, zonesById);
            bool backward = MatchesEndpoint(connector.FromId, rule.ToLocationId, rule.ToTag, roomsById, zonesById) &&
                            MatchesEndpoint(connector.ToId, rule.FromLocationId, rule.FromTag, roomsById, zonesById);

            return forward || backward;
        }

        private static bool MatchesEndpoint(string endpointId, string locationId, string tag, Dictionary<string, GeneratedRoomPlan> roomsById, Dictionary<string, GeneratedOutdoorZonePlan> zonesById)
        {
            if (string.IsNullOrWhiteSpace(locationId) && string.IsNullOrWhiteSpace(tag))
            {
                return true;
            }

            GeneratedRoomPlan room;
            if (roomsById.TryGetValue(endpointId, out room))
            {
                if (!string.IsNullOrWhiteSpace(locationId) && !string.Equals(room.LocationId, locationId, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                if (!string.IsNullOrWhiteSpace(tag) && !room.HasTag(tag))
                {
                    return false;
                }

                return true;
            }

            GeneratedOutdoorZonePlan zone;
            if (zonesById.TryGetValue(endpointId, out zone))
            {
                if (!string.IsNullOrWhiteSpace(locationId) && !string.Equals(zone.LocationId, locationId, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                if (!string.IsNullOrWhiteSpace(tag) && !HasTag(zone.Tags, tag))
                {
                    return false;
                }

                return true;
            }

            return false;
        }

        private static Dictionary<string, GeneratedOutdoorZonePlan> BuildOutdoorZoneIndex(GeneratedMapLayout layout)
        {
            Dictionary<string, GeneratedOutdoorZonePlan> index = new Dictionary<string, GeneratedOutdoorZonePlan>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < layout.OutdoorZones.Count; i++)
            {
                GeneratedOutdoorZonePlan zone = layout.OutdoorZones[i];
                if (zone != null && !string.IsNullOrWhiteSpace(zone.ZoneId) && !index.ContainsKey(zone.ZoneId))
                {
                    index.Add(zone.ZoneId, zone);
                }
            }

            return index;
        }

        private static bool HasTag(List<string> tags, string tag)
        {
            if (tags == null || string.IsNullOrWhiteSpace(tag))
            {
                return false;
            }

            for (int i = 0; i < tags.Count; i++)
            {
                if (string.Equals(tags[i], tag, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static string DescribeLocationRule(RequiredLocationRule rule)
        {
            if (rule == null)
            {
                return "location";
            }

            if (!string.IsNullOrWhiteSpace(rule.LocationId))
            {
                return rule.LocationId;
            }

            if (!string.IsNullOrWhiteSpace(rule.RequiredTag))
            {
                return rule.RequiredTag;
            }

            return "location";
        }

        private static string DescribeClusterRule(RequiredClusterRule rule)
        {
            if (rule == null)
            {
                return "cluster";
            }

            if (!string.IsNullOrWhiteSpace(rule.ClusterId))
            {
                return rule.ClusterId;
            }

            if (!string.IsNullOrWhiteSpace(rule.ClusterType))
            {
                return rule.ClusterType;
            }

            if (!string.IsNullOrWhiteSpace(rule.RequiredTag))
            {
                return rule.RequiredTag;
            }

            return "cluster";
        }

        private static string DescribeConnectorRule(RequiredConnectorRule rule)
        {
            if (rule == null)
            {
                return "connector";
            }

            return rule.RestrictKind ? rule.Kind.ToString() : "connector";
        }

        private static void ValidateConnectivity(GeneratedMapLayout layout, Dictionary<string, GeneratedRoomPlan> roomsById, MapGenerationValidationOptions options, MapGenerationValidationResult result)
        {
            if (roomsById.Count == 0)
            {
                return;
            }

            Dictionary<string, List<string>> graph = BuildGraph(layout, roomsById, result);
            string start = ResolveStartRoomId(options, roomsById);
            if (string.IsNullOrWhiteSpace(start) || !graph.ContainsKey(start))
            {
                result.Add(MapGenerationIssueSeverity.Error, "connectivity.no_start", "Cannot resolve start room for connectivity validation.");
                return;
            }

            HashSet<string> visited = FloodFill(start, graph);
            foreach (KeyValuePair<string, GeneratedRoomPlan> pair in roomsById)
            {
                GeneratedRoomPlan room = pair.Value;
                if (room == null || room.Placement != GeneratedLocationPlacement.Indoor)
                {
                    continue;
                }

                if (!visited.Contains(pair.Key))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "connectivity.room_unreachable", "Room is unreachable from start room.", pair.Key);
                }
            }

            if (options.RequireOutdoorConnectivity)
            {
                for (int i = 0; i < layout.OutdoorZones.Count; i++)
                {
                    GeneratedOutdoorZonePlan zone = layout.OutdoorZones[i];
                    if (zone == null || !zone.Required)
                    {
                        continue;
                    }

                    if (!visited.Contains(zone.ZoneId))
                    {
                        result.Add(MapGenerationIssueSeverity.Error, "connectivity.outdoor_unreachable", "Required outdoor zone is unreachable from start room.", zone.ZoneId);
                    }
                }
            }
        }

        private static Dictionary<string, List<string>> BuildGraph(GeneratedMapLayout layout, Dictionary<string, GeneratedRoomPlan> roomsById, MapGenerationValidationResult result)
        {
            Dictionary<string, List<string>> graph = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

            foreach (string roomId in roomsById.Keys)
            {
                EnsureNode(graph, roomId);
            }

            for (int i = 0; i < layout.OutdoorZones.Count; i++)
            {
                GeneratedOutdoorZonePlan zone = layout.OutdoorZones[i];
                if (zone != null && !string.IsNullOrWhiteSpace(zone.ZoneId))
                {
                    EnsureNode(graph, zone.ZoneId);
                }
            }

            for (int i = 0; i < layout.Connectors.Count; i++)
            {
                GeneratedConnectorPlan connector = layout.Connectors[i];
                if (connector == null)
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(connector.FromId) || string.IsNullOrWhiteSpace(connector.ToId))
                {
                    result.Add(MapGenerationIssueSeverity.Error, "connector.bad_endpoint", "Connector has empty endpoint.", connector.ConnectorId);
                    continue;
                }

                EnsureNode(graph, connector.FromId);
                EnsureNode(graph, connector.ToId);
                graph[connector.FromId].Add(connector.ToId);
                graph[connector.ToId].Add(connector.FromId);
            }

            return graph;
        }

        private static void EnsureNode(Dictionary<string, List<string>> graph, string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return;
            }

            if (!graph.ContainsKey(id))
            {
                graph.Add(id, new List<string>());
            }
        }

        private static string ResolveStartRoomId(MapGenerationValidationOptions options, Dictionary<string, GeneratedRoomPlan> roomsById)
        {
            if (!string.IsNullOrWhiteSpace(options.StartRoomId) && roomsById.ContainsKey(options.StartRoomId))
            {
                return options.StartRoomId;
            }

            foreach (KeyValuePair<string, GeneratedRoomPlan> pair in roomsById)
            {
                if (pair.Value != null && pair.Value.Placement == GeneratedLocationPlacement.Indoor)
                {
                    return pair.Key;
                }
            }

            return null;
        }

        private static HashSet<string> FloodFill(string start, Dictionary<string, List<string>> graph)
        {
            HashSet<string> visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Queue<string> queue = new Queue<string>();

            visited.Add(start);
            queue.Enqueue(start);

            while (queue.Count > 0)
            {
                string current = queue.Dequeue();
                List<string> neighbours;
                if (!graph.TryGetValue(current, out neighbours) || neighbours == null)
                {
                    continue;
                }

                for (int i = 0; i < neighbours.Count; i++)
                {
                    string next = neighbours[i];
                    if (string.IsNullOrWhiteSpace(next) || visited.Contains(next))
                    {
                        continue;
                    }

                    visited.Add(next);
                    queue.Enqueue(next);
                }
            }

            return visited;
        }
    }
}
