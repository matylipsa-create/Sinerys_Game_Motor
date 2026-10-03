using Godot;
using System;

public partial class SentraVoxelStreamer : Node3D
{
    private const int ChunkSize = 16;
    private const int ChunkHeight = 5;
    private const int CellsPerChunk = ChunkSize * ChunkHeight * ChunkSize;
    private const int MaxStreamRadius = 2;
    private const int MaxChunkCount = (MaxStreamRadius * 2 + 1) * (MaxStreamRadius * 2 + 1);
    private const int ActiveChunkCapacity = MaxChunkCount * 2;
    private const int PortalNorth = 1;
    private const int PortalEast = 2;
    private const int PortalSouth = 4;
    private const int PortalWest = 8;

    [Signal]
    public delegate void ChunkAppliedEventHandler(
        int generation,
        int chunkX,
        int chunkZ,
        int portalMask);

    [Signal]
    public delegate void StreamSnapshotCompletedEventHandler(int generation, int chunkCount);

    [Signal]
    public delegate void StreamBuildFailedEventHandler(int generation, string message);

    [Export]
    public NodePath BridgePath { get; set; } = new NodePath("../SentraVoxelBridge");

    [Export]
    public NodePath ChunksRootPath { get; set; } = new NodePath(".");

    [Export(PropertyHint.Range, "1,2,1")]
    public int StreamRadius { get; set; } = 1;

    [Export(PropertyHint.Range, "1,4,1")]
    public int ChunkApplyCellBudgetPerFrame { get; set; } = 768;

    [Export]
    public Material VoxelMaterial { get; set; }

    private struct ChunkBuildRecord
    {
        public Vector2I Coordinate;
        public int OccupiedCount;
        public int PortalMask;
    }

    private readonly object _completionLock = new object();
    private readonly ChunkBuildRecord[] _buildRecords = new ChunkBuildRecord[MaxChunkCount];
    private readonly byte[][] _occupancyBuffers = new byte[MaxChunkCount][];
    private readonly Vector2I[] _activeCoordinates = new Vector2I[ActiveChunkCapacity];
    private readonly long[] _activeSeeds = new long[ActiveChunkCapacity];
    private readonly MultiMeshInstance3D[] _activeInstances = new MultiMeshInstance3D[ActiveChunkCapacity];

    private Node _bridge;
    private Node3D _chunksRoot;
    private Callable _bridgeRequestCallable;
    private BoxMesh _voxelMesh;
    private Vector2I _requestedCenterChunk;
    private long _requestedSeed;
    private Vector2I _pendingCenterChunk;
    private long _pendingSeed;
    private int _generation;
    private int _workerTaskId = -1;
    private int _completedGeneration = -1;
    private int _completedChunkCount;
    private int _activeCount;
    private int _applyChunkIndex;
    private int _applyCellCursor;
    private int _applyInstanceIndex;
    private int _workerChunkCount;
    private string _completedError = string.Empty;
    private bool _workerBusy;
    private bool _hasPendingRequest;
    private bool _hasBuildResult;
    private bool _chunkBuildStarted;
    private volatile bool _shuttingDown;
    private MultiMeshInstance3D _currentBuildInstance;

    public int CurrentGeneration => _generation;
    public bool WorkerBusy => _workerBusy;
    public int ActiveChunkCount => _activeCount;
    public int PendingChunkCount => _hasBuildResult
        ? _completedChunkCount - _applyChunkIndex
        : (_workerBusy || _hasPendingRequest
            ? (Mathf.Clamp(StreamRadius, 1, MaxStreamRadius) * 2 + 1)
                * (Mathf.Clamp(StreamRadius, 1, MaxStreamRadius) * 2 + 1)
            : 0);

