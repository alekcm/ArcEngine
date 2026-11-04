using System;

namespace MapEditorPrototype
{
    [Serializable]
    public class RelayAllocationData
    {
        public string JoinCode;
        public string Host;
        public ushort Port;
        public byte[] AllocationIdBytes;
        public byte[] KeyBytes;
        public byte[] ConnectionData;
        public byte[] HostConnectionData;
        public bool IsSecure;
    }
}
