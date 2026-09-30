using Godot;
using System;
using System.Collections.Generic;

public partial class SentraBlueprintGraph : Node
{
    private const int DefaultMaxSteps = 1000;
    private readonly Dictionary<string, BlueprintNodeData> _nodes = new Dictionary<string, BlueprintNodeData>(StringComparer.Ordinal);
    private string _entryNodeId;

    [Export]
    public string GraphName { get; set; } = "DefaultSurvivalGraph";

    public override void _Ready()
    {
        GD.Print($"[Sentra Blueprint C#] Graph '{GraphName}' initialized.");
    }

    public void RegisterNode(Godot.Collections.Dictionary node, bool isEntry = false)
    {
        if (node == null) throw new ArgumentNullException(nameof(node));

        string nodeId = ReadString(node, "nodeId");
        string nodeType = ReadString(node, "nodeType");
        string title = ReadString(node, "title");
        if (string.IsNullOrWhiteSpace(nodeId)) throw new ArgumentException("Node id cannot be empty.", nameof(node));
        if (nodeType != "condition" && nodeType != "action" && nodeType != "event" && nodeType != "modifier")
            throw new ArgumentException($"Unsupported node type: {nodeType}.", nameof(node));

        var parameters = new Godot.Collections.Dictionary();
        if (node.ContainsKey("parameters") && node["parameters"].VariantType == Variant.Type.Dictionary)
            parameters = node["parameters"].AsGodotDictionary();

        var connections = new List<string>();
        if (node.ContainsKey("connectedNextNodes") && node["connectedNextNodes"].VariantType == Variant.Type.Array)
        {
            foreach (Variant connection in node["connectedNextNodes"].AsGodotArray())
            {
                if (connection.VariantType == Variant.Type.String)
                    connections.Add(connection.AsString());
            }
        }

        _nodes[nodeId] = new BlueprintNodeData(nodeId, nodeType, title, parameters, connections);
        if (isEntry || string.IsNullOrEmpty(_entryNodeId)) _entryNodeId = nodeId;
    }

    public Godot.Collections.Dictionary EvaluateGraph(Godot.Collections.Dictionary contextData, int maxSteps = DefaultMaxSteps)
    {
        var finalContext = new Godot.Collections.Dictionary();
        if (contextData != null)
        {
            foreach (Variant key in contextData.Keys)
                finalContext[key] = contextData[key];
        }

        var executedPath = new Godot.Collections.Array<string>();
        string finalOutcome = "Graph execution completed without terminal outcome.";
        string currentNodeId = _entryNodeId;
        string error = string.Empty;

        if (maxSteps < 1)
            return Evaluation(executedPath, finalOutcome, finalContext, "Maximum step count must be positive.");
        if (string.IsNullOrEmpty(currentNodeId))
            return Evaluation(executedPath, finalOutcome, finalContext, $"Graph {GraphName} has no entry node.");

        int steps = 0;
        while (!string.IsNullOrEmpty(currentNodeId))
        {
            if (steps >= maxSteps)
            {
                error = $"Graph execution stopped after {maxSteps} steps to prevent an infinite loop.";
                break;
            }
            if (!_nodes.TryGetValue(currentNodeId, out BlueprintNodeData node))
            {
                error = $"Node not found: {currentNodeId}.";
                break;
            }

            steps++;
            executedPath.Add(node.Title);
            string nextNodeId = node.ConnectedNextNodes.Count > 0 ? node.ConnectedNextNodes[0] : string.Empty;

            switch (node.NodeType)
            {
                case "condition":
                    string checkKey = ReadString(node.Parameters, "checkKey");
                    string comparison = ReadString(node.Parameters, "comparison", "gte");
                    if (string.IsNullOrEmpty(checkKey))
                    {
                        error = $"Condition node {node.NodeId} is missing a valid checkKey.";
                        currentNodeId = string.Empty;
                        break;
                    }

                    Variant actual = finalContext.ContainsKey(checkKey) ? finalContext[checkKey] : default;
                    Variant target = node.Parameters.ContainsKey("targetValue") ? node.Parameters["targetValue"] : default;
                    if (!TryEvaluateCondition(actual, target, comparison, out bool passes))
                    {
                        error = $"Condition node {node.NodeId} has an unsupported comparison or value type.";
                        currentNodeId = string.Empty;
                        break;
                    }
                    currentNodeId = passes
                        ? nextNodeId
                        : node.ConnectedNextNodes.Count > 1 ? node.ConnectedNextNodes[1] : string.Empty;
                    break;

                case "action":
                    string actionDescription = ReadString(node.Parameters, "actionDescription", node.Title);
                    finalOutcome = $"Acción ejecutada: {actionDescription}";
                    currentNodeId = nextNodeId;
                    break;

                case "event":
                    string eventDescription = ReadString(node.Parameters, "eventDescription", node.Title);
                    finalOutcome = $"Evento activado: {eventDescription}";
                    currentNodeId = nextNodeId;
                    break;

                case "modifier":
                    string key = ReadString(node.Parameters, "key");
                    Variant amountValue = node.Parameters.ContainsKey("amount") ? node.Parameters["amount"] : default;
                    Variant currentValue = !string.IsNullOrEmpty(key) && finalContext.ContainsKey(key) ? finalContext[key] : Variant.From(0);
                    if (string.IsNullOrEmpty(key) || !IsNumeric(amountValue) || !IsNumeric(currentValue))
                    {
                        error = $"Modifier node {node.NodeId} requires a numeric key and amount.";
                        currentNodeId = string.Empty;
                        break;
                    }
                    double amount = amountValue.AsDouble();
                    double modifiedValue = currentValue.AsDouble() + amount;
                    if (double.IsNaN(modifiedValue) || double.IsInfinity(modifiedValue))
                    {
                        error = $"Modifier node {node.NodeId} produced a non-finite value.";
                        currentNodeId = string.Empty;
                        break;
                    }
                    finalContext[key] = modifiedValue;
                    finalOutcome = $"Modificador aplicado: {key} {(amount >= 0 ? "+" : string.Empty)}{amount}.";
                    currentNodeId = nextNodeId;
                    break;
            }
        }

        return Evaluation(executedPath, finalOutcome, finalContext, error);
    }

