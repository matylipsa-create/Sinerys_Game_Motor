using Godot;
using System;

public partial class PerceptionFieldProcessor : Node
{
    private const int MaxEntities = 4096;
    private const int MaxObservers = 256;
    private const int MaxResults = 16384;
    private const int GridBucketCount = 8192;
    private const float CellSize = 8f;
    private const float MaxQueryRange = 40f;

    [Signal]
    public delegate void PerceptionResultsReadyEventHandler(
        int generation,
        int resultCount,
        int droppedResults);

    private readonly PerceptionEntitySample[][] _entityBuffers =
    {
        new PerceptionEntitySample[MaxEntities],
        new PerceptionEntitySample[MaxEntities]
    };

    private readonly PerceptionObserver[][] _observerBuffers =
    {
        new PerceptionObserver[MaxObservers],
        new PerceptionObserver[MaxObservers]
    };

    private readonly PerceptionResult[][] _resultBuffers =
    {
        new PerceptionResult[MaxResults],
        new PerceptionResult[MaxResults]
    };
    private readonly PerceptionResult[] _publishedResults = new PerceptionResult[MaxResults];

    private readonly int[] _cellHeads = new int[GridBucketCount];
    private readonly int[] _nextEntity = new int[MaxEntities];
    private readonly int[] _cellX = new int[MaxEntities];
    private readonly int[] _cellY = new int[MaxEntities];
    private readonly int[] _cellZ = new int[MaxEntities];
    private readonly object _completionLock = new object();

    private int _entityCountByBuffer0;
    private int _entityCountByBuffer1;
    private int _observerCountByBuffer0;
    private int _observerCountByBuffer1;
    private int _generation;
    private int _workerGeneration;
    private int _workerSlot;
    private int _workerTaskId = -1;
    private int _completedSlot = -1;
    private int _completedCount;
    private int _completedDropped;
    private int _publishedGeneration;
    private int _publishedCount;
    private int _publishedDropped;
    private bool _workerBusy;
    private bool _hasPendingSnapshot;
    private volatile bool _shuttingDown;
    private int _pendingSlot;

    internal event Action<PerceptionBatchView> BatchReady;

    public int Generation => _generation;
    public int DroppedInputSamples { get; private set; }
    public int DroppedObserverSamples { get; private set; }

    public Godot.Collections.Dictionary GetPerceptionStats()
    {
        return new Godot.Collections.Dictionary
        {
            ["generation"] = _generation,
            ["published_generation"] = _publishedGeneration,
            ["published_results"] = _publishedCount,
            ["dropped_results"] = _publishedDropped,
            ["dropped_input_samples"] = DroppedInputSamples,
            ["dropped_observer_samples"] = DroppedObserverSamples,
            ["worker_busy"] = _workerBusy,
            ["pending_snapshot"] = _hasPendingSnapshot
        };
    }

    internal int SubmitSnapshot(
        PerceptionEntitySample[] entities,
        int entityCount,
        PerceptionObserver[] observers,
        int observerCount)
    {
        if (_shuttingDown) return _generation;
        if (entities == null) throw new ArgumentNullException(nameof(entities));
        if (observers == null) throw new ArgumentNullException(nameof(observers));

        int slot = _workerBusy ? 1 - _workerSlot : 1 - _pendingSlot;
        _pendingSlot = slot;
        int safeEntityCount = Math.Max(0, Math.Min(
            Math.Min(entityCount, entities.Length),
            MaxEntities));
        int safeObserverCount = Math.Max(0, Math.Min(
            Math.Min(observerCount, observers.Length),
            MaxObservers));
        Array.Copy(entities, 0, _entityBuffers[slot], 0, safeEntityCount);
        Array.Copy(observers, 0, _observerBuffers[slot], 0, safeObserverCount);
        DroppedInputSamples += Math.Max(0, entityCount - safeEntityCount);
        DroppedObserverSamples += Math.Max(0, observerCount - safeObserverCount);

        if (slot == 0)
        {
            _entityCountByBuffer0 = safeEntityCount;
            _observerCountByBuffer0 = safeObserverCount;
        }
        else
        {
            _entityCountByBuffer1 = safeEntityCount;
            _observerCountByBuffer1 = safeObserverCount;
        }

        _generation++;
        _hasPendingSnapshot = true;
        StartPendingSnapshot();
        return _generation;
    }

    internal PerceptionBatchView GetLatestBatch()
    {
        return new PerceptionBatchView(
            _publishedGeneration,
            _publishedResults,
            _publishedCount,
            _publishedDropped);
    }

