using Godot;

public enum GameplayMovementState : byte
{
    Idle,
    Walk,
    Run,
    Combat,
    Dodge,
    Stagger
}

public partial class FirstPersonController : CharacterBody3D
{
    [Signal]
    public delegate void GameplayStateChangedEventHandler(int state);

    [Export] public NodePath CameraPath { get; set; } = new NodePath("Camera3D");
    [Export] public NodePath AttackRayPath { get; set; } = new NodePath("Camera3D/AttackRay");
    [Export] public NodePath SentraCorePath { get; set; } = new NodePath("../SentraCoreEngine");
    [Export] public float MouseSensitivity { get; set; } = 0.003f;
    [Export] public float WalkSpeed { get; set; } = 4.5f;
    [Export] public float RunSpeed { get; set; } = 7.2f;
    [Export] public float GroundAcceleration { get; set; } = 24f;
    [Export] public float AirAcceleration { get; set; } = 7f;
    [Export] public float GroundFriction { get; set; } = 28f;
    [Export] public float CustomGravity { get; set; } = 24f;
    [Export] public float DodgeSpeed { get; set; } = 10f;
    [Export] public float DodgeDuration { get; set; } = 0.24f;
    [Export] public float DodgeCooldown { get; set; } = 0.65f;
    [Export] public float StaggerDuration { get; set; } = 0.35f;
    [Export] public float AttackCooldown { get; set; } = 0.42f;
    [Export] public float AttackDamage { get; set; } = 18f;
    [Export] public float AttackRange { get; set; } = 2.1f;
    [Export(PropertyHint.Layers3DPhysics)] public uint AttackCollisionMask { get; set; } = 2;
    [Export] public string MoveLeftAction { get; set; } = "ui_left";
    [Export] public string MoveRightAction { get; set; } = "ui_right";
    [Export] public string MoveForwardAction { get; set; } = "ui_up";
    [Export] public string MoveBackAction { get; set; } = "ui_down";
    [Export] public string SprintAction { get; set; } = "sprint";
    [Export] public string DodgeAction { get; set; } = "dodge";
    [Export] public string AttackAction { get; set; } = "attack";

    private Camera3D _camera;
    private RayCast3D _attackRay;
    private SentraCoreEngine _sentraCore;
    private GameplayMovementState _movementState;
    private StringName _moveLeft;
    private StringName _moveRight;
    private StringName _moveForward;
    private StringName _moveBack;
    private StringName _sprint;
    private StringName _dodge;
    private StringName _attack;
    private float _rotationX;
    private float _gravity;
    private float _dodgeTimer;
    private float _dodgeCooldownTimer;
    private float _combatTimer;
    private float _attackCooldownTimer;
    private float _staggerTimer;
    private float _telemetryTimer;
    private float _actionWindowTimer;
    private float _actionsPerSecond;
    private float _playerHealthRatio = 1f;
    private float _incomingDamagePerSecond;
    private float _corruption;
    private float _environmentalPressure;
    private float _damageTelemetryTimer;
    private int _nearbyEnemies;
    private int _actionsInWindow;
    private bool _insideHighTensionZone;
    private Vector3 _dodgeDirection;

    public GameplayMovementState CurrentMovementState => _movementState;
    public bool IsInvulnerable => _dodgeTimer > 0f;

    public override void _Ready()
    {
        _camera = GetNodeOrNull<Camera3D>(CameraPath);
        _attackRay = GetNodeOrNull<RayCast3D>(AttackRayPath);
        if (_attackRay == null)
            _attackRay = CreateAttackRay();
        _attackRay.Enabled = false;

        if (!SentraCorePath.IsEmpty)
            _sentraCore = GetNodeOrNull<SentraCoreEngine>(SentraCorePath);

        _moveLeft = new StringName(MoveLeftAction);
        _moveRight = new StringName(MoveRightAction);
        _moveForward = new StringName(MoveForwardAction);
        _moveBack = new StringName(MoveBackAction);
        _sprint = new StringName(SprintAction);
        _dodge = new StringName(DodgeAction);
        _attack = new StringName(AttackAction);
        _gravity = CustomGravity > 0f
            ? CustomGravity
            : (float)ProjectSettings.GetSetting("physics/3d/default_gravity").AsDouble();

        FloorMaxAngle = Mathf.DegToRad(50f);
        FloorSnapLength = 0.25f;
        FloorConstantSpeed = true;
        FloorStopOnSlope = true;
        Input.MouseMode = Input.MouseModeEnum.Captured;
        SetMovementState(GameplayMovementState.Idle);
    }

