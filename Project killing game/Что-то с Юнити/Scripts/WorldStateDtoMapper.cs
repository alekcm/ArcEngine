// ОБНОВЛЕНО для этажей. ЗАМЕНЯЕТ Assets/Scripts/WorldStateDtoMapper.cs.
using UnityEngine;

namespace MapEditorPrototype
{
    public static class WorldStateDtoMapper
    {
        public static MapSaveData ToSaveData(WorldState worldState)
        {
            MapSaveData data = new MapSaveData();
            if (worldState == null)
            {
                return data;
            }

            data.worldId = worldState.WorldId;
            data.buildVersion = worldState.Versions != null ? worldState.Versions.BuildVersion : 0;
            data.runtimeVersion = worldState.Versions != null ? worldState.Versions.RuntimeVersion : 0;

            if (worldState.Build != null)
            {
                for (int i = 0; i < worldState.Build.PlacedObjects.Count; i++)
                {
                    PlacedObjectState item = worldState.Build.PlacedObjects[i];
                    if (item == null)
                    {
                        continue;
                    }

                    data.placedObjects.Add(new PlacedObjectSaveData
                    {
                        objectId = item.ObjectId,
                        definitionId = item.DefinitionId,
                        originX = item.OriginCell.x,
                        originY = item.OriginCell.y,
                        rotationSteps = item.RotationSteps,
                        rotationY = item.RotationY,
                        useGridPlacement = item.UsesGridPlacement,
                        baseY = item.BaseY,
                        worldPosition = new SerializableVector3(item.WorldPosition)
                    });
                }

                for (int i = 0; i < worldState.Build.Walls.Count; i++)
                {
                    WallSegmentState item = worldState.Build.Walls[i];
                    if (item == null)
                    {
                        continue;
                    }

                    data.walls.Add(new WallSegmentSaveData
                    {
                        segmentId = item.SegmentId,
                        x = item.Edge.x,
                        y = item.Edge.y,
                        orientation = (int)item.Edge.orientation,
                        level = item.Edge.level,
                        wallDefinitionId = item.WallDefinitionId,
                        openingDefinitionId = item.OpeningDefinitionId
                    });
                }

                for (int i = 0; i < worldState.Build.PathStrokes.Count; i++)
                {
                    PathStrokeState item = worldState.Build.PathStrokes[i];
                    if (item == null)
                    {
                        continue;
                    }

                    PathStrokeSaveData strokeData = new PathStrokeSaveData
                    {
                        strokeId = item.StrokeId,
                        definitionId = item.DefinitionId,
                        width = item.Width
                    };

                    for (int pointIndex = 0; pointIndex < item.ControlPoints.Count; pointIndex++)
                    {
                        strokeData.controlPoints.Add(new SerializableVector3(item.ControlPoints[pointIndex]));
                    }

                    data.pathStrokes.Add(strokeData);
                }
            }

            if (worldState.Runtime != null)
            {
                data.explorerPosition = new SerializableVector3(worldState.Runtime.ExplorerPosition);
                data.explorerYaw = worldState.Runtime.ExplorerYaw;
            }

            return data;
        }

        public static WorldState FromSaveData(MapSaveData data)
        {
            WorldState worldState = new WorldState();
            if (data == null)
            {
                worldState.WorldId = System.Guid.NewGuid().ToString("N");
                return worldState;
            }

            worldState.WorldId = string.IsNullOrWhiteSpace(data.worldId) ? System.Guid.NewGuid().ToString("N") : data.worldId;
            worldState.Versions.BuildVersion = data.buildVersion;
            worldState.Versions.RuntimeVersion = data.runtimeVersion;

            if (data.placedObjects != null)
            {
                for (int i = 0; i < data.placedObjects.Count; i++)
                {
                    PlacedObjectSaveData item = data.placedObjects[i];
                    if (item == null)
                    {
                        continue;
                    }

                    worldState.Build.PlacedObjects.Add(new PlacedObjectState
                    {
                        ObjectId = item.objectId,
                        DefinitionId = item.definitionId,
                        OriginCell = new Vector2Int(item.originX, item.originY),
                        RotationSteps = item.rotationSteps,
                        RotationY = item.rotationY,
                        UsesGridPlacement = item.useGridPlacement,
                        BaseY = item.baseY,
                        WorldPosition = item.worldPosition.ToVector3()
                    });
                }
            }

            if (data.walls != null)
            {
                for (int i = 0; i < data.walls.Count; i++)
                {
                    WallSegmentSaveData item = data.walls[i];
                    if (item == null)
                    {
                        continue;
                    }

                    worldState.Build.Walls.Add(new WallSegmentState
                    {
                        SegmentId = item.segmentId,
                        Edge = new WallEdge(item.x, item.y, (WallOrientation)item.orientation, item.level),
                        WallDefinitionId = item.wallDefinitionId,
                        OpeningDefinitionId = item.openingDefinitionId
                    });
                }
            }

            if (data.pathStrokes != null)
            {
                for (int i = 0; i < data.pathStrokes.Count; i++)
                {
                    PathStrokeSaveData item = data.pathStrokes[i];
                    if (item == null)
                    {
                        continue;
                    }

                    PathStrokeState strokeState = new PathStrokeState
                    {
                        StrokeId = item.strokeId,
                        DefinitionId = item.definitionId,
                        Width = item.width
                    };

                    if (item.controlPoints != null)
                    {
                        for (int pointIndex = 0; pointIndex < item.controlPoints.Count; pointIndex++)
                        {
                            strokeState.ControlPoints.Add(item.controlPoints[pointIndex].ToVector3());
                        }
                    }

                    worldState.Build.PathStrokes.Add(strokeState);
                }
            }

            worldState.Runtime.ExplorerPosition = data.explorerPosition.ToVector3();
            worldState.Runtime.ExplorerYaw = data.explorerYaw;
            return worldState;
        }
    }
}
