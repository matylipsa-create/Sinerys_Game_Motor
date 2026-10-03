using Godot;
using System;

public partial class SentraCharacterController : CharacterBody3D
{
    [Signal]
    public delegate void MovementStateChangedEventHandler(int state);

    [Export]
    public NodePath SentraCorePath { get; set; } = new NodePath("../SentraCoreEngine");

    [Export]
    public NodePath VoxelBridgePath { get; set; } = new NodePath("../OrchestratorVoxelBridge");

    [Export]
    public NodePath AttackRayPath { get; set; } = new NodePath("AttackRay");

    [Export]
    public long WorldSeed { get; set; } = 1;

    [Export(PropertyHint.Range, "0.1,20,0.1")]
    public float WalkSpeed { get; set; } = 4.5f;

    [Export(PropertyHint.Range, "0.1,30,0.1")]
    public float RunSpeed { get; set; } = 7.2f;

    [Export(PropertyHint.Range, "0.1,100,0.1")]
    public float GroundAcceleration { get; set; } = 24f;

    [Export(PropertyHint.Range, "0.1,60,0.1")]
    public float AirAcceleration { get; set; } = 7f;

    [Export(PropertyHint.Range, "0.1,100,0.1")]
    public float GravityMagnitude { get; set; } = 24f;

    [Export(PropertyHint.Range, "0.1,30,0.1")]
    public float DodgeSpeed { get; set; } = 10f;

    [Export(PropertyHint.Range, "0.05,1,0.01")]
    public float DodgeDuration { get; set; } = 0.24f;

    [Export(PropertyHint.Range, "0.05,2,0.01")]
    public float DodgeCooldown { get; set; } = 0.65f;

    [Export(PropertyHint.Range, "0.05,2,0.01")]
    public float AttackStateDuration { get; set; } = 0.18f;

    [Export(PropertyHint.Range, "0.1,1000,0.1")]
    public float AttackDamage { get; set; } = 18f;

    [Export(PropertyHint.Range, "0.1,10,0.1")]
    public float AttackRange { get; set; } = 2.1f;

    [Export(PropertyHint.Layers3DPhysics)]
    public uint AttackCollisionMask { get; set; } = 2;

    [Export(PropertyHint.Range, "0.02,1,0.01")]
    public float TelemetryInterval { get; set; } = 0.1f;

    [Export]
    public string MoveLeftAction { get; set; } = "ui_left";

    [Export]
    public string MoveRightAction { get; set; } = "ui_right";

    [Export]
    public string MoveForwardAction { get; set; } = "ui_up";

    [Export]
    public string MoveBackAction { get; set; } = "ui_down";

    [Export]
    public string RunAction { get; set; } = "sprint";

    [Export]
    public string DodgeAction { get; set; } = "dodge";

    [Export]
    public string AttackAction { get; set; } = "attack";

    public event Action<SentraControllerTelemetry> TelemetrySampled;

    private SentraCoreEngine _sentraCore;
    private Node _voxelBridge;
    private RayCast3D _attackRay;
    private StringName _moveLeft;
    private StringName _moveRight;
    private StringName _moveForward;
    private StringName _moveBack;
    private StringName _runAction;
    private StringName _dodgeAction;
    private StringName _attackAction;
    private SentraMovementState _movementState;
    private Vector3 _dodgeDirection;
    private float _dodgeTimer;
    private float _dodgeCooldownTimer;
    private float _attackTimer;
    private float _telemetryTimer;
    private float _healthRatio = 1f;
    private float _corruption;
    private float _environmentalPressure;
    private float _incomingDamagePerSecond;
    private int _nearbyEnemies;
    private uint _physicsTick;
    private int _actionsInWindow;
    private float _actionWindowTimer;
    private float _actionsPerSecond;
    private Vector2I _lastStreamChunk;
    private bool _hasStreamChunk;

    public SentraMovementState CurrentMovementState => _movementState;
    public bool IsInvulnerable => _dodgeTimer > 0f;

    public override void _Ready()
    {
        _moveLeft = new StringName(MoveLeftAction);
        _moveRight = new StringName(MoveRightAction);
        _moveForward = new StringName(MoveForwardAction);
        _moveBack = new StringName(MoveBackAction);
        _runAction = new StringName(RunAction);
        _dodgeAction = new StringName(DodgeAction);
        _attackAction = new StringName(AttackAction);
        GravityMagnitude = Mathf.Max(0.1f, GravityMagnitude);
        TelemetryInterval = Mathf.Max(0.02f, TelemetryInterval);
        FloorMaxAngle = Mathf.DegToRad(50f);
        FloorSnapLength = 0.25f;
        FloorConstantSpeed = true;
        FloorStopOnSlope = true;

        if (!SentraCorePath.IsEmpty)
            _sentraCore = GetNodeOrNull<SentraCoreEngine>(SentraCorePath);
        if (!VoxelBridgePath.IsEmpty)
            _voxelBridge = GetNodeOrNull<Node>(VoxelBridgePath);

        _attackRay = GetNodeOrNull<RayCast3D>(AttackRayPath);
        if (_attackRay == null)
        {
            _attackRay = new RayCast3D { Name = "AttackRay" };
            AddChild(_attackRay);
        }
        _attackRay.TargetPosition = new Vector3(0f, 0f, -Mathf.Max(0.1f, AttackRange));
        _attackRay.CollisionMask = AttackCollisionMask;
        _attackRay.Enabled = false;
    }