    public override void _Input(InputEvent @event)
    {
        if (_camera == null
            || Input.MouseMode != Input.MouseModeEnum.Captured
            || @event is not InputEventMouseMotion mouseMotion)
            return;

        RotateY(-mouseMotion.Relative.X * MouseSensitivity);
        _rotationX -= mouseMotion.Relative.Y * MouseSensitivity;
        _rotationX = Mathf.Clamp(
            _rotationX,
            Mathf.DegToRad(-85f),
            Mathf.DegToRad(85f));
        Vector3 cameraRotation = _camera.Rotation;
        cameraRotation.X = _rotationX;
        _camera.Rotation = cameraRotation;
    }

    public override void _PhysicsProcess(double delta)
    {
        float dt = (float)delta;
        if (dt <= 0f) return;

        UpdateTimers(dt);
        Vector2 input = ReadMovementInput();
        Vector3 direction = GetMovementDirection(input);

        if (_staggerTimer <= 0f && _dodgeTimer <= 0f && _attackCooldownTimer <= 0f)
            TryStartCombatActions(direction);

        if (_dodgeTimer > 0f)
            UpdateDodgeVelocity();
        else if (_staggerTimer > 0f)
            UpdateStaggerVelocity(dt);
        else
            UpdateLocomotion(direction, dt);

        UpdateGravity(dt);
        MoveAndSlide();
        UpdateMovementState(direction);
        UpdateTelemetry(dt);
    }

    public void SetWorldTelemetry(
        float corruption,
        float environmentalPressure,
        int nearbyEnemies,
        float incomingDamagePerSecond)
    {
        _corruption = Mathf.Clamp(corruption, 0f, 1f);
        _environmentalPressure = Mathf.Clamp(environmentalPressure, 0f, 1f);
        _nearbyEnemies = Mathf.Max(0, nearbyEnemies);
        _incomingDamagePerSecond = Mathf.Max(0f, incomingDamagePerSecond);
    }

    public void SetHighTensionZone(bool inside, float pressure, float corruption)
    {
        _environmentalPressure = Mathf.Clamp(pressure, 0f, 1f);
        _corruption = Mathf.Clamp(corruption, 0f, 1f);
        if (inside && !_insideHighTensionZone)
        {
            _sentraCore?.ReportGameplayEvent(
                CoreGameplayEventKind.HighTensionZoneEntered,
                unchecked((long)GetInstanceId()),
                GlobalPosition,
                _environmentalPressure);
        }
        _insideHighTensionZone = inside;
    }

    public void ApplyPlayerDamage(
        float damage,
        float resultingHealthRatio,
        Vector3 knockback)
    {
        if (damage <= 0f || float.IsNaN(damage) || float.IsInfinity(damage)) return;

        _playerHealthRatio = Mathf.Clamp(resultingHealthRatio, 0f, 1f);
        _incomingDamagePerSecond = Mathf.Max(_incomingDamagePerSecond, damage * 2f);
        _damageTelemetryTimer = 1f;
        Velocity += knockback;
        _staggerTimer = Mathf.Max(_staggerTimer, StaggerDuration);
        SetMovementState(GameplayMovementState.Stagger);
        _sentraCore?.ReportGameplayEvent(
            CoreGameplayEventKind.PlayerDamage,
            unchecked((long)GetInstanceId()),
            GlobalPosition,
            damage);
        _sentraCore?.ReportGameplayEvent(
            CoreGameplayEventKind.PlayerStagger,
            unchecked((long)GetInstanceId()),
            GlobalPosition,
            _staggerTimer);
    }

