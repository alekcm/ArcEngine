using System;

namespace MapEditorPrototype
{
    public enum SessionLaunchMode
    {
        None,
        SoloEdit,
        HostRelay,
        JoinRelay,
        HostLan,
        JoinLan
    }

    [Serializable]
    public class GameLaunchConfig
    {
        public SessionLaunchMode Mode = SessionLaunchMode.None;
        public string WorldId;
        public string WorldFileName;
        public string JoinCode;
        public string Address;
        public ushort Port = 7777;
    }

    public static class GameLaunchContext
    {
        public static GameLaunchConfig Current { get; private set; } = new GameLaunchConfig();

        public static void SetSoloEdit(WorldSaveSlotInfo slot)
        {
            Current = new GameLaunchConfig
            {
                Mode = SessionLaunchMode.SoloEdit,
                WorldId = slot != null ? slot.WorldId : string.Empty,
                WorldFileName = slot != null ? slot.RelativeFilePath : string.Empty
            };
        }

        public static void SetHostRelay(WorldSaveSlotInfo slot)
        {
            Current = new GameLaunchConfig
            {
                Mode = SessionLaunchMode.HostRelay,
                WorldId = slot != null ? slot.WorldId : string.Empty,
                WorldFileName = slot != null ? slot.RelativeFilePath : string.Empty
            };
        }

        public static void SetJoinRelay(string joinCode)
        {
            Current = new GameLaunchConfig
            {
                Mode = SessionLaunchMode.JoinRelay,
                JoinCode = joinCode
            };
        }

        public static void SetHostLan(WorldSaveSlotInfo slot, ushort port)
        {
            Current = new GameLaunchConfig
            {
                Mode = SessionLaunchMode.HostLan,
                WorldId = slot != null ? slot.WorldId : string.Empty,
                WorldFileName = slot != null ? slot.RelativeFilePath : string.Empty,
                Port = port
            };
        }

        public static void SetJoinLan(string address, ushort port)
        {
            Current = new GameLaunchConfig
            {
                Mode = SessionLaunchMode.JoinLan,
                Address = address,
                Port = port
            };
        }

        public static void Clear()
        {
            Current = new GameLaunchConfig();
        }
    }
}
