using Godot;

[GlobalClass]
public partial class DamageableComponent : Node3D, IDamageable
{
    [Signal]
    public delegate void HealthChangedEventHandler(float health, float healthRatio);

    [Export(PropertyHint.Range, "1,10000,1")]
    public float MaxHealth { get; set; } = 100f;

    [Export]
    public float Health { get; set; } = 100f;

    public bool IsDead => Health <= 0f;
    public float HealthRatio => MaxHealth <= 0f ? 0f : Health / MaxHealth;

    public override void _Ready()
    {
        MaxHealth = Mathf.Max(1f, MaxHealth);
        Health = Mathf.Clamp(Health, 0f, MaxHealth);
    }

    public float ApplyDamage(float amount, long sourceEntityId)
    {
        if (IsDead || float.IsNaN(amount) || float.IsInfinity(amount) || amount <= 0f)
            return 0f;

        float dealt = Mathf.Min(Health, amount);
        Health -= dealt;
        EmitSignal(SignalName.HealthChanged, Health, HealthRatio);
        return dealt;
    }

    public void RestoreHealth(float amount)
    {
        if (float.IsNaN(amount) || float.IsInfinity(amount) || amount <= 0f) return;
        Health = Mathf.Min(MaxHealth, Health + amount);
        EmitSignal(SignalName.HealthChanged, Health, HealthRatio);
    }
}
