using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Temporary built-in template factory for the current MVP-2 mansion.
    /// Later this data should come from JSON files and the template editor UI.
    /// </summary>
    public static class DefaultMansionTemplateFactory
    {
        public static MapGenerationTemplateData Create(bool includeCourtroom, bool includeOutdoorYard)
        {
            MapGenerationTemplateData template = new MapGenerationTemplateData
            {
                id = "core.template.mvp2_mansion_clustered",
                name = "MVP-2 Clustered Mansion",
                description = "Two-floor mansion with recursive dormitory/staff/court/outdoor clusters.",
                requireOutdoorConnectivity = includeOutdoorYard
            };

            TemplateClusterRequirementData mansion = Cluster("mansion", "mansion", "mansion", "Особняк", 1);

            TemplateClusterRequirementData dormitory = Cluster("dormitory", "dormitory", "dormitory", "Общежитие", 1);
            dormitory.requiredClusters.Add(Cluster("dorm_wing_floor0", "dorm_wing_floor0", "dorm_wing", "Общежитское крыло 1 этажа", 1, floor: 0));
            dormitory.requiredClusters.Add(Cluster("dorm_wing_floor1", "dorm_wing_floor1", "dorm_wing", "Общежитское крыло 2 этажа", 1, floor: 1));
            dormitory.requiredLocations.Add(Location("personal_rooms", null, "sys:personal_room", 1, true));

            TemplateClusterRequirementData staffArea = Cluster("staff_area", "staff_area", "staff_area", "Зона персонала", 1, floor: 0);

            TemplateClusterRequirementData janitorArea = Cluster("janitor_area", "janitor_area", "janitor_area", "Зона уборщиков", 1, floor: 0);
            janitorArea.requiredClusters.Add(Cluster("janitor_living", "janitor_living", "living_area", "Жилая зона уборщиков", 1, floor: 0));
            janitorArea.requiredClusters.Add(Cluster("janitor_storage", "janitor_storage", "storage_area", "Кладовые уборщиков", 1, floor: 0));
            janitorArea.requiredLocations.Add(Location("janitor_living_room", "core.location.janitor_living", null, 1, false));
            janitorArea.requiredLocations.Add(Location("janitor_storage_room", "core.location.storage", null, 1, false));

            TemplateClusterRequirementData medicalStaffArea = Cluster("medical_staff_area", "medical_staff_area", "medical_staff_area", "Зона медперсонала", 1, floor: 0);
            medicalStaffArea.requiredLocations.Add(Location("medical_room", null, "medbay", 1, false));

            staffArea.requiredClusters.Add(janitorArea);
            staffArea.requiredClusters.Add(medicalStaffArea);

            mansion.requiredClusters.Add(dormitory);
            mansion.requiredClusters.Add(staffArea);
            mansion.requiredLocations.Add(Location("kitchen", null, "kitchen", 1, false));

            if (includeCourtroom)
            {
                TemplateClusterRequirementData courtBlock = Cluster("court_block", "court_block", "court_block", "Судебный блок", 1, floor: -1);
                courtBlock.requiredLocations.Add(Location("courtroom", null, "sys:courtroom", 1, false));
                mansion.requiredClusters.Add(courtBlock);

                template.requiredConnectors.Add(new TemplateConnectorRequirementData
                {
                    ruleId = "elevator_to_courtroom",
                    kind = GeneratedConnectorKind.Elevator,
                    restrictKind = true,
                    toTag = "sys:courtroom",
                    minCount = 1
                });
            }

            template.requiredClusters.Add(mansion);

            if (includeOutdoorYard)
            {
                TemplateClusterRequirementData outdoor = Cluster("outdoor_grounds", "outdoor_grounds", "outdoor_grounds", "Территория вокруг особняка", 1, placement: GeneratedLocationPlacement.Outdoor);
                outdoor.restrictPlacement = true;
                outdoor.requiredLocations.Add(new TemplateLocationRequirementData
                {
                    ruleId = "yard",
                    requiredTag = "yard",
                    minCount = 1,
                    placement = GeneratedLocationPlacement.Outdoor,
                    restrictPlacement = true
                });
                template.requiredClusters.Add(outdoor);
            }

            return template;
        }

        private static TemplateClusterRequirementData Cluster(
            string ruleId,
            string clusterId,
            string clusterType,
            string displayName,
            int minCount,
            int floor = 0,
            GeneratedLocationPlacement placement = GeneratedLocationPlacement.Indoor)
        {
            return new TemplateClusterRequirementData
            {
                ruleId = ruleId,
                clusterId = clusterId,
                clusterType = clusterType,
                displayName = displayName,
                minCount = Mathf.Max(0, minCount),
                floor = floor,
                restrictFloor = true,
                placement = placement,
                restrictPlacement = placement != GeneratedLocationPlacement.Indoor
            };
        }

        private static TemplateLocationRequirementData Location(string ruleId, string locationId, string requiredTag, int minCount, bool countPerPlayer)
        {
            return new TemplateLocationRequirementData
            {
                ruleId = ruleId,
                locationId = locationId,
                requiredTag = requiredTag,
                minCount = Mathf.Max(0, minCount),
                countPerPlayer = countPerPlayer
            };
        }
    }
}
