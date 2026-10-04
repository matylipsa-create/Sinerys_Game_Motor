using Godot;
using System.Collections.Generic;
using System.Linq;
using Sinerys.Vision.Core;

namespace Sinerys.Vision.Combat
{
    public enum CombatPhase
    {
        WaitingForPortal,
        PortalOpening,
        WaveIncoming,
        WaveActive,
        WaveCleared,
        MissionComplete,
        MissionFailed
    }

    public class WaveData
    {
        public int WaveNumber { get; set; }
        public List<string> EnemyTypes { get; set; } = new();
        public int EnemyCount { get; set; }
        public float SpawnInterval { get; set; } = 1.0f;
        public string BossId { get; set; } = "";
    }

    public partial class CombatManager : Node
    {
        public static CombatManager Instance { get; private set; }

        [Signal] public delegate void PhaseChangedEventHandler(int phase);
        [Signal] public delegate void WaveStartedEventHandler(int waveNumber, int enemyCount);
        [Signal] public delegate void WaveClearedEventHandler(int waveNumber);
        [Signal] public delegate void EnemyKilledEventHandler(string enemyType);
        [Signal] public delegate void PortalOpenedEventHandler(Vector3 position);
        [Signal] public delegate void CombatCompleteEventHandler(bool success);

        public CombatPhase CurrentPhase { get; private set; } = CombatPhase.WaitingForPortal;
        public int CurrentWave { get; private set; } = 0;
        public int TotalWaves { get; private set; } = 3;
        public int EnemiesRemaining { get; private set; } = 0;
        public int EnemiesKilledThisWave { get; private set; } = 0;

        private List<WaveData> _waves = new();
        private float _waveTimer = 0f;
        private float _spawnTimer = 0f;
        private List<EnemyEntity> _activeEnemies = new();

        public override void _Ready()
        {
            Instance = this;
            GlobalManager.Instance.StateChanged += OnStateChanged;
            GD.Print("[CombatManager] Ready — Serious Sam-style portal combat system.");
        }

        private void OnStateChanged(GameState newState, GameState oldState)
        {
            if (newState == GameState.Combat)
                InitializeCombat(GlobalManager.Instance.CurrentMissionIndex);
            else if (oldState == GameState.Combat && newState != GameState.Paused)
                CleanupCombat();
        }

        public void InitializeCombat(int missionIndex)
        {
            var mission = JSONSyncManager.Instance?.GetMission(missionIndex);
            if (mission == null) return;

            TotalWaves = mission.Value.WaveCount;
            CurrentWave = 0;
            _activeEnemies.Clear();
            _waves.Clear();

            for (int i = 0; i < TotalWaves; i++)
            {
                _waves.Add(new WaveData
                {
                    WaveNumber = i + 1,
                    EnemyTypes = mission.Value.EnemyTypes,
                    EnemyCount = 5 + i * 3,
                    SpawnInterval = Mathf.Max(0.3f, 1.5f - i * 0.2f),
                    BossId = (i == TotalWaves - 1 && !string.IsNullOrEmpty(mission.Value.BossId))
                        ? mission.Value.BossId : ""
                });
            }

            SetPhase(CombatPhase.PortalOpening);
            GD.Print($"[CombatManager] Mission {missionIndex + 1} initialized — {TotalWaves} waves.");
        }

        public void SetPhase(CombatPhase phase)
        {
            CurrentPhase = phase;
            EmitSignal(SignalName.PhaseChanged, (int)phase);
            GD.Print($"[CombatManager] Phase → {phase}");
        }

