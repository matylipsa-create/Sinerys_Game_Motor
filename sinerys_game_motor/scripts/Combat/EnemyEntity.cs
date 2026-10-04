using Godot;
using System;

namespace Sinerys.Vision.Combat
{
    public enum EnemyState
    {
        Spawning,
        Idle,
        Chasing,
        Attacking,
        Dying
    }

    public partial class EnemyEntity : Node
    {
        public string EnemyType { get; private set; }
        public EnemyState State { get; private set; } = EnemyState.Spawning;
        public int Health { get; private set; } = 50;
        public int MaxHealth { get; private set; } = 50;
        public int Damage { get; private set; } = 10;
        public float MoveSpeed { get; private set; } = 3.0f;
        public float AttackRange { get; private set; } = 2.0f;
        public float AttackCooldown { get; private set; } = 1.5f;
        private float _currentCooldown = 0f;

        public EnemyEntity(string type)
        {
            EnemyType = type;
            ConfigureByType(type);
        }

        private void ConfigureByType(string type)
        {
            switch (type.ToLowerInvariant())
            {
                case "grunt":
                    Health = MaxHealth = 30; Damage = 8; MoveSpeed = 4.0f;
                    break;
                case "soldier":
                    Health = MaxHealth = 60; Damage = 15; MoveSpeed = 3.0f;
                    break;
                case "heavy":
                    Health = MaxHealth = 120; Damage = 25; MoveSpeed = 1.5f; AttackRange = 3.0f;
                    break;
                case "kamikaze":
                    Health = MaxHealth = 20; Damage = 40; MoveSpeed = 6.0f;
                    break;
                case "boss":
                    Health = MaxHealth = 500; Damage = 40; MoveSpeed = 2.5f; AttackRange = 4.0f;
                    break;
                default:
                    Health = MaxHealth = 50; Damage = 10; MoveSpeed = 3.0f;
                    break;
            }
        }

        public void TakeDamage(int amount)
        {
            Health -= amount;
            if (Health <= 0)
            {
                State = EnemyState.Dying;
                CombatManager.Instance?.KillEnemy(EnemyType);
            }
        }

        public void DealDamage()
        {
            if (_currentCooldown > 0) return;
            _currentCooldown = AttackCooldown;
            GlobalManager.Instance.PlayerHealth -= Damage;
            GD.Print($"[EnemyEntity] {EnemyType} dealt {Damage} damage — player HP: {GlobalManager.Instance.PlayerHealth}");
        }

        public void UpdateState(float delta, Vector3 playerPosition, Vector3 enemyPosition)
        {
            _currentCooldown = Math.Max(0, _currentCooldown - delta);

            if (State == EnemyState.Dying) return;
            if (State == EnemyState.Spawning)
            {
                State = EnemyState.Chasing;
                return;
            }

            float dist = enemyPosition.DistanceTo(playerPosition);
            if (dist <= AttackRange)
            {
                State = EnemyState.Attacking;
                DealDamage();
            }
            else
            {
                State = EnemyState.Chasing;
            }
        }
    }
}