    public override void _Ready()
    {
        StreamRadius = Mathf.Clamp(StreamRadius, 1, MaxStreamRadius);
        ChunkApplyCellBudgetPerFrame = Mathf.Max(64, ChunkApplyCellBudgetPerFrame);
        for (int index = 0; index < MaxChunkCount; index++)
            _occupancyBuffers[index] = new byte[CellsPerChunk];

        _chunksRoot = ChunksRootPath.IsEmpty
            ? this
            : GetNodeOrNull<Node3D>(ChunksRootPath);
        if (_chunksRoot == null)
        {
            GD.PushError("SentraVoxelStreamer: ChunksRootPath must resolve to a Node3D.");
            SetProcess(false);
            return;
        }

        _voxelMesh = new BoxMesh
        {
            Size = Vector3.One,
            Material = VoxelMaterial
        };
        if (!BridgePath.IsEmpty)
        {
            _bridge = GetNodeOrNull<Node>(BridgePath);
            if (_bridge != null && _bridge.HasSignal("voxel_stream_requested"))
            {
                _bridgeRequestCallable = Callable.From<Vector3, long>(OnBridgeStreamRequested);
                _bridge.Connect("voxel_stream_requested", _bridgeRequestCallable);
            }
        }
    }

    public override void _Process(double delta)
    {
        _ = delta;
        if (_shuttingDown) return;
        StreamRadius = Mathf.Clamp(StreamRadius, 1, MaxStreamRadius);
        RetireOneStaleChunk();
        ApplyBuildBatch();
    }

    public override void _ExitTree()
    {
        _shuttingDown = true;
        if (_bridge != null
            && GodotObject.IsInstanceValid(_bridge)
            && _bridge.IsConnected("voxel_stream_requested", _bridgeRequestCallable))
        {
            _bridge.Disconnect("voxel_stream_requested", _bridgeRequestCallable);
        }

        if (_workerTaskId >= 0)
        {
            WorkerThreadPool.WaitForTaskCompletion(_workerTaskId);
            _workerTaskId = -1;
        }
    }

    public int RequestFocus(Vector3 worldPosition, long seed)
    {
        if (_shuttingDown || !IsFinite(worldPosition)) return _generation;
        float maxWorldCoordinate = (int.MaxValue / ChunkSize - MaxStreamRadius) * (float)ChunkSize;
        if (Mathf.Abs(worldPosition.X) > maxWorldCoordinate
            || Mathf.Abs(worldPosition.Z) > maxWorldCoordinate)
        {
            GD.PushWarning("SentraVoxelStreamer: focus position exceeds supported integer chunk coordinates.");
            return _generation;
        }
        Vector2I center = new Vector2I(
            Mathf.FloorToInt(worldPosition.X / ChunkSize),
            Mathf.FloorToInt(worldPosition.Z / ChunkSize));
        if (center == _requestedCenterChunk
            && seed == _requestedSeed
            && (_workerBusy || _hasPendingRequest || _hasBuildResult || HasCompleteDesiredRegion()))
            return _generation;

        _generation++;
        _requestedCenterChunk = center;
        _requestedSeed = seed;
        CancelMainThreadBuild();
        _pendingCenterChunk = center;
        _pendingSeed = seed;
        _hasPendingRequest = true;
        StartPendingBuild();
        return _generation;
    }

    public Godot.Collections.Dictionary GetStreamingStats()
    {
        return new Godot.Collections.Dictionary
        {
            ["generation"] = _generation,
            ["worker_busy"] = _workerBusy,
            ["pending_request"] = _hasPendingRequest,
            ["pending_chunks"] = PendingChunkCount,
            ["active_chunks"] = _activeCount,
            ["stream_radius"] = StreamRadius
        };
    }

    private void StartPendingBuild()
    {
        if (_workerBusy || !_hasPendingRequest || _shuttingDown) return;
        Vector2I center = _pendingCenterChunk;
        long seed = _pendingSeed;
        int generation = _generation;
        int radius = Mathf.Clamp(StreamRadius, 1, MaxStreamRadius);
        _hasPendingRequest = false;
        _workerBusy = true;
        _workerTaskId = WorkerThreadPool.AddTask(
            Callable.From(() => BuildOnWorker(center, seed, generation, radius)),
            false,
            "Build latest voxel chunk neighborhood");
    }