    public override void _PhysicsProcess(double delta)
    {
        float dt = (float)delta;
        if (!IsFinite(dt) || dt <= 0f) return;
        dt = Mathf.Min(dt, 0.1f);
        _physicsTick++;
        UpdateTimers(dt);

        Vector2 input = ReadMovementInput();
        Vector3 right = GlobalBasis.X;
        Vector3 forward = -GlobalBasis.Z;
        Vector3 wishDirection = SentraFastMath.FastNormalizeOrZero(
            right * input.X + forward * -input.Y);
        bool running = HasActionPressed(_runAction);
        TryStartActions(wishDirection);
        UpdateVelocity(wishDirection, running, dt);
        MoveAndSlide();
        QuantizeVelocity();
        UpdateMovementState(wishDirection, running);
        UpdateStreamingFocus();
        UpdateTelemetry(dt);
    }

    public void SetWorldTelemetry(
        float healthRatio,
        float corruption,
        float environmentalPressure,
        int nearbyEnemies,
        float incomingDamagePerSecond)
    {
        _healthRatio = ClampFinite(healthRatio, 0f, 1f);
        _corruption = ClampFinite(corruption, 0f, 1f);
        _environmentalPressure = ClampFinite(environmentalPressure, 0f, 1f);
        _nearbyEnemies = Math.Max(0, nearbyEnemies);
        _incomingDamagePerSecond = ClampFinite(incomingDamagePerSecond, 0f, 10000f);
    }

    public void ApplyKnockback(Vector3 impulse)
    {
        if (!IsFinite(impulse)) return;
        Velocity += impulse;
        _attackTimer = 0f;
    }

    private void TryStartActions(Vector3 wishDirection)
    {
        if (_dodgeTimer <= 0f && _dodgeCooldownTimer <= 0f && WasActionPressed(_dodgeAction))
        {
            Vector3 fallbackForward = SentraFastMath.FastNormalizeOrZero(-GlobalBasis.Z);
            _dodgeDirection = wishDirection.LengthSquared() > 0.001f
                ? wishDirection
                : fallbackForward;
            _dodgeTimer = Mathf.Max(0.05f, DodgeDuration);
            _dodgeCooldownTimer = Mathf.Max(0.05f, DodgeCooldown);
            ReportGameplayEvent(CoreGameplayEventKind.PlayerDodge, 1f);
        }

        if (_dodgeTimer <= 0f && WasActionPressed(_attackAction))
        {
            _attackTimer = Mathf.Max(0.05f, AttackStateDuration);
            _actionsInWindow++;
            ReportGameplayEvent(CoreGameplayEventKind.PlayerAttack, 1f);
            ResolveAttack();
        }
    }

    private void ResolveAttack()
    {
        if (_attackRay == null) return;
        _attackRay.TargetPosition = new Vector3(0f, 0f, -Mathf.Max(0.1f, AttackRange));
        _attackRay.CollisionMask = AttackCollisionMask;
        _attackRay.Enabled = true;
        _attackRay.ForceRaycastUpdate();

        Node target = _attackRay.GetCollider() as Node;
        for (int depth = 0; target != null && depth < 5; depth++, target = target.GetParent())
        {
            if (target is not IDamageable damageable) continue;
            float dealt = damageable.ApplyDamage(
                Mathf.Max(0f, AttackDamage),
                unchecked((long)GetInstanceId()));
            if (dealt > 0f)
                ReportGameplayEvent(CoreGameplayEventKind.PlayerAttackHit, dealt);
            break;
        }

        _attackRay.Enabled = false;
    }

    private void UpdateVelocity(Vector3 wishDirection, bool running, float delta)
    {
        Vector3 velocity = Velocity;
        if (_dodgeTimer > 0f)
        {
            float normalizedTime = 1f - _dodgeTimer / Mathf.Max(0.05f, DodgeDuration);
            float pulse = 0.7f + 0.3f * SentraFastMath.SinLut(normalizedTime * Mathf.Pi);
            velocity.X = _dodgeDirection.X * DodgeSpeed * pulse;
            velocity.Z = _dodgeDirection.Z * DodgeSpeed * pulse;
        }
        else
        {
            float speed = running ? RunSpeed : WalkSpeed;
            Vector3 target = wishDirection * Mathf.Max(0f, speed);
            float acceleration = IsOnFloor() ? GroundAcceleration : AirAcceleration;
            velocity.X = Mathf.MoveToward(velocity.X, target.X, acceleration * delta);
            velocity.Z = Mathf.MoveToward(velocity.Z, target.Z, acceleration * delta);
        }

        if (IsOnFloor() && velocity.Y < 0f)
            velocity.Y = -0.5f;
        else
            velocity.Y -= GravityMagnitude * delta;
        Velocity = velocity;
    }

