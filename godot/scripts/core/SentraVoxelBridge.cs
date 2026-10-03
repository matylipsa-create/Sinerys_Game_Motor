using Godot;

public partial class SentraVoxelBridge : Node
{
    [Signal]
    public delegate void VoxelStreamRequestedEventHandler(Vector3 center, long seed);

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
    public NodePath StreamerPath { get; set; } = new NodePath("../SentraVoxelStreamer");

    private SentraVoxelStreamer _streamer;
    private Callable _chunkAppliedCallable;
    private Callable _snapshotCompletedCallable;
    private Callable _buildFailedCallable;

    public override void _Ready()
    {
        if (StreamerPath.IsEmpty)
            return;

        _streamer = GetNodeOrNull<SentraVoxelStreamer>(StreamerPath);
        if (_streamer == null)
        {
            GD.PushError("SentraVoxelBridge: StreamerPath must resolve to SentraVoxelStreamer.");
            return;
        }

        _chunkAppliedCallable = Callable.From<int, int, int, int>(OnChunkApplied);
        _snapshotCompletedCallable = Callable.From<int, int>(OnStreamSnapshotCompleted);
        _buildFailedCallable = Callable.From<int, string>(OnStreamBuildFailed);

        ConnectStreamerSignal(
            "chunk_applied",
            _chunkAppliedCallable);
        ConnectStreamerSignal(
            "stream_snapshot_completed",
            _snapshotCompletedCallable);
        ConnectStreamerSignal(
            "stream_build_failed",
            _buildFailedCallable);
    }

    public override void _ExitTree()
    {
        DisconnectStreamerSignal("chunk_applied", _chunkAppliedCallable);
        DisconnectStreamerSignal("stream_snapshot_completed", _snapshotCompletedCallable);
        DisconnectStreamerSignal("stream_build_failed", _buildFailedCallable);
    }

    public void RequestVoxelStream(Vector3 worldPosition, long seed)
    {
        if (!IsFinite(worldPosition))
        {
            GD.PushWarning("SentraVoxelBridge: ignored a non-finite stream position.");
            return;
        }

        EmitSignal(SignalName.VoxelStreamRequested, worldPosition, seed);
    }

    private void OnChunkApplied(int generation, int chunkX, int chunkZ, int portalMask)
    {
        EmitSignal(
            SignalName.ChunkApplied,
            generation,
            chunkX,
            chunkZ,
            portalMask);
    }

    private void OnStreamSnapshotCompleted(int generation, int chunkCount)
    {
        EmitSignal(SignalName.StreamSnapshotCompleted, generation, chunkCount);
    }

    private void OnStreamBuildFailed(int generation, string message)
    {
        EmitSignal(SignalName.StreamBuildFailed, generation, message);
    }

    private void ConnectStreamerSignal(string signalName, Callable callable)
    {
        StringName signal = new StringName(signalName);
        Error result = _streamer.Connect(signal, callable);
        if (result != Error.Ok)
            GD.PushError($"SentraVoxelBridge: failed to connect streamer signal '{signalName}': {result}.");
    }

    private void DisconnectStreamerSignal(string signalName, Callable callable)
    {
        if (_streamer == null || !GodotObject.IsInstanceValid(_streamer))
            return;

        StringName signal = new StringName(signalName);
        if (_streamer.IsConnected(signal, callable))
            _streamer.Disconnect(signal, callable);
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
