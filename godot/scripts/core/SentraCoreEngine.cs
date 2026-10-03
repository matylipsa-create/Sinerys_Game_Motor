using Godot;
using System;
using System.Collections.Generic;

public partial class SentraCoreEngine : Node
{
    private const int GameplayEventCapacity = 512;
    private readonly Dictionary<string, GameEntityData> _entities =
        new Dictionary<string, GameEntityData>(StringComparer.Ordinal);
    private readonly CoreGameplayEvent[] _gameplayEvents =
        new CoreGameplayEvent[GameplayEventCapacity];
    private int _eventReadIndex;
    private int _eventWriteIndex;
    private int _eventCount;
    private double _simulationTime;
    private CrisisThreatDirector _crisisDirector;
    private PlayerBehaviorAnalyzer _behaviorAnalyzer;
    private PerceptionFieldProcessor _perceptionProcessor;
    private CrisisSnapshot _latestCrisis;

    [Export(PropertyHint.Range, "1,240,1")]
    public int TickRate { get; set; } = 60;

    [Export]
    public NodePath CrisisDirectorPath { get; set; } = new NodePath("CrisisThreatDirector");

    [Export]
    public NodePath BehaviorAnalyzerPath { get; set; } = new NodePath("PlayerBehaviorAnalyzer");

    [Export]
    public NodePath PerceptionProcessorPath { get; set; } = new NodePath("PerceptionFieldProcessor");

    [Export(PropertyHint.Range, "1,100,1")]
    public float ThreatRadius { get; set; } = 18f;

    internal event Action<CoreGameplayEvent> GameplayEventPublished;
    internal event Action<CrisisSnapshot> CrisisSnapshotPublished;

    internal CrisisSnapshot LatestCrisis => _latestCrisis;
    public int PendingGameplayEventCount => _eventCount;
    public int DroppedGameplayEventCount { get; private set; }

    public long GetManagedHeapBytes()
    {
        return GC.GetTotalMemory(false);
    }

    public override void _Ready()
    {
        TickRate = Mathf.Clamp(TickRate, 1, 240);
        ThreatRadius = Mathf.Max(1f, ThreatRadius);
        if (!CrisisDirectorPath.IsEmpty)
        {
            _crisisDirector = GetNodeOrNull<CrisisThreatDirector>(CrisisDirectorPath);
            _crisisDirector?.BindEngine(this);
        }
        if (!BehaviorAnalyzerPath.IsEmpty)
        {
            _behaviorAnalyzer = GetNodeOrNull<PlayerBehaviorAnalyzer>(BehaviorAnalyzerPath);
            if (_behaviorAnalyzer != null)
                _behaviorAnalyzer.ProfileChanged += OnBehaviorProfileChanged;
        }
        if (!PerceptionProcessorPath.IsEmpty)
            _perceptionProcessor = GetNodeOrNull<PerceptionFieldProcessor>(PerceptionProcessorPath);
        GD.Print("[Sentra Core C#] Initialized agnostic engine runtime for Godot.");
    }

    public override void _Process(double delta)
    {
        if (double.IsNaN(delta) || double.IsInfinity(delta) || delta <= 0d) return;
        _simulationTime += delta;
    }

    internal void BindCrisisDirector(CrisisThreatDirector director)
    {
        _crisisDirector = director;
    }

    internal int SubmitPerceptionSnapshot(
        PerceptionEntitySample[] entities,
        int entityCount,
        PerceptionObserver[] observers,
        int observerCount)
    {
        if (_perceptionProcessor == null)
            throw new InvalidOperationException(
                "PerceptionFieldProcessor was not found at PerceptionProcessorPath.");
        return _perceptionProcessor.SubmitSnapshot(
            entities,
            entityCount,
            observers,
            observerCount);
    }

    internal void ReportPlayerTelemetry(PlayerTelemetry telemetry)
    {
        _behaviorAnalyzer?.SubmitTelemetry(telemetry);
        int nearbyEntities = CountNearbyThreats(telemetry.Position, ThreatRadius);
        int nearbyEnemies = Mathf.Max(telemetry.NearbyEnemies, nearbyEntities);
        _crisisDirector?.SubmitPlayerTelemetry(new PlayerTelemetry(
            telemetry.Position,
            telemetry.HealthRatio,
            telemetry.SpeedRatio,
            telemetry.ActionsPerSecond,
            telemetry.IncomingDamagePerSecond,
            telemetry.Corruption,
            telemetry.EnvironmentalPressure,
            nearbyEnemies));
    }

    private void OnBehaviorProfileChanged(PlayerBehaviorProfile profile)
    {
        _crisisDirector?.SubmitBehaviorProfile(profile);
    }

    private int CountNearbyThreats(Vector3 position, float radius)
    {
        float radiusSquared = radius * radius;
        int count = 0;
        foreach (GameEntityData entity in _entities.Values)
        {
            if (entity.Type != GameEntityType.Chimera) continue;
            float dx = entity.X - position.X;
            float dz = entity.Y - position.Z;
            if (dx * dx + dz * dz <= radiusSquared) count++;
        }
        return count;
    }

