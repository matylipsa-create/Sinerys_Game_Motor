using Godot;

namespace Sinerys.Vision.Combat
{
    public partial class PlayerController : CharacterBody3D
    {
        [Export] public float MoveSpeed { get; set; } = 6.0f;
        [Export] public float JumpVelocity { get; set; } = 4.5f;
        [Export] public float MouseSensitivity { get; set; } = 0.002f;
        [Export] public float AttackDamage { get; set; } = 25.0f;
        [Export] public float AttackRange { get; set; } = 50.0f;

        private Camera3D _camera = null!;
        private Vector3 _velocity = Vector3.Zero;
        private float _gravity = 9.8f;
        private float _yaw = 0f;
        private float _pitch = 0f;

        public override void _Ready()
        {
            _camera = new Camera3D { Current = true };
            AddChild(_camera);
            Input.MouseMode = Input.MouseModeEnum.Captured;

            var collision = new CollisionShape3D();
            var shape = new CapsuleShape3D { Radius = 0.5f, Height = 1.8f };
            collision.Shape = shape;
            AddChild(collision);

            GD.Print("[PlayerController] Ready — FPS controls active.");
        }

        public override void _PhysicsProcess(double delta)
        {
            var inputDir = Input.GetVector("move_left", "move_right", "move_up", "move_down");
            var direction = (Transform.Basis * new Vector3(inputDir.X, 0, inputDir.Y)).Normalized();

            if (!IsOnFloor())
                _velocity.Y -= _gravity * (float)delta;

            if (direction != Vector3.Zero)
            {
                _velocity.X = direction.X * MoveSpeed;
                _velocity.Z = direction.Z * MoveSpeed;
            }
            else
            {
                _velocity.X = Mathf.MoveToward(_velocity.X, 0, MoveSpeed * 0.3f);
                _velocity.Z = Mathf.MoveToward(_velocity.Z, 0, MoveSpeed * 0.3f);
            }

            Velocity = _velocity;
            MoveAndSlide();
        }

        public override void _Input(InputEvent @event)
        {
            if (@event is InputEventMouseMotion mouse && Input.MouseMode == Input.MouseModeEnum.Captured)
            {
                _yaw -= mouse.Relative.X * MouseSensitivity;
                _pitch -= mouse.Relative.Y * MouseSensitivity;
                _pitch = Mathf.Clamp(_pitch, -1.2f, 1.2f);
                Rotation = new Vector3(0, _yaw, 0);
                _camera.Rotation = new Vector3(_pitch, 0, 0);
            }

            if (@event.IsActionPressed("attack"))
                Attack();
        }

        private void Attack()
        {
            var space = GetWorld3D().DirectSpaceState;
            var from = _camera.GlobalPosition;
            var to = from - _camera.GlobalTransform.Basis.Z * AttackRange;
            var query = PhysicsRayQueryParameters3D.Create(from, to);
            query.Exclude = new Godot.Collections.Array<Rid> { GetRid() };
            var result = space.IntersectRay(query);

            if (result.Count > 0)
            {
                GD.Print($"[PlayerController] Hit: {result["collider"]}");
                GlobalManager.Instance.PlayerScore += 10;
            }
        }
    }
}
