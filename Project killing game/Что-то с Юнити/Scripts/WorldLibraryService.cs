using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace MapEditorPrototype
{
    [Serializable]
    public class WorldSaveSlotInfo
    {
        public string WorldId;
        public string DisplayName;
        public string RelativeFilePath;
        public string FullPath;
    }

        public static class WorldLibraryService
    {
        private const string WorldsFolderName = "WorldSaves";

        public static List<WorldSaveSlotInfo> GetWorlds()
        {
            string folderPath = GetWorldsFolderPath();
            if (!Directory.Exists(folderPath))
            {
                Directory.CreateDirectory(folderPath);
            }

            string[] files = Directory.GetFiles(folderPath, "*.json", SearchOption.TopDirectoryOnly);
            List<WorldSaveSlotInfo> worlds = new List<WorldSaveSlotInfo>(files.Length);

            for (int i = 0; i < files.Length; i++)
            {
                string fullPath = files[i];
                string fileName = Path.GetFileName(fullPath);
                string relativePath = Path.Combine(WorldsFolderName, fileName).Replace('\\', '/');
                string json = File.ReadAllText(fullPath);

                MapSaveData saveData = null;
                try
                {
                    saveData = JsonUtility.FromJson<MapSaveData>(json);
                }
                catch
                {
                }

                string displayName = Path.GetFileNameWithoutExtension(fileName);
                worlds.Add(new WorldSaveSlotInfo
                {
                    WorldId = saveData != null && !string.IsNullOrWhiteSpace(saveData.worldId) ? saveData.worldId : displayName,
                    DisplayName = displayName,
                    RelativeFilePath = relativePath,
                    FullPath = fullPath
                });
            }

            worlds.Sort((a, b) => string.Compare(a.DisplayName, b.DisplayName, StringComparison.OrdinalIgnoreCase));
            return worlds;
        }

        public static WorldSaveSlotInfo CreateWorld(string displayName)
        {
            string safeName = SanitizeFileName(string.IsNullOrWhiteSpace(displayName) ? "NewWorld" : displayName);
            string worldId = Guid.NewGuid().ToString("N");
            string fileName = safeName + "_" + worldId.Substring(0, 8) + ".json";
            string relativePath = Path.Combine(WorldsFolderName, fileName).Replace('\\', '/');
            string fullPath = GetFullPath(relativePath);

            WorldState state = new WorldState
            {
                WorldId = worldId
            };

            WorldStateSerializationService serializer = new WorldStateSerializationService(true);
            string json = serializer.Serialize(state);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
            File.WriteAllText(fullPath, json);

            return new WorldSaveSlotInfo
            {
                WorldId = worldId,
                DisplayName = safeName,
                RelativeFilePath = relativePath,
                FullPath = fullPath
            };
        }

        public static bool DeleteWorld(WorldSaveSlotInfo slot)
        {
            if (slot == null || string.IsNullOrWhiteSpace(slot.FullPath) || !File.Exists(slot.FullPath))
            {
                return false;
            }

            File.Delete(slot.FullPath);
            return true;
        }

        public static string GetFullPath(string relativeFilePath)
        {
            return Path.Combine(Application.persistentDataPath, relativeFilePath);
        }

        public static bool Exists(string relativeFilePath)
        {
            return File.Exists(GetFullPath(relativeFilePath));
        }

        public static string GetWorldsFolderPath()
        {
            return Path.Combine(Application.persistentDataPath, WorldsFolderName);
        }

        private static string SanitizeFileName(string value)
        {
            char[] invalidChars = Path.GetInvalidFileNameChars();
            for (int i = 0; i < invalidChars.Length; i++)
            {
                value = value.Replace(invalidChars[i], '_');
            }

            return value.Trim();
        }
    }
}
