using Godot;
using System;

public partial class SentraShaderOrchestrator : Node
{
    private static readonly StringName CrisisTensionParameter = new StringName("crisis_tension");
    private static readonly StringName ShadowLevelParameter = new StringName("shadow_level");
    private static readonly StringName MidThresholdParameter = new StringName("mid_threshold");
    private static readonly StringName LitThresholdParameter = new StringName("lit_threshold");

    [Export]
    public NodePath SentraCorePath { get; set; } = new NodePath("../SentraCoreEngine");

    [Export]
    public NodePath MantisPostProcessPath { get; set; } = new NodePath("../Camera3D/MantisVisionPostProcess");

    [Export]
    public Godot.Collections.Array<ShaderMaterial> ToonMaterials { get; set; } =
        new Godot.Collections.Array<ShaderMaterial>();

    [Export]
    public Godot.Collections.Array<MeshInstance3D> OutlineTargets { get; set; } =
        new Godot.Collections.Array<MeshInstance3D>();

    [Export]
    public Shader OutlineShader { get; set; }

    [Export(PropertyHint.Range, "0.01,0.2,0.01")]
    public float OutlineWidth { get; set; } = 0.018f;

    private SentraCoreEngine _sentraCore;
    private Node _mantisPostProcess;
    private float _lastTension = -1f;

    public override void _Ready()
    {
        if (!SentraCorePath.IsEmpty)
            _sentraCore = GetNodeOrNull<SentraCoreEngine>(SentraCorePath);
        if (!MantisPostProcessPath.IsEmpty)
            _mantisPostProcess = GetNodeOrNull<Node>(MantisPostProcessPath);

        if (_sentraCore != null)
        {
            _sentraCore.CrisisSnapshotPublished += OnCrisisSnapshotPublished;
            ApplyTension(_sentraCore.LatestCrisis.Tension);
        }

        CreateOutlineInstances();
    }

    public override void _ExitTree()
    {
        if (_sentraCore != null)
            _sentraCore.CrisisSnapshotPublished -= OnCrisisSnapshotPublished;
    }

    private void OnCrisisSnapshotPublished(CrisisSnapshot snapshot)
    {
        ApplyTension(snapshot.Tension);
    }

    private void ApplyTension(float tension)
    {
        if (float.IsNaN(tension) || float.IsInfinity(tension)) return;
        tension = Mathf.Clamp(tension, 0f, 1f);
        if (Mathf.Abs(tension - _lastTension) < 0.005f) return;
        _lastTension = tension;

        float shadowLevel = Mathf.Lerp(0.3f, 0.2f, tension);
        float midThreshold = Mathf.Lerp(0.32f, 0.24f, tension);
        float litThreshold = Mathf.Lerp(0.72f, 0.62f, tension);
        for (int index = 0; index < ToonMaterials.Count; index++)
        {
            ShaderMaterial material = ToonMaterials[index];
            if (material == null) continue;
            material.SetShaderParameter(CrisisTensionParameter, tension);
            material.SetShaderParameter(ShadowLevelParameter, shadowLevel);
            material.SetShaderParameter(MidThresholdParameter, midThreshold);
            material.SetShaderParameter(LitThresholdParameter, litThreshold);
        }

        if (GodotObject.IsInstanceValid(_mantisPostProcess))
            _mantisPostProcess.Call("set_tension", tension);
    }

    private void CreateOutlineInstances()
    {
        if (OutlineShader == null)
        {
            if (OutlineTargets.Count > 0)
                GD.PushWarning("SentraShaderOrchestrator: OutlineShader is unset; outline instances were not created.");
            return;
        }

        for (int index = 0; index < OutlineTargets.Count; index++)
        {
            MeshInstance3D target = OutlineTargets[index];
            if (!GodotObject.IsInstanceValid(target) || target.Mesh == null) continue;

            var outline = new MeshInstance3D
            {
                Name = $"{target.Name}_SentraOutline",
                Mesh = target.Mesh,
                Skin = target.Skin,
                CastShadow = GeometryInstance3D.ShadowCastingSettingEnum.Off,
                TopLevel = false,
                Visible = target.Visible
            };

            target.AddChild(outline);
            if (!target.Skeleton.IsEmpty)
            {
                Node skeleton = target.GetNodeOrNull<Node>(target.Skeleton);
                if (skeleton != null)
                    outline.Skeleton = outline.GetPathTo(skeleton);
            }

            var material = new ShaderMaterial
            {
                Shader = OutlineShader,
                RenderPriority = -1
            };
            material.SetShaderParameter(new StringName("outline_width"), Mathf.Max(0.001f, OutlineWidth));
            outline.MaterialOverride = material;
        }
    }
}
