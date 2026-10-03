using Godot;
using System;

public partial class PlayerBehaviorAnalyzer : Node
{
    private const double AnalysisInterval = 0.5d;

    [Signal]
    public delegate void BehaviorProfileUpdatedEventHandler(
        int pattern,
        float confidence,
        float aggression,
        float evasion,
        float exploration,
        int sequence);

    internal event Action<PlayerBehaviorProfile> ProfileChanged;

    private float _movementDistance;
    private float _damageTaken;
    private int _attacks;
    private int _attackHits;
    private int _dodges;
    private double _analysisAccumulator;
    private uint _sequence;
    private PlayerBehaviorProfile _currentProfile = new PlayerBehaviorProfile(
        PlayerBehaviorPattern.Exploring,
        0f,
        0f,
        0f,
        0f,
        0);

    internal PlayerBehaviorProfile CurrentProfile => _currentProfile;

    internal void SubmitTelemetry(PlayerTelemetry telemetry)
    {
        _analysisAccumulator += 0.1d;
        _movementDistance += Mathf.Clamp(telemetry.SpeedRatio, 0f, 1f) * 0.1f;
    }

    internal void RecordGameplayEvent(CoreGameplayEvent gameplayEvent)
    {
        switch (gameplayEvent.Kind)
        {
            case CoreGameplayEventKind.PlayerAttack:
                _attacks++;
                break;
            case CoreGameplayEventKind.PlayerAttackHit:
                _attackHits++;
                break;
            case CoreGameplayEventKind.PlayerDamage:
                _damageTaken += Mathf.Max(0f, gameplayEvent.Value);
                break;
            case CoreGameplayEventKind.PlayerDodge:
                _dodges++;
                break;
        }
    }

    public override void _Process(double delta)
    {
        _ = delta;
        if (_analysisAccumulator < AnalysisInterval) return;
        float window = (float)_analysisAccumulator;
        _analysisAccumulator = 0d;
        Analyze(window);
    }

    private void Analyze(float windowSeconds)
    {
        float attacksPerSecond = _attacks / Mathf.Max(0.1f, windowSeconds);
        float hitsPerSecond = _attackHits / Mathf.Max(0.1f, windowSeconds);
        float damageStress = Mathf.Clamp(_damageTaken / 45f, 0f, 1f);
        float movement = Mathf.Clamp(_movementDistance / Mathf.Max(0.1f, windowSeconds), 0f, 1f);
        float aggression = Mathf.Clamp(
            attacksPerSecond * 0.12f + hitsPerSecond * 0.18f,
            0f,
            1f);
        float evasion = Mathf.Clamp(
            damageStress * 0.45f + (_dodges / Mathf.Max(1f, _attacks + _dodges)) * 0.55f,
            0f,
            1f);
        float exploration = Mathf.Clamp(
            movement * (1f - aggression) * (1f - damageStress),
            0f,
            1f);

        PlayerBehaviorPattern pattern;
        float confidence;
        if (damageStress > 0.35f && movement > 0.4f && aggression < 0.35f)
        {
            pattern = PlayerBehaviorPattern.Fleeing;
            confidence = Mathf.Clamp(damageStress * 0.55f + evasion * 0.45f, 0f, 1f);
        }
        else if (aggression >= 0.42f)
        {
            pattern = PlayerBehaviorPattern.Aggressive;
            confidence = aggression;
        }
        else if (movement < 0.12f && attacksPerSecond < 0.1f)
        {
            pattern = PlayerBehaviorPattern.Passive;
            confidence = 1f - Mathf.Max(movement, attacksPerSecond);
        }
        else
        {
            pattern = PlayerBehaviorPattern.Exploring;
            confidence = exploration;
        }

        PlayerBehaviorProfile nextProfile = new PlayerBehaviorProfile(
            pattern,
            confidence,
            aggression,
            evasion,
            exploration,
            _sequence + 1);
        if (_currentProfile.Pattern == nextProfile.Pattern
            && Mathf.Abs(_currentProfile.Confidence - nextProfile.Confidence) < 0.05f
            && Mathf.Abs(_currentProfile.Aggression - nextProfile.Aggression) < 0.05f
            && Mathf.Abs(_currentProfile.Evasion - nextProfile.Evasion) < 0.05f)
        {
            ResetWindow();
            return;
        }

        _sequence++;
        _currentProfile = new PlayerBehaviorProfile(
            nextProfile.Pattern,
            nextProfile.Confidence,
            nextProfile.Aggression,
            nextProfile.Evasion,
            nextProfile.Exploration,
            _sequence);
        ProfileChanged?.Invoke(_currentProfile);
        EmitSignal(
            SignalName.BehaviorProfileUpdated,
            (int)pattern,
            confidence,
            aggression,
            evasion,
            exploration,
            (int)_sequence);

        ResetWindow();
    }

    private void ResetWindow()
    {
        _analysisAccumulator = 0d;
        _movementDistance = 0f;
        _damageTaken = 0f;
        _attacks = 0;
        _attackHits = 0;
        _dodges = 0;
    }
}
