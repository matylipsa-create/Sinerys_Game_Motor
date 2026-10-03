using Godot;

public enum SentraCraftingResource : byte
{
    Scrap,
    Fiber,
    Crystal
}

public enum SentraCraftingRecipeId : byte
{
    Medkit,
    AmmoPack,
    AegisCell,
    PhaseCharge,
    Count
}

public enum SentraCraftedItem : byte
{
    Medkit,
    AmmoPack,
    AegisCell,
    PhaseCharge,
    Count
}

public partial class SentraCraftingBridge : Node
{
    [Signal]
    public delegate void InventoryChangedEventHandler(
        int itemId,
        bool isResource,
        int quantity);

    [Signal]
    public delegate void RecipeUnlockedEventHandler(int recipeId);

    [Signal]
    public delegate void ItemCraftedEventHandler(int recipeId, int itemId, int quantity);

    [Signal]
    public delegate void BenchTierChangedEventHandler(int tier);

    private readonly int[] _resources = new int[(int)SentraCraftingResource.Crystal + 1];
    private readonly int[] _craftedItems = new int[(int)SentraCraftedItem.Count];
    private int _benchTier = 1;
    private uint _unlockedRecipes = 1u << (int)SentraCraftingRecipeId.Medkit;

    public static SentraCraftingBridge Instance { get; private set; }

    public int BenchTier => _benchTier;

    public override void _EnterTree()
    {
        if (Instance != null && Instance != this)
        {
            GD.PushError("SentraCraftingBridge: only one instance may be active.");
            QueueFree();
            return;
        }

        Instance = this;
    }

    public override void _ExitTree()
    {
        if (Instance == this)
            Instance = null;
    }

    public int GetResourceCount(SentraCraftingResource resource)
    {
        int index = (int)resource;
        return IsResourceIndexValid(index) ? _resources[index] : 0;
    }

    public int GetCraftedItemCount(SentraCraftedItem item)
    {
        int index = (int)item;
        return IsItemIndexValid(index) ? _craftedItems[index] : 0;
    }

    public bool AddResource(SentraCraftingResource resource, int amount)
    {
        int index = (int)resource;
        if (!IsResourceIndexValid(index) || amount <= 0)
            return false;

        int added = Mathf.Min(amount, int.MaxValue - _resources[index]);
        if (added <= 0)
            return false;

        _resources[index] += added;
        EmitSignal(SignalName.InventoryChanged, index, true, _resources[index]);
        return true;
    }

    public bool RemoveResource(SentraCraftingResource resource, int amount)
    {
        int index = (int)resource;
        if (!IsResourceIndexValid(index) || amount <= 0 || _resources[index] < amount)
            return false;

        _resources[index] -= amount;
        EmitSignal(SignalName.InventoryChanged, index, true, _resources[index]);
        return true;
    }

    public bool IsRecipeUnlocked(SentraCraftingRecipeId recipeId)
    {
        int index = (int)recipeId;
        return IsRecipeIndexValid(index) && (_unlockedRecipes & (1u << index)) != 0;
    }

    public bool UnlockRecipe(SentraCraftingRecipeId recipeId)
    {
        int index = (int)recipeId;
        if (!TryGetRecipe(index, out RecipeDefinition recipe)
            || _benchTier < recipe.RequiredTier)
            return false;

        uint recipeBit = 1u << index;
        if ((_unlockedRecipes & recipeBit) != 0)
            return false;

        _unlockedRecipes |= recipeBit;
        EmitSignal(SignalName.RecipeUnlocked, index);
        return true;
    }

    public bool TryUpgradeBench()
    {
        if (_benchTier >= 3)
            return false;

        int scrapCost = _benchTier == 1 ? 10 : 20;
        int crystalCost = _benchTier == 1 ? 2 : 8;
        int scrapIndex = (int)SentraCraftingResource.Scrap;
        int crystalIndex = (int)SentraCraftingResource.Crystal;
        if (_resources[scrapIndex] < scrapCost || _resources[crystalIndex] < crystalCost)
            return false;

        _resources[scrapIndex] -= scrapCost;
        _resources[crystalIndex] -= crystalCost;
        _benchTier++;
        EmitSignal(SignalName.InventoryChanged, scrapIndex, true, _resources[scrapIndex]);
        EmitSignal(SignalName.InventoryChanged, crystalIndex, true, _resources[crystalIndex]);
        EmitSignal(SignalName.BenchTierChanged, _benchTier);
        return true;
    }