    private RayCast3D CreateAttackRay()
    {
        var ray = new RayCast3D
        {
            Name = "RuntimeAttackRay",
            TargetPosition = new Vector3(0f, 0f, -AttackRange),
            CollisionMask = AttackCollisionMask,
            Enabled = true
        };
        Node3D rayOrigin = _camera ?? this;
        rayOrigin.AddChild(ray);
        ray.Position = Vector3.Zero;
        return ray;
    }

    private Vector2 ReadMovementInput()
    {
        if (!InputMap.HasAction(_moveLeft)
            || !InputMap.HasAction(_moveRight)
            || !InputMap.HasAction(_moveForward)
            || !InputMap.HasAction(_moveBack))
            return Vector2.Zero;
        return Input.GetVector(_moveLeft, _moveRight, _moveForward, _moveBack);
    }

    private Vector3 GetMovementDirection(Vector2 input)
    {
        Vector3 direction = GlobalBasis * new Vector3(input.X, 0f, input.Y);
        direction.Y = 0f;
        return direction.LengthSquared() > 1f
            ? direction.Normalized()
            : direction;
    }

    private void TryStartCombatActions(Vector3 movementDirection)
    {
        if (InputMap.HasAction(_dodge) && Input.IsActionJustPressed(_dodge))
        {
            if (_dodgeCooldownTimer > 0f) return;
            _dodgeDirection = movementDirection.LengthSquared() > 0.001f
                ? movementDirection
                : -GlobalBasis.Z;
            _dodgeDirection.Y = 0f;
            _dodgeDirection = _dodgeDirection.Normalized();
            _dodgeTimer = DodgeDuration;
            _dodgeCooldownTimer = DodgeCooldown;
            SetMovementState(GameplayMovementState.Dodge);
            _actionsInWindow++;
            _sentraCore?.ReportGameplayEvent(
                CoreGameplayEventKind.PlayerDodge,
                unchecked((long)GetInstanceId()),
                GlobalPosition,
                1f);
            return;
        }

        if (InputMap.HasAction(_attack) && Input.IsActionJustPressed(_attack))
            PerformAttack();
    }

    private void PerformAttack()
    {
        _attackCooldownTimer = AttackCooldown;
        _combatTimer = 0.22f;
        _actionsInWindow++;
        _sentraCore?.ReportGameplayEvent(
            CoreGameplayEventKind.PlayerAttack,
            unchecked((long)GetInstanceId()),
            GlobalPosition,
            AttackDamage);

        if (_attackRay == null) return;
        _attackRay.CollisionMask = AttackCollisionMask;
        _attackRay.TargetPosition = new Vector3(0f, 0f, -AttackRange);
        _attackRay.Enabled = true;
        _attackRay.ForceRaycastUpdate();
        GodotObject collider = _attackRay.IsColliding()
            ? _attackRay.GetCollider()
            : null;
        _attackRay.Enabled = false;
        if (collider == null) return;

        IDamageable damageable = FindDamageable(collider as Node);
        if (damageable == null) return;

        Node targetNode = collider as Node;
        float dealt = damageable.ApplyDamage(
            AttackDamage,
            unchecked((long)GetInstanceId()));
        if (dealt <= 0f) return;

        _sentraCore?.ReportGameplayEvent(
            CoreGameplayEventKind.PlayerAttackHit,
            targetNode != null ? unchecked((long)targetNode.GetInstanceId()) : 0L,
            targetNode is Node3D target3D ? target3D.GlobalPosition : GlobalPosition,
            dealt);
    }

    private static IDamageable FindDamageable(Node node)
    {
        Node current = node;
        for (int depth = 0; current != null && depth < 5; depth++)
        {
            if (current is IDamageable damageable) return damageable;
            current = current.GetParent();
        }
        return null;
    }

