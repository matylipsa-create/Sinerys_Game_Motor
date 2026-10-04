using Godot;
using System.Collections.Generic;
using System.Linq;
using Sinerys.Vision.Core;

namespace Sinerys.Vision.Campaign
{
    public enum CampaignNodeType
    {
        Story,
        Combat,
        Boss,
        VehicleBonus,
        GummyShip,
        Shop,
        Hub
    }

    public class CampaignNode
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public CampaignNodeType Type { get; set; } = CampaignNodeType.Combat;
        public Vector2I MapPosition { get; set; }
        public List<int> Connections { get; set; } = new();
        public bool IsUnlocked { get; set; }
        public bool IsCompleted { get; set; }
        public string MissionId { get; set; } = "";
    }

    public partial class CampaignManager : Node
    {
        public static CampaignManager Instance { get; private set; }

        [Signal] public delegate void NodeSelectedEventHandler(int nodeId);
        [Signal] public delegate void CampaignProgressEventHandler(int completed, int total);
        [Signal] public delegate void MapReadyEventHandler();

        public Godot.Collections.Dictionary<int, CampaignNode> Nodes { get; private set; } = new();
        public int CurrentNodeId { get; private set; } = 0;

        public override void _Ready()
        {
            Instance = this;
            BuildCampaignMap();
            GD.Print($"[CampaignManager] FFT-style map built — {Nodes.Count} nodes.");
            EmitSignal(SignalName.MapReady);
        }

        private void BuildCampaignMap()
        {
            var missions = JSONSyncManager.Instance?.GetAllMissions();
            if (missions == null || missions.Count == 0)
            {
                GD.PrintErr("[CampaignManager] No missions found in JSON data.");
                return;
            }

            for (int i = 0; i < missions.Count; i++)
            {
                var m = missions[i];
                var nodeType = m.Type switch
                {
                    "boss" => CampaignNodeType.Boss,
                    "vehicle" => CampaignNodeType.VehicleBonus,
                    "gummy_ship" => CampaignNodeType.GummyShip,
                    "story" => CampaignNodeType.Story,
                    "hub" => CampaignNodeType.Hub,
                    _ => CampaignNodeType.Combat
                };

                var node = new CampaignNode
                {
                    Id = m.Id,
                    Name = m.Name,
                    Type = nodeType,
                    MapPosition = new Vector2I(m.MapX, m.MapY),
                    IsUnlocked = m.IsUnlocked,
                    IsCompleted = m.IsCompleted,
                    MissionId = m.Id.ToString()
                };

                if (i + 1 < missions.Count)
                    node.Connections.Add(missions[i + 1].Id);
                if (m.HasVehicleBonus && i + 2 < missions.Count)
                    node.Connections.Add(missions[i + 2].Id);

                Nodes[node.Id] = node;
            }
        }

        public CampaignNode? GetNode(int id)
        {
            return Nodes.GetValueOrDefault(id);
        }

        public List<CampaignNode> GetUnlockedNodes()
        {
            return Nodes.Values.Where(n => n.IsUnlocked && !n.IsCompleted).ToList();
        }

        public void SelectNode(int nodeId)
        {
            var node = GetNode(nodeId);
            if (node == null || !node.IsUnlocked || node.IsCompleted) return;

            CurrentNodeId = nodeId;
            EmitSignal(SignalName.NodeSelected, nodeId);
            GD.Print($"[CampaignManager] Node selected: {node.Name} (type={node.Type})");

            switch (node.Type)
            {
                case CampaignNodeType.Combat:
                case CampaignNodeType.Boss:
                    GlobalManager.Instance.StartMission(node.Id);
                    SceneTransitionManager.Instance.TransitionToMission(node.Id);
                    break;
                case CampaignNodeType.VehicleBonus:
                    GlobalManager.Instance.StartVehicleBonus();
                    SceneTransitionManager.Instance.TransitionToVehicleBonus();
                    break;
                case CampaignNodeType.GummyShip:
                    GlobalManager.Instance.StartGummyShip();
                    SceneTransitionManager.Instance.TransitionToGummyShip();
                    break;
                case CampaignNodeType.Story:
                case CampaignNodeType.Hub:
                    GD.Print($"[CampaignManager] Entering story/hub node: {node.Name}");
                    break;
            }
        }

        public void CompleteNode(int nodeId)
        {
            var node = GetNode(nodeId);
            if (node == null) return;
            node.IsCompleted = true;
            JSONSyncManager.Instance?.SetMissionCompleted(nodeId, true);

            foreach (var connId in node.Connections)
            {
                var conn = GetNode(connId);
                if (conn != null) conn.IsUnlocked = true;
            }

            int completed = Nodes.Values.Count(n => n.IsCompleted);
            EmitSignal(SignalName.CampaignProgress, completed, Nodes.Count);
            GD.Print($"[CampaignManager] Node {nodeId} completed — {completed}/{Nodes.Count} total.");
        }

        public float GetProgress()
        {
            if (Nodes.Count == 0) return 0f;
            return (float)Nodes.Values.Count(n => n.IsCompleted) / Nodes.Count;
        }
    }
}
