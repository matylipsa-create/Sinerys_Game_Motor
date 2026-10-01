export interface Faction {
  id: string;
  name: string;
  influence: number;
  aggression: number;
}

export class FactionSystemManager {
  public factions: Faction[] = [
    { id: 'f_hive', name: 'Colmena Fúngica', influence: 0.4, aggression: 0.8 },
    { id: 'f_remnants', name: 'Remanentes del Refugio', influence: 0.4, aggression: 0.3 },
    { id: 'f_drift', name: 'Nómadas de la Deriva', influence: 0.2, aggression: 0.5 },
  ];

  public evaluatePowerCrisis(): string | null {
    const dominant = this.factions.reduce<Faction | undefined>(
      (current, faction) => !current || faction.influence > current.influence ? faction : current,
      undefined,
    );
    if (dominant && dominant.influence > 0.65) {
      return `CRISIS DE PODER: Hegemonía absoluta detectada -> ${dominant.name}`;
    }
    return null;
  }
}