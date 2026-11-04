using System;
using System.Reflection;
using System.Threading.Tasks;
using UnityEngine;

namespace MapEditorPrototype
{
    public static class PackageAsyncReflectionUtility
    {
        public static async Task<object> InvokeTaskMethodAsync(object target, MethodInfo method, object[] args)
        {
            if (method == null)
            {
                Debug.LogError("[Reflection] Method is null!");
                return null;
            }

            try
            {
                Debug.Log($"[Reflection] Invoking {method.Name} on {target?.GetType().Name ?? "static"} with {args?.Length ?? 0} args");
                object invocationResult = method.Invoke(target, args);
                if (invocationResult == null)
                {
                    return null;
                }

                if (invocationResult is Task task)
                {
                    await task;
                    PropertyInfo resultProperty = invocationResult.GetType().GetProperty("Result", BindingFlags.Public | BindingFlags.Instance);
                    return resultProperty != null ? resultProperty.GetValue(invocationResult) : null;
                }

                return invocationResult;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[Reflection] Exception during {method.Name}: {ex.Message}\nInner: {ex.InnerException?.Message}");
                throw; // Пробрасываем выше, чтобы RelayConnectionService поймал
            }
        }

        public static Type FindType(params string[] assemblyQualifiedNames)
        {
            for (int i = 0; i < assemblyQualifiedNames.Length; i++)
            {
                Type type = Type.GetType(assemblyQualifiedNames[i]);
                if (type != null)
                {
                    return type;
                }
            }

            return null;
        }
    }
}
