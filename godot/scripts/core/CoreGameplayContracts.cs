using Godot;
using System;

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

public enum PlayerBehaviorPattern : byte
{
    Exploring,
    Aggressive,
    Passive,
    Fleeing
}

public enum SentraMovementState : byte
{
    Idle,
    Walking,
    Running,
    Dodging,
    Combat,
    Airborne
}

public readonly struct SentraControllerTelemetry
{
    public readonly Vector3 Position;
    public readonly Vector3 Velocity;
    public readonly SentraMovementState State;
    public readonly uint PhysicsTick;

    public SentraControllerTelemetry(
        Vector3 position,
        Vector3 velocity,
        SentraMovementState state,
        uint physicsTick)
    {
        Position = position;
        Velocity = velocity;
        State = state;
        PhysicsTick = physicsTick;
    }
}

[Flags]
public enum PerceptionSenseFlags : byte
{
    None = 0,
    Vision = 1 << 0,
    Noise = 1 << 1,
    TensionTrail = 1 << 2
}

public readonly struct PlayerBehaviorProfile
{
    public readonly PlayerBehaviorPattern Pattern;
    public readonly float Confidence;
    public readonly float Aggression;
    public readonly float Evasion;
    public readonly float Exploration;
    public readonly uint Sequence;

    public PlayerBehaviorProfile(
        PlayerBehaviorPattern pattern,
        float confidence,
        float aggression,
        float evasion,
        float exploration,
        uint sequence)
    {
        Pattern = pattern;
        Confidence = confidence;
        Aggression = aggression;
        Evasion = evasion;
        Exploration = exploration;
        Sequence = sequence;
    }
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

public readonly struct PerceptionEntitySample
{
    public readonly long EntityId;
    public readonly Vector3 Position;
    public readonly Vector3 Forward;
    public readonly float Noise;
    public readonly float TensionTrail;
    public readonly uint FactionMask;
    public readonly bool IsPlayer;
    public readonly bool IsActive;

    public PerceptionEntitySample(
        long entityId,
        Vector3 position,
        Vector3 forward,
        float noise,
        float tensionTrail,
        uint factionMask,
        bool isPlayer,
        bool isActive)
    {
        EntityId = entityId;
        Position = position;
        Forward = forward;
        Noise = noise;
        TensionTrail = tensionTrail;
        FactionMask = factionMask;
        IsPlayer = isPlayer;
        IsActive = isActive;
    }
}

public readonly struct PerceptionObserver
{
    public readonly long EntityId;
    public readonly Vector3 Position;
    public readonly Vector3 Forward;
    public readonly uint FriendlyFactionMask;
    public readonly float VisionRange;
    public readonly float VisionCosHalfAngle;
    public readonly float HearingRange;
    public readonly float TensionSenseRange;
    public readonly float TensionSenseThreshold;

    public PerceptionObserver(
        long entityId,
        Vector3 position,
        Vector3 forward,
        uint friendlyFactionMask,
        float visionRange,
        float visionCosHalfAngle,
        float hearingRange,
        float tensionSenseRange,
        float tensionSenseThreshold)
    {
        EntityId = entityId;
        Position = position;
        Forward = forward;
        FriendlyFactionMask = friendlyFactionMask;
        VisionRange = visionRange;
        VisionCosHalfAngle = visionCosHalfAngle;
        HearingRange = hearingRange;
        TensionSenseRange = tensionSenseRange;
        TensionSenseThreshold = tensionSenseThreshold;
    }
}

public readonly struct PerceptionResult
{
    public readonly long ObserverId;
    public readonly long TargetId;
    public readonly PerceptionSenseFlags Senses;
    public readonly float Strength;

    public PerceptionResult(
        long observerId,
        long targetId,
        PerceptionSenseFlags senses,
        float strength)
    {
        ObserverId = observerId;
        TargetId = targetId;
        Senses = senses;
        Strength = strength;
    }
}

public readonly struct PerceptionBatchView
{
    public readonly int Generation;
    public readonly PerceptionResult[] Results;
    public readonly int Count;
    public readonly int DroppedResults;

    public PerceptionBatchView(
        int generation,
        PerceptionResult[] results,
        int count,
        int droppedResults)
    {
        Generation = generation;
        Results = results;
        Count = count;
        DroppedResults = droppedResults;
    }
}
