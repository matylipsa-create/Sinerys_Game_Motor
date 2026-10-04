using Godot;
using System.Collections.Generic;
using System.Linq;
using Sinerys.Vision.Core;

namespace Sinerys.Vision.Campaign
{
    public partial class CampaignMapView : Node2D
    {
        private Camera2D _camera = null!;
        private Node2D _nodesContainer = null!;
        private Line2D _connectionsLine = null!;
        private Godot.Collections.Dictionary<int, Sprite2D> _nodeSprites = new();
        private Sprite2D? _selectedSprite;
        private Label _infoLabel = null!;

        private const float NodeSpacing = 120.0f;
        private const float NodeRadius = 30.0f;

        public override void _Ready()
        {
            _camera = new Camera2D { Zoom = new Vector2(1, 1), Enabled = true };
            AddChild(_camera);

            _connectionsLine = new Line2D { Width = 3, DefaultColor = new Color(0.4f, 0.5f, 0.8f, 0.6f) };
            AddChild(_connectionsLine);

            _nodesContainer = new Node2D();
            AddChild(_nodesContainer);

            _infoLabel = new Label
            {
                Position = new Vector2(20, 20),
                Size = new Vector2(400, 80),
                Text = "Campaign Map — Select a node"
            };
            AddChild(_infoLabel);

            CampaignManager.Instance.MapReady += OnMapReady;
            if (CampaignManager.Instance.Nodes.Count > 0)
                OnMapReady();
        }

        private void OnMapReady()
        {
            RenderNodes();
            RenderConnections();
        }

        private void RenderNodes()
        {
            foreach (var (id, node) in CampaignManager.Instance.Nodes)
            {
                var pos = new Vector2(node.MapPosition.X * NodeSpacing, node.MapPosition.Y * NodeSpacing);
                var sprite = new Sprite2D();
                var tex = CreateNodeTexture(node.Type, node.IsUnlocked, node.IsCompleted);
                sprite.Texture = tex;
                sprite.Position = pos;
                sprite.Scale = new Vector2(0.5f, 0.5f);
                _nodesContainer.AddChild(sprite);
                _nodeSprites[id] = sprite;
            }
        }

        private void RenderConnections()
        {
            _connectionsLine.ClearPoints();
            foreach (var (id, node) in CampaignManager.Instance.Nodes)
            {
                var fromPos = new Vector2(node.MapPosition.X * NodeSpacing, node.MapPosition.Y * NodeSpacing);
                foreach (var connId in node.Connections)
                {
                    if (!CampaignManager.Instance.Nodes.TryGetValue(connId, out var connNode)) continue;
                    var toPos = new Vector2(connNode.MapPosition.X * NodeSpacing, connNode.MapPosition.Y * NodeSpacing);
                    _connectionsLine.AddPoint(fromPos);
                    _connectionsLine.AddPoint(toPos);
                }
            }
        }

        private ImageTexture CreateNodeTexture(CampaignNodeType type, bool unlocked, bool completed)
        {
            var image = Image.CreateEmpty(64, 64, false, Image.Format.Rgba8);
            Color baseColor = type switch
            {
                CampaignNodeType.Boss => new Color(0.9f, 0.2f, 0.2f),
                CampaignNodeType.VehicleBonus => new Color(0.2f, 0.8f, 0.4f),
                CampaignNodeType.GummyShip => new Color(0.3f, 0.6f, 0.9f),
                CampaignNodeType.Story => new Color(0.8f, 0.7f, 0.2f),
                CampaignNodeType.Hub => new Color(0.6f, 0.6f, 0.6f),
                _ => new Color(0.3f, 0.5f, 0.9f)
            };
            if (completed) baseColor = baseColor.Darkened(0.4f);
            if (!unlocked) baseColor = new Color(0.2f, 0.2f, 0.3f);

            image.Fill(new Color(0, 0, 0, 0));
            var center = new Vector2I(32, 32);
            int radius = 28;
            for (int x = 0; x < 64; x++)
            {
                for (int y = 0; y < 64; y++)
                {
                    var dist = new Vector2(x - center.X, y - center.Y).Length();
                    if (dist <= radius)
                        image.SetPixel(x, y, baseColor);
                    else if (dist <= radius + 2)
                        image.SetPixel(x, y, baseColor.Darkened(0.5f));
                }
            }
            return ImageTexture.CreateFromImage(image);
        }

        public override void _Input(InputEvent @event)
        {
            if (@event is InputEventMouseButton mouse && mouse.Pressed && mouse.ButtonIndex == MouseButton.Left)
            {
                var worldPos = GetGlobalMousePosition();
                foreach (var (id, sprite) in _nodeSprites)
                {
                    if (worldPos.DistanceTo(sprite.Position) < NodeRadius)
                    {
                        var node = CampaignManager.Instance.GetNode(id);
                        if (node != null && node.IsUnlocked && !node.IsCompleted)
                        {
                            _selectedSprite = sprite;
                            _infoLabel.Text = $"Mission {id + 1}: {node.Name}\nType: {node.Type}";
                            CampaignManager.Instance.SelectNode(id);
                        }
                        break;
                    }
                }
            }
        }
    }
}
