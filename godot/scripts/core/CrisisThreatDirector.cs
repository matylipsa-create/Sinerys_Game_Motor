using Godot;
using System;

public partial class CrisisThreatDirector : Node
{
    [Signal]
    public delegate void CrisisSnapshotUpdatedEventHandler(
        float tension,
        int phase,
        float enemyDensityScale,
        float visibilityScale,
        float lightingScale,
        int spawnBudget,
        int sequence);

    private const double UpdateInterval = 0.1d;
    private const double SnapshotInterval = 0.25d;
    private const float TensionEpsilon = 0.01f;

    [Export(PropertyHint.Range, "0.1,12,0.1")]
    public float ResponseRate { get; set; } = 2.8f;

    [Export(PropertyHint.Range, "0,1,0.01")]
    public float RisingThreshold { get; set; } = 0.32f;

    [Export(PropertyHint.Range, "0,1,0.01")]
    public float CriticalThreshold { get; set; } = 0.68f;

    internal event Action<CrisisSnapshot> SnapshotChanged;
    internal event Action<ThreatDirective> DirectiveIssued;

    private SentraCoreEngine _engine;
    private PlayerTelemetry _playerTelemetry =
        new PlayerTelemetry(Vector3.Zero, 1f, 0f, 0f, 0f, 0f, 0f, 0);
    private double _updateAccumulator;
    private double _snapshotAccumulator;
    private float _eventPressure;
    private float _smoothedTension;
    private uint _sequence;
    private ThreatPhase _phase = ThreatPhase.Calm;
    private CrisisSnapshot _lastPublished;
    private bool _hasPublished;

    public float CurrentTension => _smoothedTension;
    public ThreatPhase CurrentPhase => _phase;
    internal CrisisSnapshot CurrentSnapshot => _hasPublished
        ? _lastPublished
        : BuildSnapshot();

    public override void _Ready()
    {
        ResponseRate = Mathf.Max(0.1f, ResponseRate);
        RisingThreshold = Mathf.Clamp(RisingThreshold, 0f, 0.98f);
        CriticalThreshold = Mathf.Clamp(
            CriticalThreshold,
            RisingThreshold + 0.01f,
            1f);

        _engine = GetParentOrNull<SentraCoreEngine>();
        _engine?.BindCrisisDirector(this);
    }

    public override void _Process(double delta)
    {
        if (delta <= 0d || double.IsNaN(delta) || double.IsInfinity(delta)) return;
        _updateAccumulator += delta;
        _snapshotAccumulator += delta;

        if (_updateAccumulator < UpdateInterval) return;
        double elapsed = _updateAccumulator;
        _updateAccumulator = 0d;
        UpdateTension((float)elapsed);

        if (_snapshotAccumulator >= SnapshotInterval)
        {
            _snapshotAccumulator = 0d;
            PublishIfChanged();
        }
    }

    internal void SubmitPlayerTelemetry(PlayerTelemetry telemetry)
    {
        _playerTelemetry = telemetry;
    }

    internal void RecordGameplayEvent(CoreGameplayEvent gameplayEvent)
    {
        float pressure = gameplayEvent.Kind switch
        {
            CoreGameplayEventKind.PlayerDamage => 0.12f,
            CoreGameplayEventKind.PlayerStagger => 0.16f,
            CoreGameplayEventKind.HighTensionZoneEntered => 0.08f,
            CoreGameplayEventKind.PlayerAttackHit => 0.025f,
            CoreGameplayEventKind.PlayerDodge => 0.015f,
            _ => 0f
        };
        _eventPressure = Mathf.Clamp(_eventPressure + pressure, 0f, 0.35f);
    }

