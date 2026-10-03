using Godot;
using System;

public static class SentraFastMath
{
    private const int TrigTableBits = 12;
    private const int TrigTableSize = 1 << TrigTableBits;
    private const int TrigTableMask = TrigTableSize - 1;
    private const float RadiansToTable = TrigTableSize / Mathf.Tau;
    private static readonly float[] SinTable = BuildSinTable();

    public readonly struct VoxelRayHit
    {
        public readonly Vector3I Cell;
        public readonly Vector3 Normal;
        public readonly float Distance;

        public VoxelRayHit(Vector3I cell, Vector3 normal, float distance)
        {
            Cell = cell;
            Normal = normal;
            Distance = distance;
        }
    }

    public static float SinLut(float radians)
    {
        if (!IsFinite(radians)) return 0f;
        float tablePosition = radians * RadiansToTable;
        float wrappedPosition = tablePosition - Mathf.Floor(tablePosition / TrigTableSize) * TrigTableSize;
        int lowerIndex = (int)wrappedPosition;
        float fraction = wrappedPosition - lowerIndex;
        float lower = SinTable[lowerIndex & TrigTableMask];
        float upper = SinTable[(lowerIndex + 1) & TrigTableMask];
        return lower + (upper - lower) * fraction;
    }

    public static void SinCosLut(float radians, out float sine, out float cosine)
    {
        if (!IsFinite(radians))
        {
            sine = 0f;
            cosine = 1f;
            return;
        }

        float tablePosition = radians * RadiansToTable;
        float wrappedPosition = tablePosition - Mathf.Floor(tablePosition / TrigTableSize) * TrigTableSize;
        int lowerIndex = (int)wrappedPosition;
        float fraction = wrappedPosition - lowerIndex;
        sine = LerpTable(lowerIndex, fraction);
        cosine = LerpTable(lowerIndex + TrigTableSize / 4, fraction);
    }

    public static Vector3 NormalizeOrZero(Vector3 value)
    {
        float lengthSquared = value.LengthSquared();
        if (!IsFinite(lengthSquared) || lengthSquared <= 1e-12f)
            return Vector3.Zero;
        return value / Mathf.Sqrt(lengthSquared);
    }

    public static Vector3 FastNormalizeOrZero(Vector3 value)
    {
        float lengthSquared = value.LengthSquared();
        if (!IsFinite(lengthSquared) || lengthSquared <= 1e-12f)
            return Vector3.Zero;
        // One Newton step is intentionally approximate; do not use for authoritative collision normals.
        return value * FastInverseSqrt(lengthSquared);
    }

    public static Vector3 BallisticPosition(
        Vector3 origin,
        Vector3 initialVelocity,
        Vector3 gravity,
        float elapsedSeconds)
    {
        float time = IsFinite(elapsedSeconds) ? Mathf.Max(0f, elapsedSeconds) : 0f;
        return origin + initialVelocity * time + gravity * (0.5f * time * time);
    }

    public static Vector3 BallisticVelocity(
        Vector3 initialVelocity,
        Vector3 gravity,
        float elapsedSeconds)
    {
        float time = IsFinite(elapsedSeconds) ? Mathf.Max(0f, elapsedSeconds) : 0f;
        return initialVelocity + gravity * time;
    }

    public static bool DiffuseDensity6(
        byte[] source,
        byte[] destination,
        Vector3I dimensions,
        byte centerRetention)
    {
        if (source == null || destination == null || ReferenceEquals(source, destination)
            || dimensions.X <= 0 || dimensions.Y <= 0 || dimensions.Z <= 0)
            return false;

        long xyCells = (long)dimensions.X * dimensions.Y;
        if (xyCells > source.Length / (long)dimensions.Z
            || xyCells > destination.Length / (long)dimensions.Z)
            return false;

        int planeSize = dimensions.X * dimensions.Y;
        int retention = centerRetention;
        int neighborWeight = byte.MaxValue - retention;

        for (int z = 0; z < dimensions.Z; z++)
        for (int y = 0; y < dimensions.Y; y++)
        for (int x = 0; x < dimensions.X; x++)
        {
            int index = x + dimensions.X * (y + dimensions.Y * z);
            int center = source[index];
            int neighborSum = 0;
            int neighborCount = 0;

            if (x > 0) { neighborSum += source[index - 1]; neighborCount++; }
            if (x < dimensions.X - 1) { neighborSum += source[index + 1]; neighborCount++; }
            if (y > 0) { neighborSum += source[index - dimensions.X]; neighborCount++; }
            if (y < dimensions.Y - 1) { neighborSum += source[index + dimensions.X]; neighborCount++; }
            if (z > 0) { neighborSum += source[index - planeSize]; neighborCount++; }
            if (z + 1 < dimensions.Z) { neighborSum += source[index + planeSize]; neighborCount++; }

            int neighborMean = neighborCount > 0
                ? (neighborSum + neighborCount / 2) / neighborCount
                : center;
            destination[index] = (byte)(
                (center * retention + neighborMean * neighborWeight + 127) / byte.MaxValue);
        }

        return true;
    }

