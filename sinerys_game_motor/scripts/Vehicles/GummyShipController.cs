using Godot;

namespace Sinerys.Vision.Vehicles
{
    public partial class GummyShipController : Node3D
    {
        [Export] public float MoveSpeed { get; set; } = 15.0f;
        [Export] public float RollSpeed { get; set; } = 3.0f;
        [Export] public float FireRate { get; set; } = 0.15f;

        private Node3D _ship = null!;
        private Camera3D _camera = null!;
        private Label _hud = null!;
        private float _fireTimer = 0f;
        private Godot.Collections.Array<Node3D> _projectiles = new();

        public override void _Ready()
        {
            _ship = new Node3D();
            AddChild(_ship);

            var mesh = new MeshInstance3D();
            var sphere = new SphereMesh { Radius = 1.0f, Height = 2.0f };
            mesh.Mesh = sphere;
            var mat = new StandardMaterial3D
            {
                AlbedoColor = new Color(0.9f, 0.3f, 0.3f),
                EmissionEnabled = true,
                Emission = new Color(0.5f, 0.1f, 0.1f)
            };
            mesh.MaterialOverride = mat;
            _ship.AddChild(mesh);

            var light = new OmniLight3D { LightColor = new Color(1, 0.5f, 0.3f), OmniRange = 5f };
            _ship.AddChild(light);

            _camera = new Camera3D
            {
                Position = new Vector3(0, 2, 6),
                Current = true
            };
            AddChild(_camera);

            _hud = new Label
            {
                Position = new Vector2(20, 20),
                Size = new Vector2(400, 80),
                Text = "GUMMY SHIP\nDestroy all targets!"
            };
            AddChild(_hud);

            GD.Print("[GummyShipController] Ready — Gummy Ship mode.");
        }

        public override void _Process(double delta)
        {
            var input = Input.GetVector("move_left", "move_right", "move_up", "move_down");
            _ship.Position += new Vector3(input.X * MoveSpeed * (float)delta, -input.Y * MoveSpeed * (float)delta, 0);
            _ship.Rotation = new Vector3(-input.Y * RollSpeed, 0, -input.X * RollSpeed);

            _fireTimer += (float)delta;
            if (Input.IsActionPressed("attack") && _fireTimer >= FireRate)
            {
                _fireTimer = 0f;
                FireProjectile();
            }

            _hud.Text = $"GUMMY SHIP\nScore: {VehicleManager.Instance.VehicleScore}\nTime: {VehicleManager.Instance.GetTimeRemaining():F1}s";

            for (int i = _projectiles.Count - 1; i >= 0; i--)
            {
                var p = _projectiles[i];
                if (!IsInstanceValid(p)) { _projectiles.RemoveAt(i); continue; }
                p.Position -= new Vector3(0, 0, 50 * (float)delta);
                if (p.Position.Z < -100)
                {
                    _projectiles.RemoveAt(i);
                    p.QueueFree();
                }
            }
        }

        private void FireProjectile()
        {
            var proj = new MeshInstance3D();
            var sphere = new SphereMesh { Radius = 0.3f, Height = 0.6f };
            proj.Mesh = sphere;
            var mat = new StandardMaterial3D
            {
                AlbedoColor = new Color(1, 1, 0.2f),
                EmissionEnabled = true,
                Emission = new Color(2, 2, 0.4f)
            };
            proj.MaterialOverride = mat;
            proj.Position = _ship.Position + new Vector3(0, 0, -1.5f);
            AddChild(proj);
            _projectiles.Add(proj);
        }
    }
}