    internal int CopyLatestResults(PerceptionResult[] destination)
    {
        if (destination == null) throw new ArgumentNullException(nameof(destination));
        int count = Math.Min(_publishedCount, destination.Length);
        Array.Copy(_publishedResults, destination, count);
        return count;
    }

    public Godot.Collections.Array<Godot.Collections.Dictionary> GetResultsSnapshot()
    {
        var snapshot = new Godot.Collections.Array<Godot.Collections.Dictionary>();
        for (int index = 0; index < _publishedCount; index++)
        {
            PerceptionResult result = _publishedResults[index];
            snapshot.Add(new Godot.Collections.Dictionary
            {
                ["observer_id"] = result.ObserverId,
                ["target_id"] = result.TargetId,
                ["senses"] = (int)result.Senses,
                ["strength"] = result.Strength
            });
        }
        return snapshot;
    }

    public int SubmitSnapshotFromDictionaries(
        Godot.Collections.Array<Godot.Collections.Dictionary> entities,
        Godot.Collections.Array<Godot.Collections.Dictionary> observers)
    {
        if (entities == null) throw new ArgumentNullException(nameof(entities));
        if (observers == null) throw new ArgumentNullException(nameof(observers));
        int entityCount = Math.Min(entities.Count, MaxEntities);
        int observerCount = Math.Min(observers.Count, MaxObservers);
        DroppedInputSamples += Math.Max(0, entities.Count - entityCount);
        DroppedObserverSamples += Math.Max(0, observers.Count - observerCount);
        int inputSlot = _workerBusy ? 1 - _workerSlot : 1 - _pendingSlot;
        PerceptionEntitySample[] entityBuffer = _entityBuffers[inputSlot];
        PerceptionObserver[] observerBuffer = _observerBuffers[inputSlot];

        for (int index = 0; index < entityCount; index++)
        {
            Godot.Collections.Dictionary item = entities[index];
            entityBuffer[index] = new PerceptionEntitySample(
                ReadLong(item, "id"),
                ReadVector3(item, "position"),
                ReadVector3(item, "forward", Vector3.Forward),
                ReadFloat(item, "noise"),
                ReadFloat(item, "tension_trail"),
                unchecked((uint)ReadLong(item, "faction_mask")),
                ReadBool(item, "is_player"),
                ReadBool(item, "active", true));
        }

        for (int index = 0; index < observerCount; index++)
        {
            Godot.Collections.Dictionary item = observers[index];
            float fovDegrees = ClampFinite(ReadFloat(item, "fov_degrees", 90f), 0f, 360f);
            float halfFovRadians = Mathf.DegToRad(fovDegrees * 0.5f);
            observerBuffer[index] = new PerceptionObserver(
                ReadLong(item, "id"),
                ReadVector3(item, "position"),
                ReadVector3(item, "forward", Vector3.Forward),
                unchecked((uint)ReadLong(item, "friendly_faction_mask")),
                ReadFloat(item, "vision_range", 24f),
                Mathf.Cos(halfFovRadians),
                ReadFloat(item, "hearing_range", 16f),
                ReadFloat(item, "tension_range", 20f),
                ReadFloat(item, "tension_threshold", 0.15f));
        }

        PerceptionEntitySample[] sourceEntities = _entityBuffers[inputSlot];
        PerceptionObserver[] sourceObservers = _observerBuffers[inputSlot];
        return SubmitSnapshot(sourceEntities, entityCount, sourceObservers, observerCount);
    }

    public override void _ExitTree()
    {
        _shuttingDown = true;
        if (_workerTaskId >= 0)
        {
            WorkerThreadPool.WaitForTaskCompletion(_workerTaskId);
            _workerTaskId = -1;
        }
    }

    private void StartPendingSnapshot()
    {
        if (_workerBusy || !_hasPendingSnapshot || _shuttingDown) return;

        int slot = _pendingSlot;
        int entityCount = slot == 0 ? _entityCountByBuffer0 : _entityCountByBuffer1;
        int observerCount = slot == 0 ? _observerCountByBuffer0 : _observerCountByBuffer1;
        int generation = _generation;
        _hasPendingSnapshot = false;
        _workerBusy = true;
        _workerSlot = slot;
        _workerGeneration = generation;
        _workerTaskId = WorkerThreadPool.AddTask(
            Callable.From(() => ProcessSnapshot(slot, entityCount, observerCount, generation)),
            false,
            "Build spatial perception field");
    }