    private void BuildOnWorker(Vector2I center, long seed, int generation, int radius)
    {
        int count = 0;
        string error = string.Empty;
        try
        {
            uint stableSeed = unchecked((uint)seed);
            for (int dz = -radius; dz <= radius; dz++)
            for (int dx = -radius; dx <= radius; dx++)
            {
                Vector2I coordinate = new Vector2I(center.X + dx, center.Y + dz);
                ChunkBuildRecord record = BuildChunk(
                    _occupancyBuffers[count],
                    coordinate,
                    stableSeed);
                _buildRecords[count] = record;
                count++;
            }
        }
        catch (Exception exception)
        {
            error = exception.Message;
        }

        lock (_completionLock)
        {
            _completedGeneration = generation;
            _completedChunkCount = count;
            _completedError = error;
        }
        if (!_shuttingDown)
            CallDeferred(nameof(CompleteBuildOnMainThread), generation);
    }

    public void CompleteBuildOnMainThread(int generation)
    {
        _workerBusy = false;
        _workerTaskId = -1;
        int completedGeneration;
        int chunkCount;
        string error;
        lock (_completionLock)
        {
            completedGeneration = _completedGeneration;
            chunkCount = _completedChunkCount;
            error = _completedError;
        }

        if (!_shuttingDown && generation == _generation && completedGeneration == generation)
        {
            if (!string.IsNullOrEmpty(error))
            {
                _hasBuildResult = false;
                GD.PushError($"SentraVoxelStreamer build failed: {error}");
                EmitSignal(SignalName.StreamBuildFailed, generation, error);
            }
            else
            {
                _workerChunkCount = chunkCount;
                _applyChunkIndex = 0;
                _applyCellCursor = 0;
                _applyInstanceIndex = 0;
                _chunkBuildStarted = false;
                _hasBuildResult = true;
            }
        }
        if (!(_hasBuildResult && completedGeneration == _generation))
            StartPendingBuild();
    }

    private void ApplyBuildBatch()
    {
        if (!_hasBuildResult || _completedGeneration != _generation) return;
        int remainingCells = ChunkApplyCellBudgetPerFrame;
        bool startedChunkThisFrame = false;

        while (remainingCells > 0 && _applyChunkIndex < _workerChunkCount)
        {
            ChunkBuildRecord record = _buildRecords[_applyChunkIndex];
            if (!_chunkBuildStarted)
            {
                if (startedChunkThisFrame) return;
                PrepareChunkInstance(record);
                _chunkBuildStarted = true;
                startedChunkThisFrame = true;
            }

            byte[] occupancy = _occupancyBuffers[_applyChunkIndex];
            MultiMesh multimesh = _currentBuildInstance.Multimesh;
            int inspected = 0;
            while (_applyCellCursor < CellsPerChunk && inspected < remainingCells)
            {
                int cell = _applyCellCursor++;
                inspected++;
                if (occupancy[cell] == 0) continue;
                int x = cell % ChunkSize;
                int yz = cell / ChunkSize;
                int z = yz / ChunkHeight;
                int y = yz - z * ChunkHeight;
                Vector3 worldPosition = new Vector3(
                    record.Coordinate.X * ChunkSize + x + 0.5f,
                    y + 0.5f,
                    record.Coordinate.Y * ChunkSize + z + 0.5f);
                multimesh.SetInstanceTransform(
                    _applyInstanceIndex++,
                    new Transform3D(Basis.Identity, _chunksRoot.ToLocal(worldPosition)));
            }
            remainingCells -= inspected;

            if (_applyCellCursor < CellsPerChunk) return;
            _currentBuildInstance.Visible = true;
            EmitSignal(
                SignalName.ChunkApplied,
                _generation,
                record.Coordinate.X,
                record.Coordinate.Y,
                record.PortalMask);
            _currentBuildInstance = null;
            _applyChunkIndex++;
            _applyCellCursor = 0;
            _applyInstanceIndex = 0;
            _chunkBuildStarted = false;
        }

        if (_applyChunkIndex >= _workerChunkCount)
        {
            _hasBuildResult = false;
            EmitSignal(SignalName.StreamSnapshotCompleted, _generation, _workerChunkCount);
            StartPendingBuild();
        }
    }

