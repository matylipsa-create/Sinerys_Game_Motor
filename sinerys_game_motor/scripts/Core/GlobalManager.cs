using Godot;
using System;

namespace Sinerys.Vision.Core
{
    public enum GameState
    {
        Boot,
        MainMenu,
        CampaignMap,
        Combat,
        VehicleBonus,
        Paused,
        GameOver
    }

    public enum GameMode
    {
        FFTCampaign,
        PortalCombat,
        VehicleBonusStage,
        GummyShip,
        Transition
    }

    public partial class GlobalManager : Node
    {
        public static GlobalManager Instance { get; private set; }

        [Signal] public delegate void StateChangedEventHandler(GameState newState, GameState oldState);
        [Signal] public delegate void ModeChangedEventHandler(GameMode newMode, GameMode oldMode);

        public GameState CurrentState { get; private set; } = GameState.Boot;
        public GameMode CurrentMode { get; private set; } = GameMode.FFTCampaign;

        public int CurrentMissionIndex { get; set; } = 0;
        public int TotalMissions { get; set; } = 30;
        public int PlayerScore { get; set; } = 0;
        public int PlayerHealth { get; set; } = 100;
        public int PlayerMaxHealth { get; set; } = 100;

        public override void _Ready()
        {
            Instance = this;
            GD.Print($"[GlobalManager] Sinerys Game Motor initialized — {TotalMissions} missions loaded.");
            SetState(GameState.MainMenu);
        }

        public void SetState(GameState newState)
        {
            if (newState == CurrentState) return;
            var old = CurrentState;
            CurrentState = newState;
            EmitSignal(SignalName.StateChanged, (int)newState, (int)old);
            GD.Print($"[GlobalManager] State: {old} → {newState}");
        }

        public void SetMode(GameMode newMode)
        {
            if (newMode == CurrentMode) return;
            var old = CurrentMode;
            CurrentMode = newMode;
            EmitSignal(SignalName.ModeChanged, (int)newMode, (int)old);
            GD.Print($"[GlobalManager] Mode: {old} → {newMode}");
        }

        public void StartCampaign()
        {
            CurrentMissionIndex = 0;
            SetMode(GameMode.FFTCampaign);
            SetState(GameState.CampaignMap);
        }

        public void StartMission(int index)
        {
            CurrentMissionIndex = index;
            SetMode(GameMode.PortalCombat);
            SetState(GameState.Combat);
        }

        public void StartVehicleBonus()
        {
            SetMode(GameMode.VehicleBonusStage);
            SetState(GameState.VehicleBonus);
        }

        public void StartGummyShip()
        {
            SetMode(GameMode.GummyShip);
            SetState(GameState.VehicleBonus);
        }

        public void MissionCompleted(int index)
        {
            GD.Print($"[GlobalManager] Mission {index + 1}/{TotalMissions} completed.");
            if (index + 1 >= TotalMissions)
            {
                SetState(GameState.GameOver);
                return;
            }
            SetMode(GameMode.FFTCampaign);
            SetState(GameState.CampaignMap);
        }

        public override void _Input(InputEvent @event)
        {
            if (@event.IsActionPressed("pause") && CurrentState == GameState.Combat)
                SetState(GameState.Paused);
            else if (@event.IsActionPressed("pause") && CurrentState == GameState.Paused)
                SetState(GameState.Combat);
        }
    }
}
