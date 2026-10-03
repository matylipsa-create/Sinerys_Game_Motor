using Godot;
using System;

public partial class DungeonStreamingService : Node
{
    [Signal]
    public delegate void LayoutReadyEventHandler(int generation, int roomCount, int connectionCount);

    [Signal]
    public delegate void LayoutGenerationFailedEventHandler(int generation, string message);

    private sealed class CompletedBuild
    {
        public readonly int Generation;
        public readonly DungeonLayout Layout;
        public readonly string Error;

        public CompletedBuild(int generation, DungeonLayout layout, string error)
        {
            Generation = generation;
            Layout = layout;
            Error = error;
        }
    }

    private readonly object _completionLock = new object();
    private CompletedBuild _completedBuild;
    private DungeonGenerationRequest _pendingRequest;
    private bool _hasPendingRequest;
    private bool _workerBusy;
    private volatile bool _shuttingDown;
    private int _workerTaskId = -1;
    private int _generation;
    private int _currentLayoutGeneration;
    private DungeonLayout _currentLayout;

    internal event Action<DungeonLayout> LayoutChanged;

    public int CurrentGeneration => _generation;
    internal DungeonLayout CurrentLayout => _currentLayout;

    public override void _ExitTree()
    {
        _shuttingDown = true;
        if (_workerTaskId >= 0)
        {
            WorkerThreadPool.WaitForTaskCompletion(_workerTaskId);
            _workerTaskId = -1;
        }
    }

    public int RequestGeneration(
        long seed,
        int roomCount,
        float corruption,
        float currentTension,
        long decisionFlags,
        int floorIndex)
    {
        if (_shuttingDown) return _generation;

        _generation++;
        _pendingRequest = new DungeonGenerationRequest(
            unchecked((uint)seed),
            roomCount,
            corruption,
            currentTension,
            (DungeonDecisionFlags)unchecked((uint)decisionFlags),
            floorIndex);
        _hasPendingRequest = true;
        StartPendingBuild();
        return _generation;
    }

    public Godot.Collections.Dictionary GetLayoutSnapshot()
    {
        var snapshot = new Godot.Collections.Dictionary();
        if (_currentLayout == null)
        {
            snapshot["ready"] = false;
            snapshot["generation"] = _generation;
            snapshot["requested_generation"] = _generation;
            return snapshot;
        }

        var rooms = new Godot.Collections.Array<Godot.Collections.Dictionary>();
        foreach (DungeonRoomData room in _currentLayout.Rooms)
        {
            rooms.Add(new Godot.Collections.Dictionary
            {
                ["id"] = room.Id,
                ["kind"] = (int)room.Kind,
                ["grid_x"] = room.GridPosition.X,
                ["grid_y"] = room.GridPosition.Y,
                ["half_width"] = room.HalfExtents.X,
                ["half_height"] = room.HalfExtents.Y,
                ["tension_anchor"] = room.TensionAnchor,
                ["enemy_budget"] = room.EnemyBudget,
                ["narrative_variant"] = (int)room.NarrativeVariant,
                ["sealed_combat_room"] = room.SealedCombatRoom
            });
        }

        var connections = new Godot.Collections.Array<Godot.Collections.Dictionary>();
        foreach (DungeonConnectionData connection in _currentLayout.Connections)
        {
            connections.Add(new Godot.Collections.Dictionary
            {
                ["from"] = connection.FromRoomId,
                ["to"] = connection.ToRoomId,
                ["kind"] = (int)connection.Kind
            });
        }

        var spawns = new Godot.Collections.Array<Godot.Collections.Dictionary>();
        foreach (DungeonSpawnData spawn in _currentLayout.Spawns)
        {
            spawns.Add(new Godot.Collections.Dictionary
            {
                ["room_id"] = spawn.RoomId,
                ["local_x"] = spawn.LocalGridPosition.X,
                ["local_y"] = spawn.LocalGridPosition.Y,
                ["archetype"] = (int)spawn.Archetype,
                ["ambient_pressure"] = spawn.AmbientPressure
            });
        }

        snapshot["ready"] = true;
        snapshot["generation"] = _currentLayoutGeneration;
        snapshot["requested_generation"] = _generation;
        snapshot["seed"] = (long)_currentLayout.Seed;
        snapshot["floor_index"] = _currentLayout.FloorIndex;
        snapshot["corruption"] = _currentLayout.Corruption;
        snapshot["tension"] = _currentLayout.Tension;
        snapshot["rooms"] = rooms;
        snapshot["connections"] = connections;
        snapshot["spawns"] = spawns;
        return snapshot;
    }

    private void StartPendingBuild()
    {
        if (_workerBusy || !_hasPendingRequest || _shuttingDown) return;

        DungeonGenerationRequest request = _pendingRequest;
        int generation = _generation;
        _hasPendingRequest = false;
        _workerBusy = true;

        _workerTaskId = WorkerThreadPool.AddTask(
            Callable.From(() => BuildOnWorker(request, generation)),
            false,
            "Generate deterministic dungeon graph");
    }

    private void BuildOnWorker(DungeonGenerationRequest request, int generation)
    {
        DungeonLayout layout = null;
        string error = string.Empty;
        try
        {
            layout = DungeonGraphGenerator.Generate(request);
        }
        catch (Exception exception)
        {
            error = exception.Message;
        }

        lock (_completionLock)
        {
            _completedBuild = new CompletedBuild(generation, layout, error);
        }

        if (!_shuttingDown)
            CallDeferred(nameof(CompleteBuildOnMainThread));
    }

    public void CompleteBuildOnMainThread()
    {
        CompletedBuild completed;
        lock (_completionLock)
        {
            completed = _completedBuild;
            _completedBuild = null;
        }

        _workerBusy = false;
        _workerTaskId = -1;

        if (!_shuttingDown && completed != null && completed.Generation == _generation)
        {
            if (!string.IsNullOrEmpty(completed.Error))
            {
                GD.PushError($"Dungeon generation failed: {completed.Error}");
                EmitSignal(
                    SignalName.LayoutGenerationFailed,
                    completed.Generation,
                    completed.Error);
            }
            else
            {
                _currentLayout = completed.Layout;
                _currentLayoutGeneration = completed.Generation;
                EmitSignal(
                    SignalName.LayoutReady,
                    completed.Generation,
                    completed.Layout.Rooms.Length,
                    completed.Layout.Connections.Length);
                LayoutChanged?.Invoke(completed.Layout);
            }
        }

        StartPendingBuild();
    }
}