    public static bool RaycastVoxels(
        byte[] occupancy,
        Vector3 origin,
        Vector3 direction,
        Vector3I gridOrigin,
        Vector3I dimensions,
        float maxDistance,
        out VoxelRayHit hit)
    {
        hit = default;
        if (occupancy == null || dimensions.X <= 0 || dimensions.Y <= 0 || dimensions.Z <= 0)
            return false;

        long xyCells = (long)dimensions.X * dimensions.Y;
        if (xyCells > occupancy.Length / (long)dimensions.Z
            || !IsFinite(origin)
            || !IsFinite(direction)
            || !IsFinite(maxDistance) || maxDistance <= 0f)
            return false;

        Vector3 ray = NormalizeOrZero(direction);
        if (ray == Vector3.Zero) return false;

        Vector3 localOrigin = origin - new Vector3(
            gridOrigin.X,
            gridOrigin.Y,
            gridOrigin.Z);
        int cellX = Mathf.FloorToInt(localOrigin.X);
        int cellY = Mathf.FloorToInt(localOrigin.Y);
        int cellZ = Mathf.FloorToInt(localOrigin.Z);
        int stepX = Sign(ray.X);
        int stepY = Sign(ray.Y);
        int stepZ = Sign(ray.Z);
        float deltaX = stepX == 0 ? float.PositiveInfinity : Mathf.Abs(1f / ray.X);
        float deltaY = stepY == 0 ? float.PositiveInfinity : Mathf.Abs(1f / ray.Y);
        float deltaZ = stepZ == 0 ? float.PositiveInfinity : Mathf.Abs(1f / ray.Z);
        float nextX = InitialBoundaryTime(localOrigin.X, cellX, ray.X, stepX);
        float nextY = InitialBoundaryTime(localOrigin.Y, cellY, ray.Y, stepY);
        float nextZ = InitialBoundaryTime(localOrigin.Z, cellZ, ray.Z, stepZ);
        Vector3 normal = Vector3.Zero;
        float distance = 0f;

        while (distance <= maxDistance)
        {
            if (cellX < 0 || cellY < 0 || cellZ < 0
                || cellX >= dimensions.X || cellY >= dimensions.Y || cellZ >= dimensions.Z)
                return false;

            int flatIndex = cellX + dimensions.X * (cellY + dimensions.Y * cellZ);
            if (occupancy[flatIndex] != 0)
            {
                hit = new VoxelRayHit(
                    new Vector3I(cellX, cellY, cellZ) + gridOrigin,
                    normal,
                    distance);
                return true;
            }

            if (nextX <= nextY && nextX <= nextZ)
            {
                distance = nextX;
                nextX += deltaX;
                cellX += stepX;
                normal = new Vector3(-stepX, 0f, 0f);
            }
            else if (nextY <= nextZ)
            {
                distance = nextY;
                nextY += deltaY;
                cellY += stepY;
                normal = new Vector3(0f, -stepY, 0f);
            }
            else
            {
                distance = nextZ;
                nextZ += deltaZ;
                cellZ += stepZ;
                normal = new Vector3(0f, 0f, -stepZ);
            }
        }

        return false;
    }

    private static float LerpTable(int index, float fraction)
    {
        float lower = SinTable[index & TrigTableMask];
        float upper = SinTable[(index + 1) & TrigTableMask];
        return lower + (upper - lower) * fraction;
    }

    private static float InitialBoundaryTime(float origin, int cell, float direction, int step)
    {
        if (step == 0) return float.PositiveInfinity;
        float boundary = step > 0 ? cell + 1f : cell;
        return Mathf.Max(0f, (boundary - origin) / direction);
    }

    private static int Sign(float value)
    {
        return value > 0f ? 1 : value < 0f ? -1 : 0;
    }

    private static float FastInverseSqrt(float value)
    {
        int bits = BitConverter.SingleToInt32Bits(value);
        bits = 0x5f3759df - (bits >> 1);
        float estimate = BitConverter.Int32BitsToSingle(bits);
        return estimate * (1.5f - 0.5f * value * estimate * estimate);
    }

    private static float[] BuildSinTable()
    {
        var table = new float[TrigTableSize];
        for (int index = 0; index < table.Length; index++)
            table[index] = Mathf.Sin(Mathf.Tau * index / TrigTableSize);
        return table;
    }

    private static bool IsFinite(Vector3 value)
    {
        return IsFinite(value.X) && IsFinite(value.Y) && IsFinite(value.Z);
    }

    private static bool IsFinite(float value)
    {
        return !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
