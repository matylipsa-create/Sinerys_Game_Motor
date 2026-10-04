using Godot;
using System.Collections.Generic;
using Sinerys.Vision.Core;

namespace Sinerys.Vision.Combat
{
    public partial class PortalSpawner : Node3D
    {
        [Export] public float PortalRadius { get; set; } = 2.0f;
        [Export] public int MaxSimultaneousPortals { get; set; } = 3;

        private List<Node3D> _activePortals = new();
        private float _spawnCheckTimer = 0f;
        private const float SpawnCheckInterval = 0.5f;

        public override void _Ready()
        {
            GD.Print("[PortalSpawner] Ready — Serious Sam-style portal system.");
        }

        public override void _Process(double delta)
        {
            _spawnCheckTimer += (float)delta;
            if (_spawnCheckTimer < SpawnCheckInterval) return;
            _spawnCheckTimer = 0f;

            if (CombatManager.Instance?.CurrentPhase == CombatPhase.WaveActive &&
                _activePortals.Count < MaxSimultaneousPortals)
            {
                SpawnPortal();
            }
        }

        private void SpawnPortal()
        {
            var angle = GD.RandRange(0, Mathf.Tau);
            var dist = GD.RandRange(15.0f, 30.0f);
            var pos = new Vector3(Mathf.Cos(angle) * dist, 0, Mathf.Sin(angle) * dist);

            var portal = new Node3D { Position = pos };
            AddChild(portal);
            _activePortals.Add(portal);

            var mesh = new MeshInstance3D();
            var sphere = new SphereMesh { Radius = PortalRadius, Height = PortalRadius * 2 };
            mesh.Mesh = sphere;
            var mat = new StandardMaterial3D
            {
                AlbedoColor = new Color(0.5f, 0.2f, 0.8f, 0.6f),
                EmissionEnabled = true,
                Emission = new Color(0.6f, 0.3f, 0.9f),
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha
            };
            mesh.MaterialOverride = mat;
            portal.AddChild(mesh);

            var light = new OmniLight3D
            {
                LightColor = new Color(0.6f, 0.3f, 0.9f),
                OmniRange = 8.0f,
                LightEnergy = 2.0f
            };
            portal.AddChild(light);

            GD.Print($"[PortalSpawner] Portal spawned at {pos}");

            var tween = CreateTween();
            tween.SetParallel(true);
            tween.TweenProperty(portal, "scale", Vector3.Zero, 0.0);
            tween.TweenProperty(portal, "scale", Vector3.One, 0.5f)
                .SetTrans(Tween.TransitionType.Back)
                .SetEase(Tween.EaseType.Out);

            GetTree().CreateTimer(5.0).Timeout += () => ClosePortal(portal);
        }

        private void ClosePortal(Node3D portal)
        {
            if (!IsInstanceValid(portal)) return;
            var tween = CreateTween();
            tween.TweenProperty(portal, "scale", Vector3.Zero, 0.4f)
                .SetTrans(Tween.TransitionType.Back)
                .SetEase(Tween.EaseType.In);
            tween.TweenCallback(Callable.From(() =>
            {
                _activePortals.Remove(portal);
                portal.QueueFree();
            }));
        }

        public void CloseAllPortals()
        {
            foreach (var p in _activePortals)
                if (IsInstanceValid(p)) p.QueueFree();
            _activePortals.Clear();
        }
    }
}
