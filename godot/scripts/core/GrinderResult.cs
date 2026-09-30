using Godot;

public sealed partial class GrinderResult : RefCounted
{
    [Export]
    public string Reward { get; set; } = string.Empty;

    [Export(PropertyHint.Range, "0,100,1")]
    public int Quality { get; set; }
}