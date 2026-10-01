using Godot;

public partial class FirstPersonController : CharacterBody3D
{
    [Export] private float MouseSensitivity = 0.003f;
    [Export] private float MoveSpeed = 5.0f;
    private Camera3D _camera;
    private float _rotationX;

    public override void _Ready()
    {
        _camera = GetNode<Camera3D>("Camera3D");
        Input.MouseMode = Input.MouseModeEnum.Captured;
    }

    public override void _Input(InputEvent @event)
    {
        if (@event is InputEventMouseMotion mouseMotion && Input.MouseMode == Input.MouseModeEnum.Captured)
        {
            RotateY(-mouseMotion.Relative.X * MouseSensitivity);
            _rotationX -= mouseMotion.Relative.Y * MouseSensitivity;
            _rotationX = Mathf.Clamp(_rotationX, Mathf.DegToRad(-85.0f), Mathf.DegToRad(85.0f));
            _camera.Rotation = new Vector3(_rotationX, _camera.Rotation.Y, _camera.Rotation.Z);
        }
    }

    public override void _PhysicsProcess(double delta)
    {
        Vector2 inputDirection = Input.GetVector("ui_left", "ui_right", "ui_up", "ui_down");
        Vector3 direction = (Transform.Basis * new Vector3(inputDirection.X, 0, inputDirection.Y)).Normalized();
        Vector3 velocity = Velocity;

        if (direction != Vector3.Zero)
        {
            velocity.X = direction.X * MoveSpeed;
            velocity.Z = direction.Z * MoveSpeed;
        }
        else
        {
            float deceleration = MoveSpeed * (float)delta;
            velocity.X = Mathf.MoveToward(Velocity.X, 0, deceleration);
            velocity.Z = Mathf.MoveToward(Velocity.Z, 0, deceleration);
        }

        Velocity = velocity;
        MoveAndSlide();
    }
}