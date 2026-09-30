using Godot;
using System;
using System.Collections.Generic;

public partial class StrategicParadoxDirector : Node
{
    private readonly Dictionary<string, ParadoxCrisisData> _activeCrises =
        new Dictionary<string, ParadoxCrisisData>(StringComparer.Ordinal);
    private readonly Dictionary<string, int> _resourceStockpiles = new Dictionary<string, int>
    {
        ["biomass"] = 150,
        ["alloy"] = 80,
        ["sporeSerum"] = 10
    };
    private int _nextCrisisId;

    private float _refugeMorale = 75f;
    private float _hiveTension = 30f;

    [Export(PropertyHint.Range, "0,100,1")]
    public float RefugeMorale
    {
        get => _refugeMorale;
        set => _refugeMorale = ClampStat(value);
    }

    [Export(PropertyHint.Range, "0,100,1")]
    public float HiveTension
    {
        get => _hiveTension;
        set => _hiveTension = ClampStat(value);
    }

    public override void _Ready()
    {
        RefugeMorale = Mathf.Clamp(RefugeMorale, 0f, 100f);
        HiveTension = Mathf.Clamp(HiveTension, 0f, 100f);
        GD.Print("[Paradox Director C#] Strategic event engine online.");
    }

    public Godot.Collections.Dictionary TriggerSystemicCrisis(string sector)
    {
        if (string.IsNullOrWhiteSpace(sector))
            throw new ArgumentException("A crisis requires an affected sector.", nameof(sector));

        string affectedSector = sector.Trim();
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        string crisisId = $"crisis-{timestamp}-{_nextCrisisId++}";
        var crisis = new ParadoxCrisisData
        {
            Id = crisisId,
            Title = $"Falla Estructural en Sector {affectedSector}",
            Description = $"La presión de la colmena fúngica ha comprometido los sellos del sector {affectedSector}. Los recursos de purificación están al límite y las facciones locales exigen una respuesta inmediata.",
            Severity = "critical",
            AffectedSector = affectedSector,
            Timestamp = timestamp,
            Choices = new List<StrategicChoiceData>
            {
                new StrategicChoiceData
                {
                    Id = "purge_zone",
                    Label = "Purga Química Total (Quemar biomasa)",
                    ResourceCost = new Dictionary<string, int> { ["biomass"] = 40, ["sporeSerum"] = 2 },
                    MoralImpact = -5,
                    SecurityImpact = 15,
                    OutcomeDescription = "El sector se estabiliza, pero el humo tóxico y la pérdida de suministros reducen la moral del refugio."
                },
                new StrategicChoiceData
                {
                    Id = "fortify_and_pray",
                    Label = "Desviar energía del Radar P2P para escudos",
                    ResourceCost = new Dictionary<string, int> { ["alloy"] = 25 },
                    MoralImpact = 5,
                    SecurityImpact = 5,
                    OutcomeDescription = "Las defensas aguantan temporalmente, pero el radar comunitario queda ciego por 3 horas."
                },
                new StrategicChoiceData
                {
                    Id = "evacuate_salvage",
                    Label = "Orden de evacuación y rescate de emergencia",
                    ResourceCost = new Dictionary<string, int> { ["biomass"] = 10, ["alloy"] = 10 },
                    MoralImpact = 12,
                    SecurityImpact = -10,
                    OutcomeDescription = "Se salvan vidas y sube la lealtad, pero la colmena gana terreno libre en el sector."
                }
            }
        };

        _activeCrises.Add(crisisId, crisis);
        return ToGodotDictionary(crisis);
    }

