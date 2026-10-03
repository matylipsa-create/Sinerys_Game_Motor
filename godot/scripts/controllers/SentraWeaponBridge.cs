using Godot;

public partial class SentraWeaponBridge : Node3D
{
    [Signal]
    public delegate void WeaponFiredEventHandler(long sourceEntityId);

    [Signal]
    public delegate void WeaponHitEventHandler(
        long targetEntityId,
        Vector3 position,
        Vector3 normal,
        float damage);

    [Export]
    public NodePath RayPath { get; set; } = new NodePath("WeaponRay");

    [Export]
    public string FireAction { get; set; } = "fire";

    [Export(PropertyHint.Range, "0.01,10,0.01")]
    public float FireRate { get; set; } = 5f;

    [Export(PropertyHint.Range, "0.1,1000,0.1")]
    public float Damage { get; set; } = 20f;

    [Export(PropertyHint.Range, "0.1,500,0.1")]
    public float Range { get; set; } = 100f;

    [Export(PropertyHint.Layers3DPhysics)]
    public uint CollisionMask { get; set; } = 1;

    [Export]
    public bool AutomaticFire { get; set; } = true;

    private RayCast3D _ray;
    private StringName _fireAction;
    private float _shotCooldown;

    public override void _Ready()
    {
        _fireAction = new StringName(FireAction);
        _ray = RayPath.IsEmpty ? null : GetNodeOrNull<RayCast3D>(RayPath);
        if (_ray == null)
        {
            GD.PushError("SentraWeaponBridge: RayPath must resolve to a RayCast3D.");
            SetProcess(false);
            return;
        }

        _ray.TargetPosition = new Vector3(0f, 0f, -Mathf.Max(0.1f, Range));
        _ray.CollisionMask = CollisionMask;
        _ray.Enabled = false;
    }

    public override void _Process(double delta)
    {
        float dt = (float)delta;
        if (float.IsNaN(dt) || float.IsInfinity(dt) || dt <= 0f)
            return;

        _shotCooldown = Mathf.Max(0f, _shotCooldown - dt);
        if (_shotCooldown > 0f || !InputMap.HasAction(_fireAction))
            return;

        bool fire = AutomaticFire
            ? Input.IsActionPressed(_fireAction)
            : Input.IsActionJustPressed(_fireAction);
        if (fire)
            Fire();
    }

    public bool Fire()
    {
        if (!GodotObject.IsInstanceValid(_ray) || _shotCooldown > 0f)
            return false;

        float rate = Mathf.Max(0.01f, FireRate);
        _shotCooldown = 1f / rate;
        _ray.TargetPosition = new Vector3(0f, 0f, -Mathf.Max(0.1f, Range));
        _ray.CollisionMask = CollisionMask;
        _ray.Enabled = true;
        _ray.ForceRaycastUpdate();

        long sourceId = unchecked((long)GetInstanceId());
        EmitSignal(SignalName.WeaponFired, sourceId);

        if (!_ray.IsColliding())
        {
            _ray.Enabled = false;
            return true;
        }

        GodotObject collider = _ray.GetCollider();
        Node target = collider as Node;
        Vector3 position = _ray.GetCollisionPoint();
        Vector3 normal = _ray.GetCollisionNormal();
        float dealt = ResolveDamage(target, sourceId);
        long targetId = collider == null
            ? 0L
            : unchecked((long)collider.GetInstanceId());

        EmitSignal(SignalName.WeaponHit, targetId, position, normal, dealt);
        if (dealt > 0f)
            SentraOrchestratorBridge.Instance?.ReportWeaponImpact(
                sourceId,
                targetId,
                position,
                dealt);

        _ray.Enabled = false;
        return true;
    }

    private float ResolveDamage(Node target, long sourceId)
    {
        for (int depth = 0; target != null && depth < 5; depth++, target = target.GetParent())
        {
            if (target is IDamageable damageable)
                return damageable.ApplyDamage(Mathf.Max(0f, Damage), sourceId);
        }

        return 0f;
    }
}