        public override void _Process(double delta)
        {
            if (GlobalManager.Instance.CurrentState != GameState.Combat) return;

            switch (CurrentPhase)
            {
                case CombatPhase.PortalOpening:
                    _waveTimer += (float)delta;
                    if (_waveTimer >= 2.0f)
                    {
                        _waveTimer = 0f;
                        EmitSignal(SignalName.PortalOpened, Vector3.Zero);
                        StartNextWave();
                    }
                    break;

                case CombatPhase.WaveIncoming:
                    _waveTimer += (float)delta;
                    if (_waveTimer >= 1.5f)
                    {
                        _waveTimer = 0f;
                        SetPhase(CombatPhase.WaveActive);
                    }
                    break;

                case CombatPhase.WaveActive:
                    _spawnTimer += (float)delta;
                    if (CurrentWave - 1 < _waves.Count)
                    {
                        var wave = _waves[CurrentWave - 1];
                        if (_spawnTimer >= wave.SpawnInterval && EnemiesKilledThisWave + _activeEnemies.Count < wave.EnemyCount)
                        {
                            _spawnTimer = 0f;
                            SpawnEnemy(wave.EnemyTypes[GD.RandRange(0, wave.EnemyTypes.Count - 1)]);
                        }
                    }
                    if (EnemiesRemaining == 0 && EnemiesKilledThisWave >= GetCurrentWaveTarget())
                    {
                        SetPhase(CombatPhase.WaveCleared);
                        EmitSignal(SignalName.WaveCleared, CurrentWave);
                    }
                    break;

                case CombatPhase.WaveCleared:
                    _waveTimer += (float)delta;
                    if (_waveTimer >= 3.0f)
                    {
                        _waveTimer = 0f;
                        if (CurrentWave >= TotalWaves)
                        {
                            SetPhase(CombatPhase.MissionComplete);
                            EmitSignal(SignalName.CombatComplete, true);
                            OnMissionComplete();
                        }
                        else
                        {
                            SetPhase(CombatPhase.PortalOpening);
                        }
                    }
                    break;
            }
        }

        private int GetCurrentWaveTarget()
        {
            if (CurrentWave - 1 < 0 || CurrentWave - 1 >= _waves.Count) return 0;
            return _waves[CurrentWave - 1].EnemyCount;
        }

        private void StartNextWave()
        {
            CurrentWave++;
            if (CurrentWave - 1 >= _waves.Count) return;
            var wave = _waves[CurrentWave - 1];
            EnemiesKilledThisWave = 0;
            EnemiesRemaining = wave.EnemyCount;
            SetPhase(CombatPhase.WaveIncoming);
            EmitSignal(SignalName.WaveStarted, wave.WaveNumber, wave.EnemyCount);
            GD.Print($"[CombatManager] Wave {wave.WaveNumber}/{TotalWaves} — {wave.EnemyCount} enemies.");
        }

        private void SpawnEnemy(string enemyType)
        {
            var enemy = new EnemyEntity(enemyType);
            _activeEnemies.Add(enemy);
            EnemiesRemaining = _activeEnemies.Count + (GetCurrentWaveTarget() - EnemiesKilledThisWave - _activeEnemies.Count);
            GD.Print($"[CombatManager] Spawned {enemyType} — active: {_activeEnemies.Count}");
        }

        public void KillEnemy(string enemyType)
        {
            if (_activeEnemies.Count > 0)
                _activeEnemies.RemoveAt(0);
            EnemiesKilledThisWave++;
            EnemiesRemaining = GetCurrentWaveTarget() - EnemiesKilledThisWave;
            EmitSignal(SignalName.EnemyKilled, enemyType);
            GlobalManager.Instance.PlayerScore += 100;

            if (GlobalManager.Instance.PlayerHealth <= 0)
            {
                SetPhase(CombatPhase.MissionFailed);
                EmitSignal(SignalName.CombatComplete, false);
            }
        }

        private void OnMissionComplete()
        {
            GD.Print("[CombatManager] All waves cleared — mission complete!");
            CampaignManager.Instance?.CompleteNode(GlobalManager.Instance.CurrentMissionIndex);

            var mission = JSONSyncManager.Instance?.GetMission(GlobalManager.Instance.CurrentMissionIndex);
            if (mission != null && mission.Value.HasVehicleBonus)
            {
                GD.Print($"[CombatManager] Vehicle bonus unlocked: {mission.Value.VehicleType}");
                GlobalManager.Instance.StartVehicleBonus();
                SceneTransitionManager.Instance.TransitionToVehicleBonus();
            }
            else
            {
                GlobalManager.Instance.MissionCompleted(GlobalManager.Instance.CurrentMissionIndex);
                SceneTransitionManager.Instance.TransitionToCampaignMap();
            }
        }

        private void CleanupCombat()
        {
            _activeEnemies.Clear();
            _waves.Clear();
            CurrentWave = 0;
            EnemiesRemaining = 0;
            EnemiesKilledThisWave = 0;
            SetPhase(CombatPhase.WaitingForPortal);
        }
    }
}
