// ArcSpace.cs — the one conversion between the kit's map and the Unity world. Game logic keeps
// its map numbers (px, like the JS it came from); only the view goes through here.
//   map:   x right, y down the map, height up; 1 px = 1 cm; the Babylon scene was right-handed
//   Unity: meters, left-handed, Y up — X = x/100, Y = height/100, Z = −y/100
// Rotation: a record's rot [x, y, z]° -> Euler(−x, y, z) — y stays the heading in degrees
// (0 — along +x, 90 — down the map); a heading in radians (atan2(vy, vx)) -> Heading(h).
// tools/export-unity.mjs does the same in JS and writes golden points; the importer compares.
using UnityEngine;

namespace ArcEngine
{
    public static class ArcSpace
    {
        public const float PxPerMeter = 100f;

        public static Vector3 ToWorld(float x, float y, float h)
        {
            return new Vector3(x / PxPerMeter, h / PxPerMeter, -y / PxPerMeter);
        }

        // World point -> map (x, y, h) in px.
        public static Vector3 ToMap(Vector3 world)
        {
            return new Vector3(world.x * PxPerMeter, -world.z * PxPerMeter, world.y * PxPerMeter);
        }

        public static Quaternion Rotation(float[] rot)
        {
            if (rot == null || rot.Length < 3) return Quaternion.identity;
            return Quaternion.Euler(-rot[0], rot[1], rot[2]);
        }

        // Heading in radians, as the kit's logic keeps it: rotation.y = −heading in Babylon.
        public static Quaternion Heading(float headingRad)
        {
            return Quaternion.Euler(0f, headingRad * Mathf.Rad2Deg, 0f);
        }

        // A direction on the map (dx, dy) -> a world direction on the ground plane.
        public static Vector3 Direction(float dx, float dy)
        {
            return new Vector3(dx, 0f, -dy);
        }
    }
}
