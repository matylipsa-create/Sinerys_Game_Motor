using Godot;
using System;
using System.Collections.Generic;

public partial class MultiversalDriftManager : Node
{
    private readonly Random _random = new Random();
    private readonly List<ParallelRealityData> _shiftHistory = new List<ParallelRealityData>();
    private ParallelRealityData _currentReality = CreatePrimeReality();
    private int _nextRealityId;

    public override void _Ready()
    {
        GD.Print("[Multiversal Drift C#] Engine tuned to baseline cosmic web physics.");
    }

    public Godot.Collections.Dictionary BreachObservableEdge(string targetDimensionName)
    {
        if (string.IsNullOrWhiteSpace(targetDimensionName))
            throw new ArgumentException("A destination dimension name is required.", nameof(targetDimensionName));

        string universeName = targetDimensionName.Trim();
        var newReality = new ParallelRealityData
        {
            RealityId = $"reality-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds():x}-{_nextRealityId++:x}",
            UniverseName = universeName,
            FilamentResonance = (int)(_random.NextDouble() * 100),
            SporeMutationRate = RoundToTwoDecimals((float)(_random.NextDouble() * 2.5 + 0.5)),
            GrinderEfficiency = RoundToTwoDecimals((float)(_random.NextDouble() * 1.8 + 0.4)),
            EntropyRate = RoundToTwoDecimals((float)(_random.NextDouble() * 2.0 + 0.8)),
            AnomalyDescription = "Fluctuación cuántica extrema más allá del filamento cósmico principal. Las leyes de la materia se desestabilizan."
        };

        _shiftHistory.Add(_currentReality.Copy());
        _currentReality = newReality;
        GD.Print($"[Multiversal Drift C#] Dimensional breach successful: {universeName}");
        return ToGodotDictionary(newReality);
    }

    public Godot.Collections.Dictionary GetCurrentReality()
    {
        return ToGodotDictionary(_currentReality);
    }

    public Godot.Collections.Array GetShiftHistory()
    {
        var history = new Godot.Collections.Array();
        foreach (ParallelRealityData reality in _shiftHistory)
            history.Add(ToGodotDictionary(reality));
        return history;
    }

    private static ParallelRealityData CreatePrimeReality()
    {
        return new ParallelRealityData
        {
            RealityId = "prime-00",
            UniverseName = "Universo Observable Base (Red Cósmica Original)",
            FilamentResonance = 50,
            SporeMutationRate = 1.0f,
            GrinderEfficiency = 1.0f,
            EntropyRate = 1.0f,
            AnomalyDescription = "Leyes físicas estables dentro del borde observable."
        };
    }

    private static float RoundToTwoDecimals(float value)
    {
        return (float)(Math.Floor(value * 100.0 + 0.5) / 100.0);
    }

    private static Godot.Collections.Dictionary ToGodotDictionary(ParallelRealityData reality)
    {
        var modifiers = new Godot.Collections.Dictionary
        {
            ["sporeMutationRate"] = reality.SporeMutationRate,
            ["grinderEfficiency"] = reality.GrinderEfficiency,
            ["entropyRate"] = reality.EntropyRate
        };

        return new Godot.Collections.Dictionary
        {
            ["realityId"] = reality.RealityId,
            ["universeName"] = reality.UniverseName,
            ["filamentResonance"] = reality.FilamentResonance,
            ["physicalModifiers"] = modifiers,
            ["anomalyDescription"] = reality.AnomalyDescription
        };
    }

    private sealed class ParallelRealityData
    {
        public string RealityId { get; set; } = string.Empty;
        public string UniverseName { get; set; } = string.Empty;
        public int FilamentResonance { get; set; }
        public float SporeMutationRate { get; set; }
        public float GrinderEfficiency { get; set; }
        public float EntropyRate { get; set; }
        public string AnomalyDescription { get; set; } = string.Empty;

        public ParallelRealityData Copy()
        {
            return (ParallelRealityData)MemberwiseClone();
        }
    }
}