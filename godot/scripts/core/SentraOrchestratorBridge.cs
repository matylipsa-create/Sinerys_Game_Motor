using Godot;

public partial class SentraOrchestratorBridge : Node
{
    [Signal]
    public delegate void CrisisTensionEventHandler(float tension);

    [Signal]
    public delegate void PointsChangedEventHandler(int points, int pointCapacity);

    [Signal]
    public delegate void WeaponImpactReportedEventHandler(
        long sourceEntityId,
        long targetEntityId,
        Vector3 position,
        float damage);

    [Export(PropertyHint.Range, "0,1,0.01")]
    public float InitialCrisisTension { get; set; }

    public static SentraOrchestratorBridge Instance { get; private set; }

    public float CrisisTension { get; private set; }
    public int Points { get; private set; }
    public int PointCapacity { get; private set; }

    public override void _EnterTree()
    {
        if (Instance != null && Instance != this)
        {
            GD.PushError("SentraOrchestratorBridge: only one instance may be active.");
            QueueFree();
            return;
        }

        Instance = this;
    }

    public override void _Ready()
    {
        SetCrisisTension(InitialCrisisTension);
    }

    public override void _ExitTree()
    {
        if (Instance == this)
            Instance = null;
    }

    public void SetCrisisTension(float tension)
    {
        if (float.IsNaN(tension) || float.IsInfinity(tension))
            return;

        float clamped = Mathf.Clamp(tension, 0f, 1f);
        if (Mathf.IsEqualApprox(CrisisTension, clamped))
            return;

        CrisisTension = clamped;
        EmitSignal(SignalName.CrisisTension, CrisisTension);
    }

    public void AddCrisisTension(float amount)
    {
        if (float.IsNaN(amount) || float.IsInfinity(amount) || amount == 0f)
            return;

        SetCrisisTension(CrisisTension + amount);
    }

    public void SetPoints(int points, int pointCapacity)
    {
        int capacity = Mathf.Max(0, pointCapacity);
        int clampedPoints = Mathf.Clamp(points, 0, capacity);
        if (Points == clampedPoints && PointCapacity == capacity)
            return;

        Points = clampedPoints;
        PointCapacity = capacity;
        EmitSignal(SignalName.PointsChanged, Points, PointCapacity);
    }

    public void ReportWeaponImpact(
        long sourceEntityId,
        long targetEntityId,
        Vector3 position,
        float damage)
    {
        if (!IsFinite(position) || float.IsNaN(damage) || float.IsInfinity(damage) || damage <= 0f)
            return;

        EmitSignal(
            SignalName.WeaponImpactReported,
            sourceEntityId,
            targetEntityId,
            position,
            damage);
        AddCrisisTension(Mathf.Min(0.05f, damage * 0.001f));
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