    private void UpdateTension(float elapsed)
    {
        _eventPressure *= Mathf.Exp(-1.65f * elapsed);

        float healthStress = 1f - Mathf.Clamp(_playerTelemetry.HealthRatio, 0f, 1f);
        float enemyStress = Mathf.Clamp(_playerTelemetry.NearbyEnemies / 8f, 0f, 1f);
        float damageStress = Mathf.Clamp(
            _playerTelemetry.IncomingDamagePerSecond / 48f,
            0f,
            1f);
        float actionPace = Mathf.Clamp(_playerTelemetry.ActionsPerSecond / 5f, 0f, 1f);
        float movementPace = Mathf.Clamp(_playerTelemetry.SpeedRatio, 0f, 1f) * 0.35f;
        float paceStress = Mathf.Max(actionPace, movementPace);
        float corruption = Mathf.Clamp(_playerTelemetry.Corruption, 0f, 1f);
        float environment = Mathf.Clamp(
            _playerTelemetry.EnvironmentalPressure,
            0f,
            1f);

        float linearStress =
            enemyStress * 0.22f
            + damageStress * 0.20f
            + healthStress * 0.16f
            + paceStress * 0.12f
            + corruption * 0.15f
            + environment * 0.15f
            + _eventPressure;

        float normalized = Mathf.Clamp(linearStress, 0f, 1f);
        float target = normalized * normalized * (3f - 2f * normalized);
        float alpha = 1f - Mathf.Exp(-ResponseRate * elapsed);
        _smoothedTension = Mathf.Lerp(_smoothedTension, target, alpha);
        _phase = ResolvePhase(_phase, _smoothedTension);
    }

    private ThreatPhase ResolvePhase(ThreatPhase previous, float tension)
    {
        if (previous == ThreatPhase.Critical)
        {
            return tension < CriticalThreshold - 0.12f
                ? ThreatPhase.Recovery
                : ThreatPhase.Critical;
        }

        if (previous == ThreatPhase.Recovery)
        {
            if (tension >= CriticalThreshold) return ThreatPhase.Critical;
            if (tension >= RisingThreshold) return ThreatPhase.Rising;
            return tension < 0.18f ? ThreatPhase.Calm : ThreatPhase.Recovery;
        }

        if (tension >= CriticalThreshold) return ThreatPhase.Critical;
        if (tension >= RisingThreshold) return ThreatPhase.Rising;
        return ThreatPhase.Calm;
    }

    private CrisisSnapshot BuildSnapshot()
    {
        float tension = Mathf.Clamp(_smoothedTension, 0f, 1f);
        float enemyDensity = Mathf.Lerp(0.85f, 1.65f, tension);
        float visibility = Mathf.Lerp(1f, 0.48f, tension);
        float lighting = Mathf.Lerp(1f, 0.62f, tension);
        int spawnBudget = Mathf.RoundToInt(Mathf.Lerp(0f, 5f, tension));
        return new CrisisSnapshot(
            tension,
            _phase,
            enemyDensity,
            visibility,
            lighting,
            spawnBudget,
            _sequence);
    }

    private void PublishIfChanged()
    {
        CrisisSnapshot next = BuildSnapshot();
        bool phaseChanged = !_hasPublished || next.Phase != _lastPublished.Phase;
        bool tensionChanged = !_hasPublished
            || Mathf.Abs(next.Tension - _lastPublished.Tension) >= TensionEpsilon;
        if (!phaseChanged && !tensionChanged) return;

        _sequence++;
        next = new CrisisSnapshot(
            next.Tension,
            next.Phase,
            next.EnemyDensityScale,
            next.VisibilityScale,
            next.LightingScale,
            next.SpawnBudget,
            _sequence);

        ThreatDirectiveKind directive = next.Phase switch
        {
            ThreatPhase.Critical => ThreatDirectiveKind.IncreasePressure,
            ThreatPhase.Rising => ThreatDirectiveKind.HoldPressure,
            ThreatPhase.Recovery or ThreatPhase.Calm => ThreatDirectiveKind.ReleasePressure,
            _ => ThreatDirectiveKind.None
        };

        _lastPublished = next;
        _hasPublished = true;
        SnapshotChanged?.Invoke(next);
        DirectiveIssued?.Invoke(new ThreatDirective(directive, next));
        EmitSignal(
            SignalName.CrisisSnapshotUpdated,
            next.Tension,
            (int)next.Phase,
            next.EnemyDensityScale,
            next.VisibilityScale,
            next.LightingScale,
            next.SpawnBudget,
            (int)next.Sequence);
        _engine?.PublishCrisisSnapshot(next);
    }
}