    private void UpdateTimers(float delta)
    {
        _dodgeTimer = Mathf.Max(0f, _dodgeTimer - delta);
        _dodgeCooldownTimer = Mathf.Max(0f, _dodgeCooldownTimer - delta);
        _attackTimer = Mathf.Max(0f, _attackTimer - delta);
        _actionWindowTimer += delta;
        if (_actionWindowTimer >= 1f)
        {
            _actionsPerSecond = _actionsInWindow / _actionWindowTimer;
            _actionsInWindow = 0;
            _actionWindowTimer -= 1f;
        }
    }

    private void QuantizeVelocity()
    {
        const float FixedScale = 4096f;
        Velocity = new Vector3(
            Mathf.Round(Velocity.X * FixedScale) / FixedScale,
            Mathf.Round(Velocity.Y * FixedScale) / FixedScale,
            Mathf.Round(Velocity.Z * FixedScale) / FixedScale);
    }

    private void UpdateMovementState(Vector3 wishDirection, bool running)
    {
        SentraMovementState next;
        if (_dodgeTimer > 0f)
            next = SentraMovementState.Dodging;
        else if (_attackTimer > 0f)
            next = SentraMovementState.Combat;
        else if (!IsOnFloor())
            next = SentraMovementState.Airborne;
        else if (wishDirection.LengthSquared() < 0.001f)
            next = SentraMovementState.Idle;
        else
            next = running ? SentraMovementState.Running : SentraMovementState.Walking;

        if (next == _movementState) return;
        _movementState = next;
        EmitSignal(SignalName.MovementStateChanged, (int)next);
    }

    private void UpdateTelemetry(float delta)
    {
        _telemetryTimer += delta;
        if (_telemetryTimer < TelemetryInterval) return;
        _telemetryTimer %= TelemetryInterval;

        var telemetry = new SentraControllerTelemetry(
            GlobalPosition,
            Velocity,
            _movementState,
            _physicsTick);
        TelemetrySampled?.Invoke(telemetry);
        _sentraCore?.ReportControllerTelemetry(telemetry);

        Vector2 horizontalVelocity = new Vector2(Velocity.X, Velocity.Z);
        float speedRatio = Mathf.Clamp(
            horizontalVelocity.Length() / Mathf.Max(1f, RunSpeed),
            0f,
            1f);
        _sentraCore?.ReportPlayerTelemetry(new PlayerTelemetry(
            GlobalPosition,
            _healthRatio,
            speedRatio,
            _actionsPerSecond,
            _incomingDamagePerSecond,
            _corruption,
            _environmentalPressure,
            _nearbyEnemies));
        _incomingDamagePerSecond = Mathf.MoveToward(
            _incomingDamagePerSecond,
            0f,
            24f * TelemetryInterval);
    }

    private void UpdateStreamingFocus()
    {
        if (!GodotObject.IsInstanceValid(_voxelBridge)) return;
        Vector2I chunk = new Vector2I(
            Mathf.FloorToInt(GlobalPosition.X / 16f),
            Mathf.FloorToInt(GlobalPosition.Z / 16f));
        if (_hasStreamChunk && chunk == _lastStreamChunk) return;
        _hasStreamChunk = true;
        _lastStreamChunk = chunk;
        _voxelBridge.Call("request_voxel_stream", GlobalPosition, WorldSeed);
    }

    private void ReportGameplayEvent(CoreGameplayEventKind kind, float value)
    {
        _sentraCore?.ReportGameplayEvent(
            kind,
            unchecked((long)GetInstanceId()),
            GlobalPosition,
            value);
    }

    private bool HasActionPressed(StringName action)
    {
        return InputMap.HasAction(action) && Input.IsActionPressed(action);
    }

    private Vector2 ReadMovementInput()
    {
        float x = (HasActionPressed(_moveRight) ? 1f : 0f)
            - (HasActionPressed(_moveLeft) ? 1f : 0f);
        float y = (HasActionPressed(_moveBack) ? 1f : 0f)
            - (HasActionPressed(_moveForward) ? 1f : 0f);
        Vector2 input = new Vector2(x, y);
        return input.LengthSquared() > 1f ? input.Normalized() : input;
    }

    private bool WasActionPressed(StringName action)
    {
        return InputMap.HasAction(action) && Input.IsActionJustPressed(action);
    }

    private static float ClampFinite(float value, float minimum, float maximum)
    {
        return IsFinite(value) ? Mathf.Clamp(value, minimum, maximum) : minimum;
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
