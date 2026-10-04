using Godot;
using System.Collections.Generic;
using System.Text.Json;
using System.IO;
using System.Linq;

namespace Sinerys.Vision.Core
{
    public class MissionData
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Type { get; set; } = "combat";
        public string MapScene { get; set; } = "";
        public int Difficulty { get; set; } = 1;
        public int WaveCount { get; set; } = 3;
        public List<string> EnemyTypes { get; set; } = new();
        public string BossId { get; set; } = "";
        public bool HasVehicleBonus { get; set; } = false;
        public string VehicleType { get; set; } = "";
        public List<string> UnlockedBy { get; set; } = new();
        public string Reward { get; set; } = "";
        public string CampaignNode { get; set; } = "";
        public int MapX { get; set; }
        public int MapY { get; set; }
        public bool IsCompleted { get; set; } = false;
        public bool IsUnlocked { get; set; } = false;
    }

    public class CampaignJSON
    {
        public string Version { get; set; } = "1.0.0";
        public int TotalMissions { get; set; } = 30;
        public List<MissionData> Missions { get; set; } = new();
    }

    public partial class JSONSyncManager : Node
    {
        public static JSONSyncManager Instance { get; private set; }

        private string _jsonPath = "res://data/json/campaign.json";
        private string _configPath = "res://data/configs/";

        public CampaignJSON Campaign { get; private set; } = new();
        public Godot.Collections.Dictionary<string, Variant> Configs { get; private set; } = new();

        [Signal] public delegate void CampaignLoadedEventHandler(int missionCount);
        [Signal] public delegate void MissionSyncedEventHandler(int missionId, bool completed);

        public override void _Ready()
        {
            Instance = this;
            LoadCampaign();
            LoadConfigs();
            GD.Print($"[JSONSyncManager] Ready — {Campaign.Missions.Count} missions synced.");
        }

        public void LoadCampaign()
        {
            var fileAccess = FileAccess.Open(_jsonPath, FileAccess.ModeFlags.Read);
            if (fileAccess == null)
            {
                GD.PrintErr($"[JSONSyncManager] Cannot load campaign.json at {_jsonPath}");
                return;
            }
            string jsonText = fileAccess.GetAsText();
            fileAccess.Close();

            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            Campaign = JsonSerializer.Deserialize<CampaignJSON>(jsonText, options) ?? new CampaignJSON();

            foreach (var m in Campaign.Missions)
            {
                if (m.Id == 0) m.IsUnlocked = true;
            }

            EmitSignal(SignalName.CampaignLoaded, Campaign.Missions.Count);
        }

        public void LoadConfigs()
        {
            var dir = DirAccess.Open(_configPath);
            if (dir == null) return;
            dir.ListDirBegin();
            string fileName = dir.GetNext();
            while (fileName != "")
            {
                if (fileName.EndsWith(".json"))
                {
                    var fa = FileAccess.Open(_configPath + fileName, FileAccess.ModeFlags.Read);
                    if (fa != null)
                    {
                        string text = fa.GetAsText();
                        fa.Close();
                        var json = new Json();
                        var err = json.Parse(text);
                        if (err == Error.Ok)
                            Configs[fileName.GetBaseName()] = json.Data;
                    }
                }
                fileName = dir.GetNext();
            }
            dir.ListDirEnd();
        }

        public MissionData? GetMission(int index)
        {
            if (index < 0 || index >= Campaign.Missions.Count) return null;
            return Campaign.Missions[index];
        }

        public List<MissionData> GetAllMissions() => Campaign.Missions;

        public void SetMissionCompleted(int missionId, bool completed)
        {
            var mission = Campaign.Missions.FirstOrDefault(m => m.Id == missionId);
            if (mission == null) return;
            mission.IsCompleted = completed;
            if (completed)
            {
                var next = Campaign.Missions.FirstOrDefault(m => m.Id == missionId + 1);
                if (next != null) next.IsUnlocked = true;
            }
            EmitSignal(SignalName.MissionSynced, missionId, completed);
            SaveCampaign();
        }

        public void SaveCampaign()
        {
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                WriteIndented = true
            };
            string jsonText = JsonSerializer.Serialize(Campaign, options);
            var fa = FileAccess.Open(_jsonPath, FileAccess.ModeFlags.Write);
            if (fa != null)
            {
                fa.StoreString(jsonText);
                fa.Close();
                GD.Print("[JSONSyncManager] Campaign saved.");
            }
        }

        public Godot.Collections.Array<int> GetUnlockedMissionIds()
        {
            var result = new Godot.Collections.Array<int>();
            foreach (var m in Campaign.Missions)
                if (m.IsUnlocked && !m.IsCompleted)
                    result.Add(m.Id);
            return result;
        }

        public Variant GetConfig(string configName)
        {
            return Configs.GetValueOrDefault(configName, new Variant());
        }
    }
}
