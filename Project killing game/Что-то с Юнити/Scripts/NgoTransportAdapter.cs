using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;

namespace MapEditorPrototype
{
    public class NgoTransportAdapter : MonoBehaviour
    {
        [SerializeField] private GameObject networkManagerObject;

        public bool IsAvailable => ResolveNetworkManager() != null && ResolveTransport() != null;

        public bool StartHostWithRelay(RelayAllocationData relayData)
        {
            Debug.Log("[NgoAdapter] StartHostWithRelay called.");
            if (relayData == null || !ConfigureRelayAsHost(relayData))
            {
                Debug.LogError("[NgoAdapter] Relay configuration failed.");
                return false;
            }

            bool result = InvokeNetworkManagerBoolMethod("StartHost");
            Debug.Log($"[NgoAdapter] StartHost result: {result}");
            return result;
        }

        public bool StartClientWithRelay(RelayAllocationData relayData)
        {
            Debug.Log("[NgoAdapter] StartClientWithRelay called.");
            if (relayData == null || !ConfigureRelayAsClient(relayData))
            {
                Debug.LogError("[NgoAdapter] Relay configuration failed.");
                return false;
            }

            bool result = InvokeNetworkManagerBoolMethod("StartClient");
            Debug.Log($"[NgoAdapter] StartClient result: {result}");
            return result;
        }

        public bool StartHostLan(ushort port, string listenAddress = "0.0.0.0")
        {
            if (!ConfigureLanAsHost(port, listenAddress))
            {
                return false;
            }

            return InvokeNetworkManagerBoolMethod("StartHost");
        }

        public bool StartClientLan(string address, ushort port)
        {
            if (!ConfigureLanAsClient(address, port))
            {
                return false;
            }

            return InvokeNetworkManagerBoolMethod("StartClient");
        }

        public void Shutdown()
        {
            object networkManager = ResolveNetworkManager();
            networkManager?.GetType().GetMethod("Shutdown", BindingFlags.Public | BindingFlags.Instance)?.Invoke(networkManager, null);
        }

        public ulong GetServerClientId()
        {
            object networkManager = ResolveNetworkManager();
            object value = networkManager?.GetType().GetProperty("ServerClientId", BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static)?.GetValue(networkManager);
            return value != null ? Convert.ToUInt64(value) : 0UL;
        }

        public List<ulong> GetConnectedClientIds(bool includeServer = false)
        {
            List<ulong> results = new List<ulong>();
            object networkManager = ResolveNetworkManager();
            if (networkManager == null)
            {
                return results;
            }

            object collection = networkManager.GetType().GetProperty("ConnectedClientsIds", BindingFlags.Public | BindingFlags.Instance)?.GetValue(networkManager);
            if (collection is System.Collections.IEnumerable enumerable)
            {
                foreach (object item in enumerable)
                {
                    ulong clientId = Convert.ToUInt64(item);
                    if (includeServer || clientId != GetServerClientId())
                    {
                        results.Add(clientId);
                    }
                }
            }

            return results;
        }

        private bool ConfigureRelayAsHost(RelayAllocationData data)
        {
            object transport = ResolveTransport();
            if (transport == null)
            {
                Debug.LogError("[NgoAdapter] Transport is NULL.");
                return false;
            }

            Debug.Log($"[NgoAdapter] Configuring host relay on transport: {transport.GetType().FullName}");

            // Ищем все методы с именем SetRelayServerData или SetHostRelayData
            MethodInfo[] methods = transport.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance);
            foreach (var m in methods)
            {
                if (m.Name == "SetRelayServerData" || m.Name == "SetHostRelayData")
                {
                    var ps = m.GetParameters();
                    Debug.Log($"[NgoAdapter] Found method {m.Name} with {ps.Length} parameters.");
                    
                    try {
                        if (ps.Length == 6) {
                            m.Invoke(transport, new object[] { data.Host, data.Port, data.AllocationIdBytes, data.KeyBytes, data.ConnectionData, data.IsSecure });
                            return true;
                        }
                        if (ps.Length == 7) {
                            m.Invoke(transport, new object[] { data.Host, data.Port, data.AllocationIdBytes, data.KeyBytes, data.ConnectionData, data.HostConnectionData, data.IsSecure });
                            return true;
                        }
                    } catch (Exception e) {
                        Debug.LogError($"[NgoAdapter] Invoke error: {e.Message}");
                    }
                }
            }

            Debug.LogError("[NgoAdapter] No suitable relay configuration method found on transport.");
            return false;
        }

        private bool ConfigureRelayAsClient(RelayAllocationData data)
        {
            object transport = ResolveTransport();
            if (transport == null) return false;

            Debug.Log($"[NgoAdapter] Configuring client relay on: {transport.GetType().Name}");

            // Пытаемся найти метод SetRelayServerData или SetClientRelayData
            MethodInfo[] methods = transport.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance);
            foreach (var m in methods)
            {
                if (m.Name == "SetRelayServerData" || m.Name == "SetClientRelayData")
                {
                    var ps = m.GetParameters();
                    Debug.Log($"[NgoAdapter] Found method {m.Name} with {ps.Length} parameters.");
                    
                    try {
                        // Формат с 7 параметрами (стандарт для современных версий)
                        if (ps.Length == 7) {
                            m.Invoke(transport, new object[] { data.Host, data.Port, data.AllocationIdBytes, data.KeyBytes, data.ConnectionData, data.HostConnectionData, data.IsSecure });
                            return true;
                        }
                        // Формат с 6 параметрами
                        if (ps.Length == 6) {
                            m.Invoke(transport, new object[] { data.Host, data.Port, data.AllocationIdBytes, data.KeyBytes, data.ConnectionData, data.IsSecure });
                            return true;
                        }
                    } catch (Exception e) {
                        Debug.LogError($"[NgoAdapter] Client config error: {e.Message}");
                    }
                }
            }

