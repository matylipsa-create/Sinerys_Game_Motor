using Godot;

namespace Sinerys.Vision.Vehicles
{
    public partial class BonusStageController : Node3D
    {
        [Export] public float ForwardSpeed { get; set; } = 20.0f;
        [Export] public float StrafeSpeed { get; set; } = 10.0f;
        [Export] public float BoostMultiplier { get; set; } = 2.0f;

        private VehicleBody3D _vehicle = null!;
        private Camera3D _camera = null!;
        private Label _hud = null!;

        public override void _Ready()
        {
            _vehicle = new VehicleBody3D();
            AddChild(_vehicle);

            var bodyMesh = new MeshInstance3D();
            var box = new BoxMesh { Size = new Vector3(2, 1, 4) };
            bodyMesh.Mesh = box;
            var mat = new StandardMaterial3D { AlbedoColor = new Color(0.8f, 0.6f, 0.1f) };
            bodyMesh.MaterialOverride = mat;
            _vehicle.AddChild(bodyMesh);

            var colShape = new CollisionShape3D();
            colShape.Shape = new BoxShape3D { Size = new Vector3(2, 1, 4) };
            _vehicle.AddChild(colShape);

            _camera = new Camera3D
            {
                Position = new Vector3(0, 3, 8),
                Current = true
            };
            _vehicle.AddChild(_camera);

            _hud = new Label
            {
                Position = new Vector2(20, 20),
                Size = new Vector2(400, 80),
                Text = "BONUS STAGE\nCollect tokens!"
            };
            AddChild(_hud);

            GD.Print("[BonusStageController] Ready — vehicle bonus stage.");
        }

        public override void _PhysicsProcess(double delta)
        {
            var input = Input.GetVector("move_left", "move_right", "move_up", "move_down");
            float boost = Input.IsActionPressed("interact") ? BoostMultiplier : 1.0f;

            _vehicle.LinearVelocity = new Vector3(
                input.X * StrafeSpeed,
                _vehicle.LinearVelocity.Y,
                -ForwardSpeed * boost
            );

            _hud.Text = $"BONUS STAGE\nScore: {VehicleManager.Instance.VehicleScore}\nTime: {VehicleManager.Instance.GetTimeRemaining():F1}s";
        }
    }
}
