// ОБНОВЛЕНО для этажей. ЗАМЕНЯЕТ Assets/Scripts/WorldNetworkDtoMapper.cs.
using UnityEngine;

namespace MapEditorPrototype
{
    public static class WorldNetworkDtoMapper
    {
        public static WorldSnapshotDto ToSnapshotDto(WorldState worldState)
        {
            WorldSnapshotDto dto = new WorldSnapshotDto();
            if (worldState == null)
            {
                return dto;
            }

            dto.worldId = worldState.WorldId;
            dto.buildVersion = worldState.Versions != null ? worldState.Versions.BuildVersion : 0;
            dto.runtimeVersion = worldState.Versions != null ? worldState.Versions.RuntimeVersion : 0;
            dto.explorerPosition = ToVector3Dto(worldState.Runtime != null ? worldState.Runtime.ExplorerPosition : Vector3.zero);
            dto.explorerYaw = worldState.Runtime != null ? worldState.Runtime.ExplorerYaw : 0f;

            if (worldState.Build != null)
            {
                for (int i = 0; i < worldState.Build.PlacedObjects.Count; i++)
                {
                    dto.placedObjects.Add(ToPlacedObjectDto(worldState.Build.PlacedObjects[i]));
                }

                for (int i = 0; i < worldState.Build.Walls.Count; i++)
                {
                    dto.walls.Add(ToWallDto(worldState.Build.Walls[i]));
                }

                for (int i = 0; i < worldState.Build.PathStrokes.Count; i++)
                {
                    dto.pathStrokes.Add(ToPathDto(worldState.Build.PathStrokes[i]));
                }
            }

            return dto;
        }

        public static WorldState FromSnapshotDto(WorldSnapshotDto dto)
        {
            WorldState state = new WorldState();
            if (dto == null)
            {
                return state;
            }

            state.WorldId = dto.worldId;
            state.Versions.BuildVersion = dto.buildVersion;
            state.Versions.RuntimeVersion = dto.runtimeVersion;
            state.Runtime.ExplorerPosition = ToVector3(dto.explorerPosition);
            state.Runtime.ExplorerYaw = dto.explorerYaw;

            if (dto.placedObjects != null)
            {
                for (int i = 0; i < dto.placedObjects.Count; i++)
                {
                    state.Build.PlacedObjects.Add(ToPlacedObjectState(dto.placedObjects[i]));
                }
            }

            if (dto.walls != null)
            {
                for (int i = 0; i < dto.walls.Count; i++)
                {
                    state.Build.Walls.Add(ToWallState(dto.walls[i]));
                }
            }

            if (dto.pathStrokes != null)
            {
                for (int i = 0; i < dto.pathStrokes.Count; i++)
                {
                    state.Build.PathStrokes.Add(ToPathState(dto.pathStrokes[i]));
                }
            }

            return state;
        }

        public static WorldPatchDto ToPatchDto(WorldPatch patch)
        {
            WorldPatchDto dto = new WorldPatchDto();
            if (patch == null)
            {
                return dto;
            }

            dto.worldId = patch.WorldId;
            dto.baseBuildVersion = patch.BaseBuildVersion;
            dto.newBuildVersion = patch.NewBuildVersion;

            for (int i = 0; i < patch.UpsertPlacedObjects.Count; i++)
            {
                dto.upsertPlacedObjects.Add(ToPlacedObjectDto(patch.UpsertPlacedObjects[i]));
            }
            dto.deletePlacedObjectIds.AddRange(patch.DeletePlacedObjectIds);

            for (int i = 0; i < patch.UpsertWalls.Count; i++)
            {
                dto.upsertWalls.Add(ToWallDto(patch.UpsertWalls[i]));
            }
            dto.deleteWallIds.AddRange(patch.DeleteWallIds);

            for (int i = 0; i < patch.UpsertPaths.Count; i++)
            {
                dto.upsertPaths.Add(ToPathDto(patch.UpsertPaths[i]));
            }
            dto.deletePathIds.AddRange(patch.DeletePathIds);

            return dto;
        }

