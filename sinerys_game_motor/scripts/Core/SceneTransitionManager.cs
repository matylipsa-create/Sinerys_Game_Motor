using Godot;
using System;

namespace Sinerys.Vision.Core
{
    public enum TransitionType
    {
        FadeToBlack,
        FadeToWhite,
        IrisWipe,
        PortalSwirl,
        VehicleLaunch,
        Instant
    }

    public partial class SceneTransitionManager : Node
    {
        public static SceneTransitionManager Instance { get; private set; }

        private ColorRect _overlay;
        private AnimationPlayer _animPlayer;
        private bool _transitioning = false;

        public override void _Ready()
        {
            Instance = this;
            _overlay = new ColorRect
            {
                Color = new Color(0, 0, 0, 0),
                MouseFilter = Control.MouseFilterEnum.Ignore
            };
            _overlay.SetAnchorsPreset(Control.LayoutPreset.FullRect);
            AddChild(_overlay);

            _animPlayer = new AnimationPlayer();
            _overlay.AddChild(_animPlayer);
            GD.Print("[SceneTransitionManager] Ready.");
        }

        public void TransitionTo(string scenePath, TransitionType type = TransitionType.FadeToBlack, float duration = 0.8f)
        {
            if (_transitioning) return;
            _transitioning = true;
            GD.Print($"[SceneTransitionManager] Transition → {scenePath} ({type}, {duration}s)");

            var tween = CreateTween();
            tween.SetParallel(false);

            float halfDur = duration * 0.5f;

            tween.TweenMethod(Callable.From<float>((float alpha) =>
            {
                _overlay.Color = new Color(0, 0, 0, alpha);
            }), 0.0f, 1.0f, halfDur);

            tween.TweenCallback(Callable.From(() =>
            {
                GetTree().ChangeSceneToFile(scenePath);
            }));

            tween.TweenMethod(Callable.From<float>((float alpha) =>
            {
                _overlay.Color = new Color(0, 0, 0, alpha);
            }), 1.0f, 0.0f, halfDur);

            tween.TweenCallback(Callable.From(() =>
            {
                _transitioning = false;
            }));
        }

        public void TransitionToMission(int missionIndex, TransitionType type = TransitionType.PortalSwirl)
        {
            GD.Print($"[SceneTransitionManager] Entering mission {missionIndex + 1} via {type}");
            TransitionTo("res://scenes/Levels/CombatLevel.tscn", type, 1.0f);
        }

        public void TransitionToCampaignMap(TransitionType type = TransitionType.IrisWipe)
        {
            TransitionTo("res://scenes/Levels/CampaignMap.tscn", type, 0.6f);
        }

        public void TransitionToVehicleBonus(TransitionType type = TransitionType.VehicleLaunch)
        {
            TransitionTo("res://scenes/Vehicles/BonusStage.tscn", type, 1.2f);
        }

        public void TransitionToGummyShip(TransitionType type = TransitionType.VehicleLaunch)
        {
            TransitionTo("res://scenes/Vehicles/GummyShip.tscn", type, 1.2f);
        }

        public void TransitionToMainMenu(TransitionType type = TransitionType.FadeToBlack)
        {
            TransitionTo("res://scenes/UI/MainMenu.tscn", type, 0.5f);
        }
    }
}
