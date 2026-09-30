using Godot;

[GlobalClass]
public partial class EntityStatus : Resource
{
    [Export]
    public float Infection { get; set; }

    [Export]
    public float Stamina { get; set; }

    [Export]
    public float Health { get; set; }

    public EntityStatus CopyNormalized()
    {
        return new EntityStatus
        {
            Infection = NormalizePercentage(Infection),
            Stamina = NormalizePercentage(Stamina),
            Health = NormalizePercentage(Health)
        };
    }

    private static float NormalizePercentage(float value)
    {
        return float.IsNaN(value) || float.IsInfinity(value)
            ? 0f
            : Mathf.Clamp(value, 0f, 100f);
    }
}