    private void UpdateLocomotion(Vector3 direction, float delta)
    {
        Vector3 velocity = Velocity;
        float targetSpeed = InputMap.HasAction(_sprint)
            && Input.IsActionPressed(_sprint)
                ? RunSpeed
                : WalkSpeed;
        float acceleration = IsOnFloor() ? GroundAcceleration : AirAcceleration;

        if (direction.LengthSquared() > 0.001f)
        {
            velocity.X = Mathf.MoveToward(
                velocity.X,
                direction.X * targetSpeed,
                acceleration * delta);
            velocity.Z = Mathf.MoveToward(
                velocity.Z,
                direction.Z * targetSpeed,
                acceleration * delta);
        }
        else if (IsOnFloor())
        {
            velocity.X = Mathf.MoveToward(velocity.X, 0f, GroundFriction * delta);
            velocity.Z = Mathf.MoveToward(velocity.Z, 0f, GroundFriction * delta);
        }

        Velocity = velocity;
    }

    private void UpdateDodgeVelocity()
    {
        Vector3 velocity = Velocity;
        velocity.X = _dodgeDirection.X * DodgeSpeed;
        velocity.Z = _dodgeDirection.Z * DodgeSpeed;
        Velocity = velocity;
    }

    private void UpdateStaggerVelocity(float delta)
    {
        Vector3 velocity = Velocity;
        float friction = GroundFriction * 0.35f;
        velocity.X = Mathf.MoveToward(velocity.X, 0f, friction * delta);
        velocity.Z = Mathf.MoveToward(velocity.Z, 0f, friction * delta);
        Velocity = velocity;
    }

    private void UpdateGravity(float delta)
    {
        Vector3 velocity = Velocity;
        if (!IsOnFloor())
            velocity.Y -= _gravity * delta;
        else if (velocity.Y < 0f)
            velocity.Y = 0f;
        Velocity = velocity;
    }

    private void UpdateTimers(float delta)
    {
        _dodgeTimer = Mathf.Max(0f, _dodgeTimer - delta);
        _dodgeCooldownTimer = Mathf.Max(0f, _dodgeCooldownTimer - delta);
        _combatTimer = Mathf.Max(0f, _combatTimer - delta);
        _attackCooldownTimer = Mathf.Max(0f, _attackCooldownTimer - delta);
        _staggerTimer = Mathf.Max(0f, _staggerTimer - delta);
        _damageTelemetryTimer = Mathf.Max(0f, _damageTelemetryTimer - delta);
        if (_damageTelemetryTimer <= 0f)
            _incomingDamagePerSecond = Mathf.MoveToward(
                _incomingDamagePerSecond,
                0f,
                36f * delta);
    }

    private void UpdateMovementState(Vector3 direction)
    {
        if (_staggerTimer > 0f)
        {
            SetMovementState(GameplayMovementState.Stagger);
            return;
        }
        if (_dodgeTimer > 0f)
        {
            SetMovementState(GameplayMovementState.Dodge);
            return;
        }
        if (_combatTimer > 0f)
        {
            SetMovementState(GameplayMovementState.Combat);
            return;
        }
        if (direction.LengthSquared() <= 0.001f)
        {
            SetMovementState(GameplayMovementState.Idle);
            return;
        }

        bool running = InputMap.HasAction(_sprint) && Input.IsActionPressed(_sprint);
        SetMovementState(running ? GameplayMovementState.Run : GameplayMovementState.Walk);
    }

    private void UpdateTelemetry(float delta)
    {
        _actionWindowTimer += delta;
        _telemetryTimer += delta;

        if (_actionWindowTimer >= 1f)
        {
            _actionsPerSecond = _actionsInWindow / _actionWindowTimer;
            _actionsInWindow = 0;
            _actionWindowTimer = 0f;
        }

        if (_telemetryTimer < 0.1f) return;
        _telemetryTimer = 0f;
        float speedRatio = Mathf.Clamp(
            new Vector2(Velocity.X, Velocity.Z).Length() / Mathf.Max(1f, RunSpeed),
            0f,
            1f);
        _sentraCore?.ReportPlayerTelemetry(new PlayerTelemetry(
            GlobalPosition,
            _playerHealthRatio,
            speedRatio,
            _actionsPerSecond,
            _incomingDamagePerSecond,
            _corruption,
            _environmentalPressure,
            _nearbyEnemies));
    }

    private void SetMovementState(GameplayMovementState nextState)
    {
        if (_movementState == nextState) return;
        _movementState = nextState;
        EmitSignal(SignalName.GameplayStateChanged, (int)nextState);
    }
}