    internal void ReportGameplayEvent(
        CoreGameplayEventKind kind,
        long entityId,
        Vector3 position,
        float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return;
        var gameplayEvent = new CoreGameplayEvent(
            kind,
            entityId,
            position,
            value,
            _simulationTime);

        _crisisDirector?.RecordGameplayEvent(gameplayEvent);
        _behaviorAnalyzer?.RecordGameplayEvent(gameplayEvent);
        if (_eventCount == GameplayEventCapacity)
        {
            DroppedGameplayEventCount++;
            _eventReadIndex = (_eventReadIndex + 1) % GameplayEventCapacity;
            _eventCount--;
        }

        _gameplayEvents[_eventWriteIndex] = gameplayEvent;
        _eventWriteIndex = (_eventWriteIndex + 1) % GameplayEventCapacity;
        _eventCount++;
        GameplayEventPublished?.Invoke(gameplayEvent);
    }

    internal bool TryDequeueGameplayEvent(out CoreGameplayEvent gameplayEvent)
    {
        if (_eventCount == 0)
        {
            gameplayEvent = default;
            return false;
        }

        gameplayEvent = _gameplayEvents[_eventReadIndex];
        _eventReadIndex = (_eventReadIndex + 1) % GameplayEventCapacity;
        _eventCount--;
        return true;
    }

    internal void PublishCrisisSnapshot(CrisisSnapshot snapshot)
    {
        _latestCrisis = snapshot;
        CrisisSnapshotPublished?.Invoke(snapshot);
    }

    public override void _ExitTree()
    {
        if (_behaviorAnalyzer != null)
            _behaviorAnalyzer.ProfileChanged -= OnBehaviorProfileChanged;
    }

    public void RegisterEntity(GameEntityData entity)
    {
        if (entity == null) throw new ArgumentNullException(nameof(entity));
        if (string.IsNullOrWhiteSpace(entity.Id))
            throw new ArgumentException("Entity id cannot be empty.", nameof(entity));
        if (float.IsNaN(entity.X) || float.IsInfinity(entity.X) ||
            float.IsNaN(entity.Y) || float.IsInfinity(entity.Y))
            throw new ArgumentException("Entity coordinates must be finite numbers.", nameof(entity));

        _entities[entity.Id] = entity.Copy();
    }

    public bool UpdateEntityState(string id, float x, float y, EntityStatus status)
    {
        if (string.IsNullOrWhiteSpace(id)) return false;
        if (float.IsNaN(x) || float.IsInfinity(x) || float.IsNaN(y) || float.IsInfinity(y)) return false;
        if (status == null || !_entities.TryGetValue(id, out GameEntityData entity)) return false;

        entity.X = x;
        entity.Y = y;
        entity.Status = status.CopyNormalized();
        return true;
    }

    public bool RemoveEntity(string id)
    {
        return !string.IsNullOrWhiteSpace(id) && _entities.Remove(id);
    }

    public GameEntityData GetEntity(string id)
    {
        return !string.IsNullOrWhiteSpace(id) && _entities.TryGetValue(id, out GameEntityData entity)
            ? entity.Copy()
            : null;
    }

    public Godot.Collections.Array<GameEntityData> GetEntities()
    {
        var snapshot = new Godot.Collections.Array<GameEntityData>();
        foreach (GameEntityData entity in _entities.Values)
        {
            snapshot.Add(entity.Copy());
        }
        return snapshot;
    }

    public GrinderResult ProcessGrinder(Godot.Collections.Array<string> inputItems)
    {
        if (inputItems == null) throw new ArgumentNullException(nameof(inputItems));

        int organicCount = 0;
        int techCount = 0;
        foreach (string item in inputItems)
        {
            if (string.IsNullOrWhiteSpace(item)) continue;

            if (item.IndexOf("spore", StringComparison.OrdinalIgnoreCase) >= 0 ||
                item.IndexOf("tissue", StringComparison.OrdinalIgnoreCase) >= 0)
                organicCount++;

            if (item.IndexOf("metal", StringComparison.OrdinalIgnoreCase) >= 0 ||
                item.IndexOf("circuit", StringComparison.OrdinalIgnoreCase) >= 0)
                techCount++;
        }

        if (organicCount > techCount)
            return CreateGrinderResult("Suero Estabilizador de Esporas", organicCount * 15);
        if (techCount > organicCount)
            return CreateGrinderResult("Aleación Reforzada de Titanio", techCount * 20);
        return CreateGrinderResult("Biomasa Sintética Neutra", 50);
    }

    private static GrinderResult CreateGrinderResult(string reward, int quality)
    {
        return new GrinderResult { Reward = reward, Quality = Mathf.Clamp(quality, 0, 100) };
    }
}