    private void PrepareChunkInstance(ChunkBuildRecord record)
    {
        int activeIndex = FindActiveChunk(record.Coordinate);
        if (activeIndex < 0)
        {
            if (_activeCount == ActiveChunkCapacity)
                RemoveActiveChunk(0);

            activeIndex = _activeCount++;
            _activeCoordinates[activeIndex] = record.Coordinate;
            _activeSeeds[activeIndex] = _requestedSeed;
            var instance = new MultiMeshInstance3D
            {
                Name = $"VoxelChunk_{record.Coordinate.X}_{record.Coordinate.Y}",
                CastShadow = GeometryInstance3D.ShadowCastingSettingEnum.Off
            };
            _chunksRoot.AddChild(instance);
            _activeInstances[activeIndex] = instance;
        }

        _activeSeeds[activeIndex] = _requestedSeed;
        _currentBuildInstance = _activeInstances[activeIndex];
        _currentBuildInstance.Visible = false;

        var multimesh = new MultiMesh
        {
            TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
            Mesh = _voxelMesh,
            InstanceCount = record.OccupiedCount
        };
        _currentBuildInstance.Multimesh = multimesh;
    }

    private void RetireOneStaleChunk()
    {
        for (int index = 0; index < _activeCount; index++)
        {
            Vector2I coordinate = _activeCoordinates[index];
            if (Math.Abs(coordinate.X - _requestedCenterChunk.X) <= StreamRadius
                && Math.Abs(coordinate.Y - _requestedCenterChunk.Y) <= StreamRadius)
                continue;
            RemoveActiveChunk(index);
            return;
        }
    }

    private void CancelMainThreadBuild()
    {
        _hasBuildResult = false;
        _workerChunkCount = 0;
        _applyChunkIndex = 0;
        _applyCellCursor = 0;
        _applyInstanceIndex = 0;
        _chunkBuildStarted = false;
        if (GodotObject.IsInstanceValid(_currentBuildInstance))
        {
            int activeIndex = FindActiveInstance(_currentBuildInstance);
            if (activeIndex >= 0)
                RemoveActiveChunk(activeIndex);
            else
                _currentBuildInstance.QueueFree();
        }
        _currentBuildInstance = null;
    }

    private bool HasCompleteDesiredRegion()
    {
        int desiredCount = (StreamRadius * 2 + 1) * (StreamRadius * 2 + 1);
        int found = 0;
        for (int index = 0; index < _activeCount; index++)
        {
            Vector2I coordinate = _activeCoordinates[index];
            if (Math.Abs(coordinate.X - _requestedCenterChunk.X) <= StreamRadius
                && Math.Abs(coordinate.Y - _requestedCenterChunk.Y) <= StreamRadius
                && _activeSeeds[index] == _requestedSeed
                && _activeInstances[index].Visible)
                found++;
        }
        return found == desiredCount;
    }

    private int FindActiveChunk(Vector2I coordinate)
    {
        for (int index = 0; index < _activeCount; index++)
            if (_activeCoordinates[index] == coordinate)
                return index;
        return -1;
    }

    private int FindActiveInstance(MultiMeshInstance3D instance)
    {
        for (int index = 0; index < _activeCount; index++)
            if (_activeInstances[index] == instance)
                return index;
        return -1;
    }

