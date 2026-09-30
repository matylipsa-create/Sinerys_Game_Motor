using Godot;

public partial class GameEngineCore : Node
{
    private StrategicParadoxDirector paradoxDirector;
    private MultiversalDriftManager multiversalManager;
    private bool isRunning = false;

    public override void _Ready()
    {
        paradoxDirector = new StrategicParadoxDirector();
        multiversalManager = new MultiversalDriftManager();

        AddChild(paradoxDirector);
        AddChild(multiversalManager);

        isRunning = true;
        GD.Print("[GameEngineCore C#] Sentra Core unified pipeline active in Godot.");
    }

    public override void _Process(double delta)
    {
        if (!isRunning) return;
    }
}