    private static bool TryEvaluateCondition(Variant actual, Variant target, string comparison, out bool passes)
    {
        passes = false;
        if (comparison == "truthy")
        {
            passes = actual.VariantType switch
            {
                Variant.Type.Nil => false,
                Variant.Type.Bool => actual.AsBool(),
                Variant.Type.Int => actual.AsInt64() != 0,
                Variant.Type.Float => actual.AsDouble() != 0,
                Variant.Type.String => !string.IsNullOrEmpty(actual.AsString()),
                _ => true
            };
            return true;
        }
        if (comparison == "eq" || comparison == "neq")
        {
            bool equal = actual.Equals(target);
            passes = comparison == "eq" ? equal : !equal;
            return true;
        }
        if (!IsNumeric(actual) || !IsNumeric(target)) return false;

        double actualNumber = actual.AsDouble();
        double targetNumber = target.AsDouble();
        passes = comparison switch
        {
            "gt" => actualNumber > targetNumber,
            "gte" => actualNumber >= targetNumber,
            "lt" => actualNumber < targetNumber,
            "lte" => actualNumber <= targetNumber,
            _ => false
        };
        return comparison == "gt" || comparison == "gte" || comparison == "lt" || comparison == "lte";
    }

    private static bool IsNumeric(Variant value)
    {
        return value.VariantType == Variant.Type.Int || value.VariantType == Variant.Type.Float;
    }

    private static string ReadString(Godot.Collections.Dictionary dictionary, string key, string fallback = "")
    {
        if (!dictionary.ContainsKey(key)) return fallback;
        Variant value = dictionary[key];
        return value.VariantType == Variant.Type.String ? value.AsString() : fallback;
    }

    private static Godot.Collections.Dictionary Evaluation(
        Godot.Collections.Array<string> executedPath,
        string finalOutcome,
        Godot.Collections.Dictionary finalContext,
        string error)
    {
        return new Godot.Collections.Dictionary
        {
            ["executedPath"] = executedPath,
            ["finalOutcome"] = finalOutcome,
            ["finalContext"] = finalContext,
            ["error"] = error
        };
    }

    private sealed class BlueprintNodeData
    {
        public string NodeId { get; }
        public string NodeType { get; }
        public string Title { get; }
        public Godot.Collections.Dictionary Parameters { get; }
        public List<string> ConnectedNextNodes { get; }

        public BlueprintNodeData(string nodeId, string nodeType, string title, Godot.Collections.Dictionary parameters, List<string> connectedNextNodes)
        {
            NodeId = nodeId;
            NodeType = nodeType;
            Title = title;
            Parameters = parameters;
            ConnectedNextNodes = connectedNextNodes;
        }
    }
}