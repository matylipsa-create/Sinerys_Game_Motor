using Godot;
using System;
using System.Collections.Generic;

public partial class SentraCoreEngine : Node
{
    private readonly Dictionary<string, GameEntityData> _entities =
        new Dictionary<string, GameEntityData>(StringComparer.Ordinal);

    [Export(PropertyHint.Range, "1,240,1")]
    public int TickRate { get; set; } = 60;

    public override void _Ready()
    {
        TickRate = Mathf.Clamp(TickRate, 1, 240);
        GD.Print("[Sentra Core C#] Initialized agnostic engine runtime for Godot.");
    }

    public void RegisterEntity(GameEntityData entity)
    {
        if (entity == null) throw new ArgumentNullException(nameof(entity));
        if (string.IsNullOrWhiteSpace(entity.Id))
            throw new ArgumentException("Entity id cannot be empty.", nameof(entity));
        if (float.IsNaN(entity.X) || float.IsInfinity(entity.X) ||
            float.IsNaN(entity.Y) || float.IsInfinity(entity.Y))
            throw new ArgumentException("Entity coordinates must be finite numbers.", nameof(entity));

        _entities[entity.Id] = entity.Copy();
    }

    public bool UpdateEntityState(string id, float x, float y, EntityStatus status)
    {
        if (string.IsNullOrWhiteSpace(id)) return false;
        if (float.IsNaN(x) || float.IsInfinity(x) || float.IsNaN(y) || float.IsInfinity(y)) return false;
        if (status == null || !_entities.TryGetValue(id, out GameEntityData entity)) return false;

        entity.X = x;
        entity.Y = y;
        entity.Status = status.CopyNormalized();
        return true;
    }

    public bool RemoveEntity(string id)
    {
        return !string.IsNullOrWhiteSpace(id) && _entities.Remove(id);
    }

    public GameEntityData GetEntity(string id)
    {
        return !string.IsNullOrWhiteSpace(id) && _entities.TryGetValue(id, out GameEntityData entity)
            ? entity.Copy()
            : null;
    }

    public Godot.Collections.Array<GameEntityData> GetEntities()
    {
        var snapshot = new Godot.Collections.Array<GameEntityData>();
        foreach (GameEntityData entity in _entities.Values)
        {
            snapshot.Add(entity.Copy());
        }
        return snapshot;
    }

    public GrinderResult ProcessGrinder(Godot.Collections.Array<string> inputItems)
    {
        if (inputItems == null) throw new ArgumentNullException(nameof(inputItems));

        int organicCount = 0;
        int techCount = 0;
        foreach (string item in inputItems)
        {
            if (string.IsNullOrWhiteSpace(item)) continue;

            if (item.IndexOf("spore", StringComparison.OrdinalIgnoreCase) >= 0 ||
                item.IndexOf("tissue", StringComparison.OrdinalIgnoreCase) >= 0)
                organicCount++;

            if (item.IndexOf("metal", StringComparison.OrdinalIgnoreCase) >= 0 ||
                item.IndexOf("circuit", StringComparison.OrdinalIgnoreCase) >= 0)
                techCount++;
        }

        if (organicCount > techCount)
            return CreateGrinderResult("Suero Estabilizador de Esporas", organicCount * 15);
        if (techCount > organicCount)
            return CreateGrinderResult("Aleación Reforzada de Titanio", techCount * 20);
        return CreateGrinderResult("Biomasa Sintética Neutra", 50);
    }

    private static GrinderResult CreateGrinderResult(string reward, int quality)
    {
        return new GrinderResult { Reward = reward, Quality = Mathf.Clamp(quality, 0, 100) };
    }
}