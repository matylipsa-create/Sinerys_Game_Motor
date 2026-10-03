using Godot;

public enum CoreGameplayEventKind : byte
{
    PlayerAttack,
    PlayerAttackHit,
    PlayerDamage,
    PlayerDodge,
    PlayerStagger,
    HighTensionZoneEntered
}

public enum ThreatPhase : byte
{
    Calm,
    Rising,
    Critical,
    Recovery
}

public enum ThreatDirectiveKind : byte
{
    None,
    IncreasePressure,
    HoldPressure,
    ReleasePressure
}

public readonly struct CoreGameplayEvent
{
    public readonly CoreGameplayEventKind Kind;
    public readonly long EntityId;
    public readonly Vector3 Position;
    public readonly float Value;
    public readonly double SimulationTime;

    public CoreGameplayEvent(
        CoreGameplayEventKind kind,
        long entityId,
        Vector3 position,
        float value,
        double simulationTime)
    {
        Kind = kind;
        EntityId = entityId;
        Position = position;
        Value = value;
        SimulationTime = simulationTime;
    }
}

public readonly struct PlayerTelemetry
{
    public readonly Vector3 Position;
    public readonly float HealthRatio;
    public readonly float SpeedRatio;
    public readonly float ActionsPerSecond;
    public readonly float IncomingDamagePerSecond;
    public readonly float Corruption;
    public readonly float EnvironmentalPressure;
    public readonly int NearbyEnemies;

    public PlayerTelemetry(
        Vector3 position,
        float healthRatio,
        float speedRatio,
        float actionsPerSecond,
        float incomingDamagePerSecond,
        float corruption,
        float environmentalPressure,
        int nearbyEnemies)
    {
        Position = position;
        HealthRatio = healthRatio;
        SpeedRatio = speedRatio;
        ActionsPerSecond = actionsPerSecond;
        IncomingDamagePerSecond = incomingDamagePerSecond;
        Corruption = corruption;
        EnvironmentalPressure = environmentalPressure;
        NearbyEnemies = nearbyEnemies;
    }
}

public readonly struct CrisisSnapshot
{
    public readonly float Tension;
    public readonly ThreatPhase Phase;
    public readonly float EnemyDensityScale;
    public readonly float VisibilityScale;
    public readonly float LightingScale;
    public readonly int SpawnBudget;
    public readonly uint Sequence;

    public CrisisSnapshot(
        float tension,
        ThreatPhase phase,
        float enemyDensityScale,
        float visibilityScale,
        float lightingScale,
        int spawnBudget,
        uint sequence)
    {
        Tension = tension;
        Phase = phase;
        EnemyDensityScale = enemyDensityScale;
        VisibilityScale = visibilityScale;
        LightingScale = lightingScale;
        SpawnBudget = spawnBudget;
        Sequence = sequence;
    }
}

public readonly struct ThreatDirective
{
    public readonly ThreatDirectiveKind Kind;
    public readonly CrisisSnapshot Snapshot;

    public ThreatDirective(ThreatDirectiveKind kind, CrisisSnapshot snapshot)
    {
        Kind = kind;
        Snapshot = snapshot;
    }
}