            Debug.LogError("[NgoAdapter] No suitable client relay configuration method found!");
            return false;
        }

        private bool ConfigureLanAsHost(ushort port, string listenAddress)
        {
            object transport = ResolveTransport();
            MethodInfo method = transport?.GetType().GetMethod("SetConnectionData", BindingFlags.Public | BindingFlags.Instance);
            if (transport == null || method == null)
            {
                return false;
            }

            ParameterInfo[] parameters = method.GetParameters();
            object[] args = new object[parameters.Length];
            if (parameters.Length > 0) args[0] = "0.0.0.0";
            if (parameters.Length > 1) args[1] = port;
            if (parameters.Length > 2) args[2] = listenAddress;
            method.Invoke(transport, args);
            return true;
        }

        private bool ConfigureLanAsClient(string address, ushort port)
        {
            object transport = ResolveTransport();
            MethodInfo method = transport?.GetType().GetMethod("SetConnectionData", BindingFlags.Public | BindingFlags.Instance);
            if (transport == null || method == null)
            {
                return false;
            }

            ParameterInfo[] parameters = method.GetParameters();
            object[] args = new object[parameters.Length];
            if (parameters.Length > 0) args[0] = address;
            if (parameters.Length > 1) args[1] = port;
            if (parameters.Length > 2) args[2] = address;
            method.Invoke(transport, args);
            return true;
        }

        private bool InvokeNetworkManagerBoolMethod(string methodName)
        {
            object networkManager = ResolveNetworkManager();
            MethodInfo method = networkManager?.GetType().GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance);
            if (networkManager == null || method == null)
            {
                return false;
            }

            object result = method.Invoke(networkManager, null);
            return result == null || (result is bool success && success);
        }

        private object ResolveNetworkManager()
        {
            if (networkManagerObject == null)
            {
                networkManagerObject = this.gameObject; // Попробуем найти на текущем объекте
            }

            Component[] components = networkManagerObject.GetComponents<Component>();
            for (int i = 0; i < components.Length; i++)
            {
                if (components[i] != null && components[i].GetType().FullName == "Unity.Netcode.NetworkManager")
                {
                    return components[i];
                }
            }

            Debug.LogError("[NgoAdapter] Could not find NetworkManager component on " + networkManagerObject.name);
            return null;
        }

        private object ResolveTransport()
        {
            object networkManager = ResolveNetworkManager();
            if (networkManager == null) return null;

            Debug.Log("[NgoAdapter] Searching for NetworkConfig...");

            // 1. Пытаемся найти NetworkConfig (он может быть Полем или Свойством)
            object networkConfig = null;
            var configField = networkManager.GetType().GetField("NetworkConfig", BindingFlags.Public | BindingFlags.Instance);
            if (configField != null)
            {
                networkConfig = configField.GetValue(networkManager);
                Debug.Log("[NgoAdapter] Found NetworkConfig as Field.");
            }
            else
            {
                var configProp = networkManager.GetType().GetProperty("NetworkConfig", BindingFlags.Public | BindingFlags.Instance);
                if (configProp != null)
                {
                    networkConfig = configProp.GetValue(networkManager);
                    Debug.Log("[NgoAdapter] Found NetworkConfig as Property.");
                }
            }

            if (networkConfig == null)
            {
                Debug.LogError("[NgoAdapter] Could not find NetworkConfig on NetworkManager via reflection.");
                return null;
            }

            // 2. Пытаемся найти NetworkTransport внутри NetworkConfig
            object networkTransport = null;
            var transportField = networkConfig.GetType().GetField("NetworkTransport", BindingFlags.Public | BindingFlags.Instance);
            if (transportField != null)
            {
                networkTransport = transportField.GetValue(networkConfig);
                Debug.Log("[NgoAdapter] Found NetworkTransport as Field in NetworkConfig.");
            }
            else
            {
                var transportProp = networkConfig.GetType().GetProperty("NetworkTransport", BindingFlags.Public | BindingFlags.Instance);
                if (transportProp != null)
                {
                    networkTransport = transportProp.GetValue(networkConfig);
                    Debug.Log("[NgoAdapter] Found NetworkTransport as Property in NetworkConfig.");
                }
            }

            // 3. Крайний случай: ищем компонент транспорта напрямую на объекте
            if (networkTransport == null)
            {
                Debug.LogWarning("[NgoAdapter] Transport not found in Config. Searching for any NetworkTransport component on the object...");
                Component[] allComponents = (networkManager as Component).GetComponents<Component>();
                foreach (var c in allComponents)
                {
                    if (c == null) continue;
                    // Проверяем, наследуется ли компонент от NetworkTransport (используем строку, чтобы не зависеть от типов)
                    Type t = c.GetType();
                    while (t != null)
                    {
                        if (t.FullName == "Unity.Netcode.NetworkTransport")
                        {
                            networkTransport = c;
                            Debug.Log($"[NgoAdapter] Found transport component by type: {c.GetType().Name}");
                            break;
                        }
                        t = t.BaseType;
                    }
                    if (networkTransport != null) break;
                }
            }

            if (networkTransport == null)
            {
                Debug.LogError("[NgoAdapter] Transport is still NULL. Make sure UnityTransport is added and assigned.");
            }

            return networkTransport;
        }
    }
}
