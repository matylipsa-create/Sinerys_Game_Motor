using Godot;
using System.Collections.Generic;
using System.Linq;
using Sinerys.Vision.Core;

namespace Sinerys.Vision.Vehicles
{
    public enum VehicleType
    {
        BonusStage,
        GummyShip,
        Tank,
        Hovercraft
    }

    public partial class VehicleManager : Node
    {
        public static VehicleManager Instance { get; private set; }

        [Signal] public delegate void VehicleStageStartedEventHandler(int vehicleType);
        [Signal] public delegate void VehicleStageCompletedEventHandler(bool success, int score);
        [Signal] public delegate void VehicleScoreChangedEventHandler(int score);

        public VehicleType CurrentVehicle { get; private set; } = VehicleType.BonusStage;
        public int VehicleScore { get; private set; } = 0;
        public float StageTimer { get; private set; } = 0f;
        public float StageTimeLimit { get; private set; } = 60f;
        public bool IsStageActive { get; private set; } = false;

        public override void _Ready()
        {
            Instance = this;
            GlobalManager.Instance.StateChanged += OnStateChanged;
            GD.Print("[VehicleManager] Ready — vehicle bonus stage system.");
        }

        private void OnStateChanged(GameState newState, GameState oldState)
        {
            if (newState == GameState.VehicleBonus)
                StartVehicleStage(GlobalManager.Instance.CurrentMode == GameMode.GummyShip
                    ? VehicleType.GummyShip : VehicleType.BonusStage);
            else if (oldState == GameState.VehicleBonus)
                EndVehicleStage();
        }

        public void StartVehicleStage(VehicleType type)
        {
            CurrentVehicle = type;
            VehicleScore = 0;
            StageTimer = 0f;
            StageTimeLimit = type == VehicleType.GummyShip ? 90f : 60f;
            IsStageActive = true;
            EmitSignal(SignalName.VehicleStageStarted, (int)type);
            GD.Print($"[VehicleManager] Vehicle stage started: {type} — time limit: {StageTimeLimit}s");
        }

        public override void _Process(double delta)
        {
            if (!IsStageActive) return;
            StageTimer += (float)delta;

            if (StageTimer >= StageTimeLimit)
            {
                CompleteStage(true);
            }
        }

        public void AddScore(int points)
        {
            VehicleScore += points;
            EmitSignal(SignalName.VehicleScoreChanged, VehicleScore);
        }

        public void CompleteStage(bool success)
        {
            if (!IsStageActive) return;
            IsStageActive = false;
            EmitSignal(SignalName.VehicleStageCompleted, success, VehicleScore);
            GD.Print($"[VehicleManager] Stage complete — score: {VehicleScore}, success: {success}");

            GlobalManager.Instance.PlayerScore += VehicleScore;
            GlobalManager.Instance.MissionCompleted(GlobalManager.Instance.CurrentMissionIndex);
            SceneTransitionManager.Instance.TransitionToCampaignMap();
        }

        public void EndVehicleStage()
        {
            IsStageActive = false;
            VehicleScore = 0;
            StageTimer = 0f;
        }

        public float GetTimeRemaining() => Mathf.Max(0, StageTimeLimit - StageTimer);
    }
}
