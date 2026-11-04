using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Библиотека лодаутов мебели (*.loadout.json): скан папок, индекс по
    /// characterId, и резолв «(playerId, категория слота) → штамп-id'ы».
    ///
    /// Папки:
    ///   StreamingAssets/MapGen/Loadouts/*.loadout.json    — встроенные/дефолтные
    ///   persistentDataPath/MapGen/Loadouts/*.loadout.json — профили игроков
    ///
    /// Личные комнаты генерируются под игроков (owner = "player_N"). Реального
    /// сопоставления player→character на этом этапе ещё нет (это MVP-5/лобби),
    /// поэтому поддержан опциональный map: AssignCharacter(playerId, characterId).
    /// Если map не задан — playerId трактуется как characterId напрямую
    /// (можно положить файл лодаута с characterId == "player_1" и проверить).
    /// </summary>
    public class LoadoutLibraryService : MonoBehaviour
    {
        public event Action LibraryChanged;

        private readonly List<LoadoutEntry> entries = new List<LoadoutEntry>();
        private readonly Dictionary<string, LoadoutEntry> byCharacter =
            new Dictionary<string, LoadoutEntry>(StringComparer.OrdinalIgnoreCase);

        // player_N → characterId (опционально; заполняется лобби в будущем).
        private readonly Dictionary<string, string> playerToCharacter =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public IReadOnlyList<LoadoutEntry> Entries => entries;

        public class LoadoutEntry
        {
            public FurnitureLoadoutData Data;
            public string FilePath;
            public bool IsUserContent;
            public bool IsValid;
            public List<string> Errors = new List<string>();
        }

        public static string UserLoadoutsDirectory =>
            Path.Combine(Application.persistentDataPath, "MapGen", "Loadouts");

        public static string CoreLoadoutsDirectory =>
            Path.Combine(Application.streamingAssetsPath, "MapGen", "Loadouts");

        private void Awake()
        {
            Reload();
        }

        public void Reload()
        {
            entries.Clear();
            byCharacter.Clear();

            LoadDirectory(CoreLoadoutsDirectory, isUser: false);
            LoadDirectory(UserLoadoutsDirectory, isUser: true);

            LibraryChanged?.Invoke();
        }

        private void LoadDirectory(string directory, bool isUser)
        {
            if (!Directory.Exists(directory))
            {
                if (isUser)
                {
                    Directory.CreateDirectory(directory);
                }
                return;
            }

            foreach (string file in Directory
                         .GetFiles(directory, "*.loadout.json", SearchOption.TopDirectoryOnly)
                         .OrderBy(f => f))
            {
                LoadoutEntry entry = new LoadoutEntry { FilePath = file, IsUserContent = isUser };

                try
                {
                    entry.Data = JsonUtility.FromJson<FurnitureLoadoutData>(File.ReadAllText(file));
                }
                catch (Exception e)
                {
                    entry.Errors.Add($"Не удалось прочитать JSON: {e.Message}");
                }

                if (entry.Data == null && entry.Errors.Count == 0)
                {
                    entry.Errors.Add("Пустой или нечитаемый файл.");
                }

                if (entry.Data != null && string.IsNullOrWhiteSpace(entry.Data.characterId))
                {
                    entry.Errors.Add("Не задан characterId.");
                }

                entry.IsValid = entry.Errors.Count == 0;
                entries.Add(entry);

                if (entry.IsValid)
                {
                    byCharacter[entry.Data.characterId] = entry;
                }
                else
                {
                    Debug.LogWarning($"[LoadoutLibrary] '{Path.GetFileName(file)}' отклонён: " +
                                     string.Join("; ", entry.Errors));
                }
            }
        }

        public FurnitureLoadoutData FindByCharacter(string characterId)
        {
            return !string.IsNullOrWhiteSpace(characterId) && byCharacter.TryGetValue(characterId, out LoadoutEntry e)
                ? e.Data
                : null;
        }

        /// <summary>Сопоставить игрока лобби конкретному персонажу (для будущей интеграции).</summary>
        public void AssignCharacter(string playerId, string characterId)
        {
            if (string.IsNullOrWhiteSpace(playerId)) return;
            if (string.IsNullOrWhiteSpace(characterId)) playerToCharacter.Remove(playerId);
            else playerToCharacter[playerId] = characterId;
        }

        public void ClearAssignments()
        {
            playerToCharacter.Clear();
        }

        /// <summary>
        /// Резолв для RoomFurnisher.LoadoutResolver:
        /// (playerId, категория слота) → список штамп-id из лодаута владельца.
        /// null/пусто — лодаута нет (генератор уйдёт на дефолты/теги).
        /// </summary>
        public IReadOnlyList<string> Resolve(string playerId, string loadoutCategory)
        {
            if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(loadoutCategory))
            {
                return null;
            }

            string characterId = playerToCharacter.TryGetValue(playerId, out string mapped) ? mapped : playerId;
            FurnitureLoadoutData loadout = FindByCharacter(characterId);
            return loadout?.GetChoice(loadoutCategory);
        }
    }
}