        public static WorldPatch FromPatchDto(WorldPatchDto dto)
        {
            WorldPatch patch = new WorldPatch();
            if (dto == null)
            {
                return patch;
            }

            patch.WorldId = dto.worldId;
            patch.BaseBuildVersion = dto.baseBuildVersion;
            patch.NewBuildVersion = dto.newBuildVersion;

            if (dto.upsertPlacedObjects != null)
            {
                for (int i = 0; i < dto.upsertPlacedObjects.Count; i++)
                {
                    patch.UpsertPlacedObjects.Add(ToPlacedObjectState(dto.upsertPlacedObjects[i]));
                }
            }
            patch.DeletePlacedObjectIds.AddRange(dto.deletePlacedObjectIds);

            if (dto.upsertWalls != null)
            {
                for (int i = 0; i < dto.upsertWalls.Count; i++)
                {
                    patch.UpsertWalls.Add(ToWallState(dto.upsertWalls[i]));
                }
            }
            patch.DeleteWallIds.AddRange(dto.deleteWallIds);

            if (dto.upsertPaths != null)
            {
                for (int i = 0; i < dto.upsertPaths.Count; i++)
                {
                    patch.UpsertPaths.Add(ToPathState(dto.upsertPaths[i]));
                }
            }
            patch.DeletePathIds.AddRange(dto.deletePathIds);

            return patch;
        }

        public static PlacedObjectDto ToPlacedObjectDto(PlacedObjectState state)
        {
            return state == null ? null : new PlacedObjectDto
            {
                objectId = state.ObjectId,
                definitionId = state.DefinitionId,
                originX = state.OriginCell.x,
                originY = state.OriginCell.y,
                rotationSteps = state.RotationSteps,
                rotationY = state.RotationY,
                usesGridPlacement = state.UsesGridPlacement,
                baseY = state.BaseY,
                worldPosition = ToVector3Dto(state.WorldPosition)
            };
        }

        public static PlacedObjectState ToPlacedObjectState(PlacedObjectDto dto)
        {
            return dto == null ? null : new PlacedObjectState
            {
                ObjectId = dto.objectId,
                DefinitionId = dto.definitionId,
                OriginCell = new Vector2Int(dto.originX, dto.originY),
                RotationSteps = dto.rotationSteps,
                RotationY = dto.rotationY,
                UsesGridPlacement = dto.usesGridPlacement,
                BaseY = dto.baseY,
                WorldPosition = ToVector3(dto.worldPosition)
            };
        }

        public static WallSegmentDto ToWallDto(WallSegmentState state)
        {
            return state == null ? null : new WallSegmentDto
            {
                segmentId = state.SegmentId,
                x = state.Edge.x,
                y = state.Edge.y,
                orientation = (int)state.Edge.orientation,
                level = state.Edge.level,
                wallDefinitionId = state.WallDefinitionId,
                openingDefinitionId = state.OpeningDefinitionId
            };
        }

        public static WallSegmentState ToWallState(WallSegmentDto dto)
        {
            return dto == null ? null : new WallSegmentState
            {
                SegmentId = dto.segmentId,
                Edge = new WallEdge(dto.x, dto.y, (WallOrientation)dto.orientation, dto.level),
                WallDefinitionId = dto.wallDefinitionId,
                OpeningDefinitionId = dto.openingDefinitionId
            };
        }

        public static PathStrokeDto ToPathDto(PathStrokeState state)
        {
            if (state == null)
            {
                return null;
            }

            PathStrokeDto dto = new PathStrokeDto
            {
                strokeId = state.StrokeId,
                definitionId = state.DefinitionId,
                width = state.Width
            };

            for (int i = 0; i < state.ControlPoints.Count; i++)
            {
                dto.controlPoints.Add(ToVector3Dto(state.ControlPoints[i]));
            }

            return dto;
        }

        public static PathStrokeState ToPathState(PathStrokeDto dto)
        {
            if (dto == null)
            {
                return null;
            }

            PathStrokeState state = new PathStrokeState
            {
                StrokeId = dto.strokeId,
                DefinitionId = dto.definitionId,
                Width = dto.width
            };

            if (dto.controlPoints != null)
            {
                for (int i = 0; i < dto.controlPoints.Count; i++)
                {
                    state.ControlPoints.Add(ToVector3(dto.controlPoints[i]));
                }
            }

            return state;
        }

        public static Vector3Dto ToVector3Dto(Vector3 value)
        {
            return new Vector3Dto(value.x, value.y, value.z);
        }

        public static Vector3 ToVector3(Vector3Dto value)
        {
            return new Vector3(value.x, value.y, value.z);
        }
    }
}