    private void ProcessSnapshot(
        int slot,
        int entityCount,
        int observerCount,
        int generation)
    {
        Array.Clear(_cellHeads, 0, _cellHeads.Length);
        BuildGrid(_entityBuffers[slot], entityCount);
        int resultCount = 0;
        int dropped = 0;
        PerceptionResult[] output = _resultBuffers[slot];

        for (int observerIndex = 0; observerIndex < observerCount; observerIndex++)
        {
            PerceptionObserver observer = _observerBuffers[slot][observerIndex];
            ProcessObserver(
                observer,
                _entityBuffers[slot],
                entityCount,
                output,
                ref resultCount,
                ref dropped);
        }

        lock (_completionLock)
        {
            _completedSlot = slot;
            _completedCount = resultCount;
            _completedDropped = dropped;
        }

        if (!_shuttingDown)
            CallDeferred(nameof(CompleteSnapshotOnMainThread), generation);
    }

    private void BuildGrid(PerceptionEntitySample[] entities, int entityCount)
    {
        for (int index = 0; index < entityCount; index++)
        {
            if (!entities[index].IsActive) continue;
            Vector3 position = entities[index].Position;
            if (!IsFinite(position)) continue;
            int cellX = Mathf.FloorToInt(position.X / CellSize);
            int cellY = Mathf.FloorToInt(position.Y / CellSize);
            int cellZ = Mathf.FloorToInt(position.Z / CellSize);
            int bucket = HashCell(cellX, cellY, cellZ);
            _cellX[index] = cellX;
            _cellY[index] = cellY;
            _cellZ[index] = cellZ;
            _nextEntity[index] = _cellHeads[bucket];
            _cellHeads[bucket] = index + 1;
        }
    }

    private void ProcessObserver(
        PerceptionObserver observer,
        PerceptionEntitySample[] entities,
        int entityCount,
        PerceptionResult[] output,
        ref int resultCount,
        ref int dropped)
    {
        if (!IsFinite(observer.Position)) return;
        float visionRange = ClampFinite(observer.VisionRange, 0f, MaxQueryRange);
        float hearingRange = ClampFinite(observer.HearingRange, 0f, MaxQueryRange);
        float tensionRange = ClampFinite(observer.TensionSenseRange, 0f, MaxQueryRange);
        float maxRange = Mathf.Clamp(
            Mathf.Max(
                visionRange,
                Mathf.Max(hearingRange, tensionRange)),
            CellSize,
            MaxQueryRange);
        int minX = Mathf.FloorToInt((observer.Position.X - maxRange) / CellSize);
        int maxX = Mathf.FloorToInt((observer.Position.X + maxRange) / CellSize);
        int minY = Mathf.FloorToInt((observer.Position.Y - maxRange) / CellSize);
        int maxY = Mathf.FloorToInt((observer.Position.Y + maxRange) / CellSize);
        int minZ = Mathf.FloorToInt((observer.Position.Z - maxRange) / CellSize);
        int maxZ = Mathf.FloorToInt((observer.Position.Z + maxRange) / CellSize);
        Vector3 forward = observer.Forward.LengthSquared() > 0.001f
            ? observer.Forward.Normalized()
            : Vector3.Forward;
        float visionRangeSquared = visionRange * visionRange;
        float hearingRangeSquared = hearingRange * hearingRange;
        float tensionRangeSquared = tensionRange * tensionRange;
        float visionCosHalfAngle = ClampFinite(observer.VisionCosHalfAngle, -1f, 1f);
        float tensionThreshold = ClampFinite(observer.TensionSenseThreshold, 0f, 1f);

        for (int z = minZ; z <= maxZ; z++)
        for (int y = minY; y <= maxY; y++)
        for (int x = minX; x <= maxX; x++)
        {
            int bucket = HashCell(x, y, z);
            int linked = _cellHeads[bucket];
            while (linked > 0)
            {
                int entityIndex = linked - 1;
                linked = _nextEntity[entityIndex];
                if (_cellX[entityIndex] != x
                    || _cellY[entityIndex] != y
                    || _cellZ[entityIndex] != z)
                    continue;

                PerceptionEntitySample target = entities[entityIndex];
                if (!target.IsActive
                    || !IsFinite(target.Position)
                    || target.EntityId == observer.EntityId
                    || (target.FactionMask & observer.FriendlyFactionMask) != 0)
                    continue;

                Vector3 offset = target.Position - observer.Position;
                float distanceSquared = offset.LengthSquared();
                PerceptionSenseFlags senses = PerceptionSenseFlags.None;
                float strength = 0f;

                if (distanceSquared <= visionRangeSquared)
                {
                    Vector3 direction = distanceSquared > 0.0001f
                        ? offset / Mathf.Sqrt(distanceSquared)
                        : forward;
                    if (visionRange > 0f && forward.Dot(direction) >= visionCosHalfAngle)
                    {
                        senses |= PerceptionSenseFlags.Vision;
                        strength = Mathf.Max(
                            strength,
                            1f - Mathf.Sqrt(distanceSquared) / Mathf.Max(0.1f, visionRange));
                    }
                }

                if (distanceSquared <= hearingRangeSquared
                    && IsFinite(target.Noise)
                    && target.Noise > 0.01f)
                {
                    float hearingStrength = target.Noise
                        * (1f - Mathf.Sqrt(distanceSquared) / Mathf.Max(0.1f, hearingRange));
                    if (hearingStrength > 0.02f)
                    {
                        senses |= PerceptionSenseFlags.Noise;
                        strength = Mathf.Max(strength, hearingStrength);
                    }
                }

                if (distanceSquared <= tensionRangeSquared
                    && IsFinite(target.TensionTrail)
                    && target.TensionTrail >= tensionThreshold
                    && target.TensionTrail > 0.01f)
                {
                    senses |= PerceptionSenseFlags.TensionTrail;
                    strength = Mathf.Max(strength, target.TensionTrail);
                }

                if (senses == PerceptionSenseFlags.None) continue;
                if (resultCount >= output.Length)
                {
                    dropped++;
                    continue;
                }
                output[resultCount++] = new PerceptionResult(
                    observer.EntityId,
                    target.EntityId,
                    senses,
                    Mathf.Clamp(strength, 0f, 1f));
            }
        }
    }

