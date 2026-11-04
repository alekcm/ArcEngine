using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public static class WorldStateCloneUtility
    {
        public static WorldState Clone(WorldState source)
        {
            if (source == null) return null;
            
            WorldState clone = new WorldState
            {
                WorldId = source.WorldId,
                Versions = new WorldVersionInfo 
                { 
                    BuildVersion = source.Versions.BuildVersion, 
                    RuntimeVersion = source.Versions.RuntimeVersion 
                }
            };

            foreach (var obj in source.Build.PlacedObjects)
            {
                clone.Build.PlacedObjects.Add(new PlacedObjectState
                {
                    ObjectId = obj.ObjectId,
                    DefinitionId = obj.DefinitionId,
                    OriginCell = obj.OriginCell,
                    RotationSteps = obj.RotationSteps,
                    RotationY = obj.RotationY,
                    UsesGridPlacement = obj.UsesGridPlacement,
                    BaseY = obj.BaseY,
                    WorldPosition = obj.WorldPosition
                });
            }

            foreach (var wall in source.Build.Walls)
            {
                clone.Build.Walls.Add(new WallSegmentState
                {
                    SegmentId = wall.SegmentId,
                    Edge = wall.Edge,
                    WallDefinitionId = wall.WallDefinitionId,
                    OpeningDefinitionId = wall.OpeningDefinitionId
                });
            }

            return clone;
        }
    }
}