    public Godot.Collections.Dictionary ResolveCrisis(string crisisId, string choiceId)
    {
        if (!_activeCrises.TryGetValue(crisisId ?? string.Empty, out ParadoxCrisisData crisis))
            return Resolution(false, "Crisis no encontrada.");

        StrategicChoiceData choice = crisis.Choices.Find(candidate => candidate.Id == choiceId);
        if (choice == null)
            return Resolution(false, "Elección inválida.");

        foreach (KeyValuePair<string, int> cost in choice.ResourceCost)
        {
            if (cost.Value < 0)
                return Resolution(false, $"Coste inválido para el recurso {cost.Key}.");
            if (!_resourceStockpiles.TryGetValue(cost.Key, out int available) || available < cost.Value)
                return Resolution(false, $"Recursos insuficientes: faltan unidades de {cost.Key}.");
        }

        foreach (KeyValuePair<string, int> cost in choice.ResourceCost)
            _resourceStockpiles[cost.Key] -= cost.Value;

        RefugeMorale = Mathf.Clamp(RefugeMorale + choice.MoralImpact, 0f, 100f);
        HiveTension = Mathf.Clamp(HiveTension - choice.SecurityImpact / 2f, 0f, 100f);
        _activeCrises.Remove(crisis.Id);

        GD.Print($"[Paradox Director C#] Crisis resolved: {choice.OutcomeDescription}");
        return Resolution(true, choice.OutcomeDescription);
    }

    public bool AddResource(string resource, int amount)
    {
        if (string.IsNullOrWhiteSpace(resource) || amount <= 0) return false;

        string key = resource.Trim();
        int current = _resourceStockpiles.TryGetValue(key, out int stock) ? stock : 0;
        if (amount > int.MaxValue - current) return false;

        _resourceStockpiles[key] = current + amount;
        return true;
    }

    public Godot.Collections.Array GetActiveCrises()
    {
        var crises = new Godot.Collections.Array();
        foreach (ParadoxCrisisData crisis in _activeCrises.Values)
            crises.Add(ToGodotDictionary(crisis));
        return crises;
    }

    public Godot.Collections.Dictionary GetGlobalState()
    {
        var resources = new Godot.Collections.Dictionary();
        foreach (KeyValuePair<string, int> resource in _resourceStockpiles)
            resources[resource.Key] = resource.Value;

        return new Godot.Collections.Dictionary
        {
            ["refugeMorale"] = RefugeMorale,
            ["hiveTension"] = HiveTension,
            ["resourceStockpiles"] = resources
        };
    }

    private static Godot.Collections.Dictionary ToGodotDictionary(ParadoxCrisisData crisis)
    {
        var choices = new Godot.Collections.Array();
        foreach (StrategicChoiceData choice in crisis.Choices)
        {
            var resourceCost = new Godot.Collections.Dictionary();
            foreach (KeyValuePair<string, int> cost in choice.ResourceCost)
                resourceCost[cost.Key] = cost.Value;

            choices.Add(new Godot.Collections.Dictionary
            {
                ["id"] = choice.Id,
                ["label"] = choice.Label,
                ["resourceCost"] = resourceCost,
                ["moralImpact"] = choice.MoralImpact,
                ["securityImpact"] = choice.SecurityImpact,
                ["outcomeDescription"] = choice.OutcomeDescription
            });
        }

        return new Godot.Collections.Dictionary
        {
            ["id"] = crisis.Id,
            ["title"] = crisis.Title,
            ["description"] = crisis.Description,
            ["severity"] = crisis.Severity,
            ["affectedSector"] = crisis.AffectedSector,
            ["choices"] = choices,
            ["timestamp"] = crisis.Timestamp
        };
    }

    private static Godot.Collections.Dictionary Resolution(bool success, string message)
    {
        return new Godot.Collections.Dictionary
        {
            ["success"] = success,
            ["message"] = message
        };
    }

    private static float ClampStat(float value)
    {
        return float.IsNaN(value) || float.IsInfinity(value)
            ? 0f
            : Mathf.Clamp(value, 0f, 100f);
    }

    private sealed class ParadoxCrisisData
    {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Severity { get; set; } = string.Empty;
        public string AffectedSector { get; set; } = string.Empty;
        public long Timestamp { get; set; }
        public List<StrategicChoiceData> Choices { get; set; } = new List<StrategicChoiceData>();
    }

    private sealed class StrategicChoiceData
    {
        public string Id { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public Dictionary<string, int> ResourceCost { get; set; } = new Dictionary<string, int>();
        public int MoralImpact { get; set; }
        public int SecurityImpact { get; set; }
        public string OutcomeDescription { get; set; } = string.Empty;
    }
}