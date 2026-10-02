export type MantisVulnerability = 'THERMAL' | 'UV' | 'CHROMA';
export type CrisisSeverity = 'LOW' | 'CRITICAL' | 'OMEGA';

export interface MobBehaviorDNA {
  mobTypeId: string;
  aggressionLevel: number;
  mutationResistance: number;
  mantisVulnerability: MantisVulnerability;
}

export interface FactionCrisis {
  crisisId: string;
  title: string;
  description: string;
  severity: CrisisSeverity;
  resolved: boolean;
}

export interface FactionEvent {
  faction: string;
  description: string;
}

const FACTIONS: FactionEvent[] = [
  { faction: 'ASHEN COLLECTIVE', description: 'Territorial activity detected near the Shelter.' },
  { faction: 'VERDIGRIS SYNDICATE', description: 'Unlicensed biomass extraction reported in the lower decks.' },
  { faction: 'PALE SIGNAL', description: 'An unknown transmission is altering local navigation beacons.' },
];

function isCrisis(value: unknown): value is FactionCrisis {
  if (!value || typeof value !== 'object') return false;
  const crisis = value as Partial<FactionCrisis>;
  return typeof crisis.crisisId === 'string'
    && typeof crisis.title === 'string'
    && typeof crisis.description === 'string'
    && ['LOW', 'CRITICAL', 'OMEGA'].includes(crisis.severity as string)
    && typeof crisis.resolved === 'boolean';
}

export class BehaviorDNAEngine {
  private currentCrises: FactionCrisis[];

  constructor(crises: FactionCrisis[] = []) {
    this.currentCrises = crises.filter(isCrisis).map((crisis) => ({ ...crisis }));
  }

  public evolveMobsForTier(realityTier: number): MobBehaviorDNA[] {
    const tier = Number.isFinite(realityTier) ? Math.max(0, realityTier) : 0;
    const baseMultiplier = 1.0 + (tier * 0.25);
    return [
      {
        mobTypeId: 'BIOMASS_STALKER',
        aggressionLevel: 1.2 * baseMultiplier,
        mutationResistance: 0.4,
        mantisVulnerability: 'THERMAL',
      },
      {
        mobTypeId: 'INDUSTRIAL_AUTOMATON',
        aggressionLevel: 0.8 * baseMultiplier,
        mutationResistance: 0.9,
        mantisVulnerability: 'CHROMA',
      },
    ];
  }

  public evaluateCrisisTrigger(shelterVisits: number, realityTier = 0): FactionCrisis | null {
    if (!Number.isInteger(shelterVisits) || shelterVisits <= 0 || shelterVisits % 2 !== 0) return null;
    const omegaTriggered = realityTier >= 4 && Math.random() < 0.15;
    const crisis: FactionCrisis = {
      crisisId: `crisis_${Date.now()}_${this.currentCrises.length}`,
      title: omegaTriggered ? 'Omega Breach: Hull Memory Collapse' : 'Containment Breach in Sector B',
      description: omegaTriggered
        ? 'The ship has begun rewriting its own internal geometry.'
        : 'Reconfigured biomass has blocked the main ventilation ducts.',
      severity: omegaTriggered ? 'OMEGA' : shelterVisits % 4 === 0 ? 'CRITICAL' : 'LOW',
      resolved: false,
    };
    this.currentCrises = [crisis, ...this.currentCrises];
    return { ...crisis };
  }

  public createCrisis(title: string, description: string, severity: CrisisSeverity = 'LOW'): FactionCrisis {
    const crisis: FactionCrisis = {
      crisisId: `crisis_${Date.now()}_${this.currentCrises.length}`,
      title,
      description,
      severity,
      resolved: false,
    };
    this.currentCrises = [crisis, ...this.currentCrises];
    return { ...crisis };
  }

  public evaluateFactionEvent(): FactionEvent {
    const faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
    return { ...faction };
  }

  public addCrisis(crisis: FactionCrisis): void {
    if (isCrisis(crisis) && !this.currentCrises.some((item) => item.crisisId === crisis.crisisId)) {
      this.currentCrises = [{ ...crisis }, ...this.currentCrises];
    }
  }

  public resolveCrisis(crisisId: string): boolean {
    const crisis = this.currentCrises.find((item) => item.crisisId === crisisId && !item.resolved);
    if (!crisis) return false;
    crisis.resolved = true;
    return true;
  }

  public getActiveCrises(): FactionCrisis[] {
    return this.currentCrises.filter((crisis) => !crisis.resolved).map((crisis) => ({ ...crisis }));
  }

  public getCrisisHistory(): FactionCrisis[] {
    return this.currentCrises.map((crisis) => ({ ...crisis }));
  }
}

export const dnaEngine = new BehaviorDNAEngine();