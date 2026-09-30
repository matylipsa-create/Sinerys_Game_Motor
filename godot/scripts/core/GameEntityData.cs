using Godot;

public enum GameEntityType
{
    Player,
    Chimera,
    Resource,
    Reactor
}

[GlobalClass]
public partial class GameEntityData : Resource
{
    [Export]
    public string Id { get; set; } = string.Empty;

    [Export]
    public GameEntityType Type { get; set; }

    [Export]
    public float X { get; set; }

    [Export]
    public float Y { get; set; }

    [Export]
    public EntityStatus Status { get; set; } = new EntityStatus();

    public GameEntityData Copy()
    {
        return new GameEntityData
        {
            Id = Id,
            Type = Type,
            X = X,
            Y = Y,
            Status = (Status ?? new EntityStatus()).CopyNormalized()
        };
    }
}