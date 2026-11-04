using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    [Serializable]
    public class PlannedRoomSlot
    {
        public string slotId;
        public string roomId;
        public string locationId;
        public string displayName;
        public string clusterId;
        public int floor;
        public RectInt rect;
        public bool required;
        public readonly List<string> tags = new List<string>();
    }

    [Serializable]
    public class PlannedFloorLayout
    {
        public int floor;
        public RectInt bounds;
        public readonly List<Vector2Int> corridorCells = new List<Vector2Int>();
        public readonly List<PlannedRoomSlot> roomSlots = new List<PlannedRoomSlot>();
    }

    /// <summary>
    /// Converts planned cluster bounds into concrete room rectangles for the current
    /// MVP mansion spine layout.
    ///
    /// This class is intentionally separate from WorldState export: it only decides
    /// which room should occupy which rectangle. Walls/floors/objects remain the job
    /// of ClusteredMansionMapGenerator for now.
    /// </summary>
    public class ClusterRoomSlotPlanner
    {
        public List<PlannedFloorLayout> PlanMansionSpineRooms(
            GeneratedMapLayout layout,
            int playerCount,
            int buildingWidth,
            int buildingLength,
            int corridorWidth,
            int roomDepth,
            int roomLength)
        {
            List<PlannedFloorLayout> floors = new List<PlannedFloorLayout>();
            RectInt building = ResolveClusterBounds(layout, "mansion", new RectInt(0, 0, buildingWidth, buildingLength));
            int corridorX = Mathf.Clamp((building.width - corridorWidth) / 2 + building.xMin, building.xMin + roomDepth + 1, building.xMax - roomDepth - corridorWidth - 1);
            int rightRoomX = corridorX + corridorWidth;
            int roomRows = Mathf.Max(1, (building.height - 2) / roomLength);
            int personalRoomIndex = 0;

            for (int floor = 0; floor <= 1; floor++)
            {
                PlannedFloorLayout floorLayout = new PlannedFloorLayout
                {
                    floor = floor,
                    bounds = building
                };

                for (int z = building.yMin + 1; z < building.yMax - 1; z++)
                {
                    for (int x = corridorX; x < corridorX + corridorWidth; x++)
                    {
                        floorLayout.corridorCells.Add(new Vector2Int(x, z));
                    }
                }

                for (int row = 0; row < roomRows; row++)
                {
                    int z = building.yMin + 1 + row * roomLength;
                    int length = Mathf.Min(roomLength, building.yMax - 1 - z);
                    if (length < 4)
                    {
                        continue;
                    }

                    int leftRoomX = building.xMin + 1;
                    int leftRoomWidth = Mathf.Max(1, corridorX - leftRoomX);
                    int rightRoomWidth = Mathf.Max(1, building.xMax - rightRoomX - 1);

                    RectInt leftRect = new RectInt(leftRoomX, z, leftRoomWidth, length);
                    RectInt rightRect = new RectInt(rightRoomX, z, rightRoomWidth, length);

                    if (floor == 0 && row == 0)
                    {
                        floorLayout.roomSlots.Add(CreateSlot("janitor_living_room", "core.location.janitor_living", "Жилая комната уборщиков", "janitor_living", floor, leftRect, false, "cat:living", "cat:janitor"));
                        floorLayout.roomSlots.Add(CreateSlot("medical_room", "core.location.medical_room", "Медпункт", "medical_staff_area", floor, rightRect, true, "cat:medical", "medbay"));
                    }
                    else if (floor == 0 && row == 1)
                    {
                        floorLayout.roomSlots.Add(CreateSlot("janitor_storage_room", "core.location.storage", "Кладовая уборщиков", "janitor_storage", floor, leftRect, true, "cat:storage"));
                        floorLayout.roomSlots.Add(CreateSlot("kitchen", "core.location.kitchen", "Кухня", "mansion", floor, rightRect, true, "cat:kitchen", "kitchen"));
                    }
                    else
                    {
                        if (personalRoomIndex < playerCount)
                        {
                            string clusterId = floor == 0 ? "dorm_wing_floor0" : "dorm_wing_floor1";
                            floorLayout.roomSlots.Add(CreatePersonalRoomSlot(personalRoomIndex++, clusterId, floor, leftRect));
                        }

                        if (personalRoomIndex < playerCount)
                        {
                            string clusterId = floor == 0 ? "dorm_wing_floor0" : "dorm_wing_floor1";
                            floorLayout.roomSlots.Add(CreatePersonalRoomSlot(personalRoomIndex++, clusterId, floor, rightRect));
                        }
                    }
                }

                floors.Add(floorLayout);
            }

            return floors;
        }

        private static PlannedRoomSlot CreatePersonalRoomSlot(int index, string clusterId, int floor, RectInt rect)
        {
            PlannedRoomSlot slot = CreateSlot(
                "personal_room_" + (index + 1),
                "core.location.personal_room",
                "Комната игрока " + (index + 1),
                clusterId,
                floor,
                rect,
                true,
                "sys:personal_room",
                "cat:bedroom");
            slot.slotId = "personal_room_slot_" + (index + 1);
            return slot;
        }

        private static PlannedRoomSlot CreateSlot(string roomId, string locationId, string displayName, string clusterId, int floor, RectInt rect, bool required, params string[] tags)
        {
            PlannedRoomSlot slot = new PlannedRoomSlot
            {
                slotId = roomId + "_slot",
                roomId = roomId,
                locationId = locationId,
                displayName = displayName,
                clusterId = clusterId,
                floor = floor,
                rect = rect,
                required = required
            };

            if (tags != null)
            {
                slot.tags.AddRange(tags);
            }

            return slot;
        }

        private static RectInt ResolveClusterBounds(GeneratedMapLayout layout, string clusterId, RectInt fallback)
        {
            GeneratedClusterPlan cluster = layout?.FindCluster(clusterId);
            if (cluster == null || cluster.Bounds.width <= 0 || cluster.Bounds.height <= 0)
            {
                return fallback;
            }

            return cluster.Bounds;
        }
    }
}
