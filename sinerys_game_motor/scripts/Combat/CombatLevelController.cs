using Godot;

namespace Sinerys.Vision.Combat
{
    public partial class CombatLevelController : Node3D
    {
        private PlayerController _player = null!;
        private PortalSpawner _portals = null!;
        private Label _hud = null!;
        private Label _waveInfo = null!;

        public override void _Ready()
        {
            _player = new PlayerController();
            AddChild(_player);

            _portals = new PortalSpawner();
            AddChild(_portals);

            _hud = new Label
            {
                Position = new Vector2(20, 20),
                Size = new Vector2(300, 60),
                Text = "HP: 100  |  Score: 0"
            };
            AddChild(_hud);

            _waveInfo = new Label
            {
                Position = new Vector2(20, 80),
                Size = new Vector2(300, 40),
                Text = "Wave: 0/0"
            };
            AddChild(_waveInfo);

            CombatManager.Instance.WaveStarted += OnWaveStarted;
            CombatManager.Instance.EnemyKilled += OnEnemyKilled;
            CombatManager.Instance.CombatComplete += OnCombatComplete;

            GD.Print("[CombatLevelController] Combat level initialized.");
        }

        public override void _Process(double delta)
        {
            _hud.Text = $"HP: {GlobalManager.Instance.PlayerHealth}  |  Score: {GlobalManager.Instance.PlayerScore}";
            _waveInfo.Text = $"Wave: {CombatManager.Instance.CurrentWave}/{CombatManager.Instance.TotalWaves}  |  Enemies: {CombatManager.Instance.EnemiesRemaining}";
        }

        private void OnWaveStarted(int wave, int count)
        {
            GD.Print($"[CombatLevelController] Wave {wave} started — {count} enemies incoming!");
        }

        private void OnEnemyKilled(string type)
        {
            GD.Print($"[CombatLevelController] Enemy killed: {type}");
        }

        private void OnCombatComplete(bool success)
        {
            GD.Print($"[CombatLevelController] Combat {(success ? "SUCCESS" : "FAILED")}!");
        }
    }
}
