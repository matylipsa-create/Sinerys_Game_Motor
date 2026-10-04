using Godot;
using Sinerys.Vision.Core;

namespace Sinerys.Vision.UI
{
    public partial class MainMenuController : Control
    {
        private Button _startButton = null!;
        private Button _exitButton = null!;

        public override void _Ready()
        {
            _startButton = GetNode<Button>("StartButton");
            _exitButton = GetNode<Button>("ExitButton");
            _startButton.Pressed += OnStartPressed;
            _exitButton.Pressed += OnExitPressed;
        }

        private void OnStartPressed()
        {
            GD.Print("[MainMenu] Starting campaign...");
            GlobalManager.Instance.StartCampaign();
            SceneTransitionManager.Instance.TransitionToCampaignMap();
        }

        private void OnExitPressed()
        {
            GetTree().Quit();
        }
    }
}