    public bool TryCraft(SentraCraftingRecipeId recipeId, int quantity = 1)
    {
        int recipeIndex = (int)recipeId;
        if (quantity <= 0
            || !IsRecipeUnlocked(recipeId)
            || !TryGetRecipe(recipeIndex, out RecipeDefinition recipe)
            || _benchTier < recipe.RequiredTier
            || quantity > int.MaxValue / recipe.OutputCount)
            return false;

        int outputCount = recipe.OutputCount * quantity;
        int outputIndex = (int)recipe.Output;
        if ((long)_craftedItems[outputIndex] + outputCount > int.MaxValue)
            return false;

        if (!HasIngredients(recipe, quantity))
            return false;

        ConsumeIngredient(recipe.ResourceA, recipe.CostA * quantity);
        ConsumeIngredient(recipe.ResourceB, recipe.CostB * quantity);
        if (recipe.CostC > 0)
            ConsumeIngredient(recipe.ResourceC, recipe.CostC * quantity);

        _craftedItems[outputIndex] += outputCount;
        EmitResourceInventoryChanged(recipe.ResourceA);
        EmitResourceInventoryChanged(recipe.ResourceB);
        if (recipe.CostC > 0)
            EmitResourceInventoryChanged(recipe.ResourceC);
        EmitSignal(SignalName.InventoryChanged, outputIndex, false, _craftedItems[outputIndex]);
        EmitSignal(SignalName.ItemCrafted, recipeIndex, outputIndex, outputCount);
        return true;
    }

    private bool HasIngredients(RecipeDefinition recipe, int quantity)
    {
        if ((long)recipe.CostA * quantity > _resources[(int)recipe.ResourceA]
            || (long)recipe.CostB * quantity > _resources[(int)recipe.ResourceB])
            return false;

        return recipe.CostC == 0
            || (long)recipe.CostC * quantity <= _resources[(int)recipe.ResourceC];
    }

    private void ConsumeIngredient(SentraCraftingResource resource, int amount)
    {
        int index = (int)resource;
        _resources[index] -= amount;
    }

    private void EmitResourceInventoryChanged(SentraCraftingResource resource)
    {
        int index = (int)resource;
        EmitSignal(SignalName.InventoryChanged, index, true, _resources[index]);
    }

    private static bool TryGetRecipe(int index, out RecipeDefinition recipe)
    {
        switch ((SentraCraftingRecipeId)index)
        {
            case SentraCraftingRecipeId.Medkit:
                recipe = new RecipeDefinition(
                    SentraCraftedItem.Medkit, 1, 1,
                    SentraCraftingResource.Scrap, 2,
                    SentraCraftingResource.Fiber, 3);
                return true;
            case SentraCraftingRecipeId.AmmoPack:
                recipe = new RecipeDefinition(
                    SentraCraftedItem.AmmoPack, 1, 1,
                    SentraCraftingResource.Scrap, 3,
                    SentraCraftingResource.Crystal, 1);
                return true;
            case SentraCraftingRecipeId.AegisCell:
                recipe = new RecipeDefinition(
                    SentraCraftedItem.AegisCell, 2, 2,
                    SentraCraftingResource.Scrap, 4,
                    SentraCraftingResource.Crystal, 3,
                    SentraCraftingResource.Fiber, 2);
                return true;
            case SentraCraftingRecipeId.PhaseCharge:
                recipe = new RecipeDefinition(
                    SentraCraftedItem.PhaseCharge, 3, 3,
                    SentraCraftingResource.Scrap, 6,
                    SentraCraftingResource.Crystal, 5,
                    SentraCraftingResource.Fiber, 4);
                return true;
            default:
                recipe = default;
                return false;
        }
    }

    private static bool IsResourceIndexValid(int index)
    {
        return index >= 0 && index < (int)SentraCraftingResource.Crystal + 1;
    }

    private static bool IsItemIndexValid(int index)
    {
        return index >= 0 && index < (int)SentraCraftedItem.Count;
    }

    private static bool IsRecipeIndexValid(int index)
    {
        return index >= 0 && index < (int)SentraCraftingRecipeId.Count;
    }

    private readonly struct RecipeDefinition
    {
        public readonly SentraCraftedItem Output;
        public readonly int OutputCount;
        public readonly int RequiredTier;
        public readonly SentraCraftingResource ResourceA;
        public readonly int CostA;
        public readonly SentraCraftingResource ResourceB;
        public readonly int CostB;
        public readonly SentraCraftingResource ResourceC;
        public readonly int CostC;

        public RecipeDefinition(
            SentraCraftedItem output,
            int outputCount,
            int requiredTier,
            SentraCraftingResource resourceA,
            int costA,
            SentraCraftingResource resourceB,
            int costB,
            SentraCraftingResource resourceC = SentraCraftingResource.Scrap,
            int costC = 0)
        {
            Output = output;
            OutputCount = outputCount;
            RequiredTier = requiredTier;
            ResourceA = resourceA;
            CostA = costA;
            ResourceB = resourceB;
            CostB = costB;
            ResourceC = resourceC;
            CostC = costC;
        }
    }
}