    public void CompleteSnapshotOnMainThread(int completedGeneration)
    {
        _workerBusy = false;
        _workerTaskId = -1;
        int completedSlot;
        int completedCount;
        int dropped;
        lock (_completionLock)
        {
            completedSlot = _completedSlot;
            completedCount = _completedCount;
            dropped = _completedDropped;
        }

        if (!_shuttingDown && completedGeneration == _generation && completedSlot >= 0)
        {
            Array.Copy(_resultBuffers[completedSlot], _publishedResults, completedCount);
            _publishedGeneration = completedGeneration;
            _publishedCount = completedCount;
            _publishedDropped = dropped;
            var batch = new PerceptionBatchView(
                completedGeneration,
                _publishedResults,
                completedCount,
                dropped);
            BatchReady?.Invoke(batch);
            EmitSignal(
                SignalName.PerceptionResultsReady,
                completedGeneration,
                completedCount,
                dropped);
        }

        StartPendingSnapshot();
    }

    private static int HashCell(int x, int y, int z)
    {
        unchecked
        {
            uint hash = (uint)x * 73856093u;
            hash ^= (uint)y * 19349663u;
            hash ^= (uint)z * 83492791u;
            return (int)(hash & (GridBucketCount - 1));
        }
    }

    private static bool IsFinite(Vector3 value)
    {
        return IsFinite(value.X) && IsFinite(value.Y) && IsFinite(value.Z);
    }

    private static bool IsFinite(float value)
    {
        return !float.IsNaN(value) && !float.IsInfinity(value);
    }

    private static float ClampFinite(float value, float minimum, float maximum)
    {
        return IsFinite(value) ? Mathf.Clamp(value, minimum, maximum) : minimum;
    }

    private static long ReadLong(Godot.Collections.Dictionary dictionary, string key)
    {
        return dictionary.ContainsKey(key) && dictionary[key].VariantType == Variant.Type.Int
            ? dictionary[key].AsInt64()
            : 0L;
    }

    private static float ReadFloat(
        Godot.Collections.Dictionary dictionary,
        string key,
        float fallback = 0f)
    {
        if (!dictionary.ContainsKey(key)) return fallback;
        Variant value = dictionary[key];
        if (value.VariantType == Variant.Type.Int) return value.AsInt64();
        return value.VariantType == Variant.Type.Float ? (float)value.AsDouble() : fallback;
    }

    private static Vector3 ReadVector3(
        Godot.Collections.Dictionary dictionary,
        string key,
        Vector3 fallback = default)
    {
        if (!dictionary.ContainsKey(key)) return fallback;
        Variant value = dictionary[key];
        return value.VariantType == Variant.Type.Vector3 ? value.AsVector3() : fallback;
    }

    private static bool ReadBool(
        Godot.Collections.Dictionary dictionary,
        string key,
        bool fallback = false)
    {
        if (!dictionary.ContainsKey(key)) return fallback;
        Variant value = dictionary[key];
        return value.VariantType == Variant.Type.Bool ? value.AsBool() : fallback;
    }
}
