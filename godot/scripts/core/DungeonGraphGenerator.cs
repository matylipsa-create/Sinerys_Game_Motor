using Godot;
using System;

[Flags]
public enum DungeonDecisionFlags : uint
{
    None = 0,
    SparedTheWarden = 1 << 0,
    AcceptedTheSporePact = 1 << 1,
    DisabledTheBeacon = 1 << 2
}

public enum DungeonRoomKind : byte
{
    Entrance,
    Combat,
    Shelter,
    Narrative,
    TensionAnchor,
    Boss
}

public enum DungeonConnectionKind : byte
{
    Corridor,
    SecretPassage
}

public readonly struct DungeonGenerationRequest
{
    public readonly uint Seed;
    public readonly int RoomCount;
    public readonly float Corruption;
    public readonly float CurrentTension;
    public readonly DungeonDecisionFlags Decisions;
    public readonly int FloorIndex;

    public DungeonGenerationRequest(
        uint seed,
        int roomCount,
        float corruption,
        float currentTension,
        DungeonDecisionFlags decisions,
        int floorIndex)
    {
        Seed = seed;
        RoomCount = roomCount;
        Corruption = corruption;
        CurrentTension = currentTension;
        Decisions = decisions;
        FloorIndex = floorIndex;
    }
}

public readonly struct DungeonRoomData
{
    public readonly int Id;
    public readonly DungeonRoomKind Kind;
    public readonly Vector2I GridPosition;
    public readonly Vector2I HalfExtents;
    public readonly float TensionAnchor;
    public readonly int EnemyBudget;
    public readonly byte NarrativeVariant;
    public readonly bool SealedCombatRoom;

    public DungeonRoomData(
        int id,
        DungeonRoomKind kind,
        Vector2I gridPosition,
        Vector2I halfExtents,
        float tensionAnchor,
        int enemyBudget,
        byte narrativeVariant,
        bool sealedCombatRoom)
    {
        Id = id;
        Kind = kind;
        GridPosition = gridPosition;
        HalfExtents = halfExtents;
        TensionAnchor = tensionAnchor;
        EnemyBudget = enemyBudget;
        NarrativeVariant = narrativeVariant;
        SealedCombatRoom = sealedCombatRoom;
    }
}

public readonly struct DungeonConnectionData
{
    public readonly int FromRoomId;
    public readonly int ToRoomId;
    public readonly DungeonConnectionKind Kind;

    public DungeonConnectionData(
        int fromRoomId,
        int toRoomId,
        DungeonConnectionKind kind)
    {
        FromRoomId = fromRoomId;
        ToRoomId = toRoomId;
        Kind = kind;
    }
}

public readonly struct DungeonSpawnData
{
    public readonly int RoomId;
    public readonly Vector2I LocalGridPosition;
    public readonly byte Archetype;
    public readonly float AmbientPressure;

    public DungeonSpawnData(
        int roomId,
        Vector2I localGridPosition,
        byte archetype,
        float ambientPressure)
    {
        RoomId = roomId;
        LocalGridPosition = localGridPosition;
        Archetype = archetype;
        AmbientPressure = ambientPressure;
    }
}

public sealed class DungeonLayout
{
    public readonly uint Seed;
    public readonly int FloorIndex;
    public readonly float Corruption;
    public readonly float Tension;
    public readonly DungeonRoomData[] Rooms;
    public readonly DungeonConnectionData[] Connections;
    public readonly DungeonSpawnData[] Spawns;

    public DungeonLayout(
        uint seed,
        int floorIndex,
        float corruption,
        float tension,
        DungeonRoomData[] rooms,
        DungeonConnectionData[] connections,
        DungeonSpawnData[] spawns)
    {
        Seed = seed;
        FloorIndex = floorIndex;
        Corruption = corruption;
        Tension = tension;
        Rooms = rooms;
        Connections = connections;
        Spawns = spawns;
    }
}

public static class DungeonGraphGenerator
{
    private const int MinimumRooms = 5;
    private const int MaximumRooms = 64;
    private const int CellsBetweenRooms = 8;

