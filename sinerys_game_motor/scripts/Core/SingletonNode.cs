using Godot;
using System;

namespace Sinerys.Vision.Core
{
    public abstract partial class SingletonNode<T> : Node where T : Node
    {
        public static T Instance { get; private set; } = null!;

        public override void _Ready()
        {
            Instance = this as T ?? throw new InvalidOperationException(
                $"SingletonNode<T>: generic T must match the concrete type {GetType().Name}.");
            OnReady();
        }

        protected virtual void OnReady() { }
    }
}