    private void RemoveActiveChunk(int index)
    {
        MultiMeshInstance3D instance = _activeInstances[index];
        if (GodotObject.IsInstanceValid(instance))
            instance.QueueFree();
        int last = --_activeCount;
        if (index == last) return;
        _activeCoordinates[index] = _activeCoordinates[last];
        _activeSeeds[index] = _activeSeeds[last];
        _activeInstances[index] = _activeInstances[last];
    }

    private static ChunkBuildRecord BuildChunk(
        byte[] occupancy,
        Vector2I coordinate,
        uint seed)
    {
        Array.Clear(occupancy, 0, occupancy.Length);
        int occupied = 0;
        for (int z = 0; z < ChunkSize; z++)
        for (int x = 0; x < ChunkSize; x++)
        {
            SetSolid(occupancy, x, 0, z, ref occupied);
            bool edge = x == 0 || x == ChunkSize - 1 || z == 0 || z == ChunkSize - 1;
            if (edge)
            {
                bool doorway = (x == 0 || x == ChunkSize - 1)
                    ? z == ChunkSize / 2
                    : x == ChunkSize / 2;
                if (!doorway)
                {
                    for (int y = 1; y < ChunkHeight - 1; y++)
                        SetSolid(occupancy, x, y, z, ref occupied);
                }
            }
            else if (x != ChunkSize / 2 && z != ChunkSize / 2
                && IsPillar(seed, coordinate, x, z))
            {
                SetSolid(occupancy, x, 1, z, ref occupied);
                SetSolid(occupancy, x, 2, z, ref occupied);
            }
        }

        Vector3I dimensions = new Vector3I(ChunkSize, ChunkHeight, ChunkSize);
        Vector3I gridOrigin = new Vector3I(
            coordinate.X * ChunkSize,
            0,
            coordinate.Y * ChunkSize);
        Vector3 center = new Vector3(
            gridOrigin.X + ChunkSize * 0.5f,
            2.5f,
            gridOrigin.Z + ChunkSize * 0.5f);
        int portals = 0;
        if (!SentraFastMath.RaycastVoxels(
                occupancy, center, new Vector3(0f, 0f, -1f), gridOrigin, dimensions, 8f, out _))
            portals |= PortalNorth;
        if (!SentraFastMath.RaycastVoxels(
                occupancy, center, new Vector3(1f, 0f, 0f), gridOrigin, dimensions, 8f, out _))
            portals |= PortalEast;
        if (!SentraFastMath.RaycastVoxels(
                occupancy, center, new Vector3(0f, 0f, 1f), gridOrigin, dimensions, 8f, out _))
            portals |= PortalSouth;
        if (!SentraFastMath.RaycastVoxels(
                occupancy, center, new Vector3(-1f, 0f, 0f), gridOrigin, dimensions, 8f, out _))
            portals |= PortalWest;

        return new ChunkBuildRecord
        {
            Coordinate = coordinate,
            OccupiedCount = occupied,
            PortalMask = portals
        };
    }

    private void OnBridgeStreamRequested(Vector3 worldPosition, long seed)
    {
        RequestFocus(worldPosition, seed);
    }

    private static void SetSolid(byte[] occupancy, int x, int y, int z, ref int count)
    {
        int index = x + ChunkSize * (y + ChunkHeight * z);
        if (occupancy[index] != 0) return;
        occupancy[index] = 1;
        count++;
    }

    private static bool IsPillar(uint seed, Vector2I coordinate, int x, int z)
    {
        unchecked
        {
            uint value = seed;
            value ^= (uint)(coordinate.X * 73856093);
            value ^= (uint)(coordinate.Y * 19349663);
            value ^= (uint)(x * 83492791);
            value ^= (uint)(z * 2654435761u);
            value ^= value >> 16;
            value *= 0x7feb352du;
            value ^= value >> 15;
            return value % 67u == 0u;
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
}