    public static DungeonLayout Generate(DungeonGenerationRequest request)
    {
        int roomCount = Mathf.Clamp(request.RoomCount, MinimumRooms, MaximumRooms);
        float corruption = Mathf.Clamp(request.Corruption, 0f, 1f);
        float currentTension = Mathf.Clamp(request.CurrentTension, 0f, 1f);
        float ambientPressure = Mathf.Max(corruption, currentTension);
        var random = new DeterministicRandom(request.Seed);
        var rooms = new DungeonRoomData[roomCount];
        var connections = new DungeonConnectionData[roomCount + roomCount / 4];
        int connectionCount = 0;
        var spawns = new DungeonSpawnData[MaximumRooms * 5];
        int spawnCount = 0;

        for (int index = 0; index < roomCount; index++)
        {
            DungeonRoomKind kind = ResolveRoomKind(index, roomCount, ref random);
            int branchSide = index > 0 && index < roomCount - 1 && index % 5 == 0
                ? (random.NextUInt() & 1u) == 0u ? -1 : 1
                : 0;
            var gridPosition = new Vector2I(
                index * CellsBetweenRooms,
                branchSide * CellsBetweenRooms);
            int enemyBudget = kind == DungeonRoomKind.Combat || kind == DungeonRoomKind.Boss
                ? Mathf.Clamp(1 + Mathf.RoundToInt(ambientPressure * 3f) + random.NextInt(0, 2), 1, 6)
                : 0;
            float tensionAnchor = ResolveTensionAnchor(
                index,
                roomCount,
                kind,
                corruption,
                currentTension,
                request.Decisions);
            byte narrativeVariant = ResolveNarrativeVariant(
                ref random,
                corruption,
                request.Decisions);

            rooms[index] = new DungeonRoomData(
                index,
                kind,
                gridPosition,
                new Vector2I(kind == DungeonRoomKind.Boss ? 5 : 3, 3),
                tensionAnchor,
                enemyBudget,
                narrativeVariant,
                kind == DungeonRoomKind.Combat || kind == DungeonRoomKind.Boss);

            for (int spawnIndex = 0; spawnIndex < enemyBudget; spawnIndex++)
            {
                int localX = random.NextInt(-2, 3);
                int localY = random.NextInt(-2, 3);
                spawns[spawnCount++] = new DungeonSpawnData(
                    index,
                    new Vector2I(localX, localY),
                    (byte)random.NextInt(0, ambientPressure >= 0.7f ? 4 : 3),
                    ambientPressure);
            }

            if (index > 0)
            {
                connections[connectionCount++] = new DungeonConnectionData(
                    index - 1,
                    index,
                    DungeonConnectionKind.Corridor);
            }
        }

        AddDeterministicLoops(
            request.Seed,
            roomCount,
            connections,
            ref connectionCount);

        Array.Resize(ref connections, connectionCount);
        Array.Resize(ref spawns, spawnCount);
        return new DungeonLayout(
            request.Seed,
            Mathf.Max(1, request.FloorIndex),
            corruption,
            currentTension,
            rooms,
            connections,
            spawns);
    }

    private static DungeonRoomKind ResolveRoomKind(
        int index,
        int roomCount,
        ref DeterministicRandom random)
    {
        if (index == 0) return DungeonRoomKind.Entrance;
        if (index == roomCount - 1) return DungeonRoomKind.Boss;
        if (index == roomCount / 2) return DungeonRoomKind.TensionAnchor;
        if (index % 4 == 0) return DungeonRoomKind.Shelter;
        return random.NextInt(0, 5) == 0
            ? DungeonRoomKind.Narrative
            : DungeonRoomKind.Combat;
    }

    private static float ResolveTensionAnchor(
        int index,
        int roomCount,
        DungeonRoomKind kind,
        float corruption,
        float currentTension,
        DungeonDecisionFlags decisions)
    {
        float progress = index / (float)Math.Max(1, roomCount - 1);
        float decisionPressure = (decisions & DungeonDecisionFlags.DisabledTheBeacon) != 0
            ? 0.12f
            : 0f;
        float anchor = 0.12f
            + progress * 0.32f
            + corruption * 0.26f
            + currentTension * 0.22f
            + decisionPressure;
        if (kind == DungeonRoomKind.Shelter) anchor -= 0.18f;
        if (kind == DungeonRoomKind.TensionAnchor) anchor += 0.16f;
        if (kind == DungeonRoomKind.Boss) anchor = 0.9f + corruption * 0.1f;
        return Mathf.Clamp(anchor, 0f, 1f);
    }

    private static byte ResolveNarrativeVariant(
        ref DeterministicRandom random,
        float corruption,
        DungeonDecisionFlags decisions)
    {
        int variant = random.NextInt(0, 8);
        if ((decisions & DungeonDecisionFlags.SparedTheWarden) != 0) variant ^= 0b001;
        if ((decisions & DungeonDecisionFlags.AcceptedTheSporePact) != 0) variant ^= 0b010;
        if (corruption >= 0.65f) variant |= 0b100;
        return (byte)variant;
    }

    private static void AddDeterministicLoops(
        uint seed,
        int roomCount,
        DungeonConnectionData[] connections,
        ref int connectionCount)
    {
        if (roomCount < 7) return;
        var random = new DeterministicRandom(seed ^ 0x9E3779B9u);
        int loopAttempts = roomCount / 6;
        for (int attempt = 0; attempt < loopAttempts; attempt++)
        {
            int from = random.NextInt(0, roomCount - 2);
            int to = from + random.NextInt(2, Math.Min(5, roomCount - from));
            if (from == 0 && to == roomCount - 1) continue;
            connections[connectionCount++] = new DungeonConnectionData(
                from,
                to,
                DungeonConnectionKind.SecretPassage);
        }
    }

    private struct DeterministicRandom
    {
        private uint _state;

        public DeterministicRandom(uint seed)
        {
            _state = seed == 0u ? 0xA341316Cu : seed;
        }

        public uint NextUInt()
        {
            uint value = _state;
            value ^= value << 13;
            value ^= value >> 17;
            value ^= value << 5;
            _state = value;
            return value;
        }

        public int NextInt(int minimumInclusive, int maximumExclusive)
        {
            int range = maximumExclusive - minimumInclusive;
            if (range <= 0) return minimumInclusive;
            return minimumInclusive + (int)(NextUInt() % (uint)range);
        }
    }
}
