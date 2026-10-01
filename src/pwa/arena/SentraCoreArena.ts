export type ArenaMechanic = 'vacuum' | 'mutagen' | 'bash';

export interface ArenaState {
  roomName: string;
  hiveTension: number;
  shelterMorale: number;
  activeMobsCount: number;
  miniBossActive: boolean;
  enemyPanic: number;
  vacuumedTargets: number;
  weaponDamageMultiplier: number;
  mutagenApplied: boolean;
  completedMechanics: ArenaMechanic[];
  roomComplete: boolean;
}

export interface ArenaActionResult {
  state: ArenaState;
  message: string;
  success: boolean;
}

export class SentraCoreArenaManager {
  public static initializeBattleRoom(): ArenaState {
    return {
      roomName: 'Sector C-04: Cámara de Pruebas Mutagénicas',
      hiveTension: 30,
      shelterMorale: 75,
      activeMobsCount: 3,
      miniBossActive: false,
      enemyPanic: 0,
      vacuumedTargets: 0,
      weaponDamageMultiplier: 1,
      mutagenApplied: false,
      completedMechanics: [],
      roomComplete: false,
    };
  }

  public static triggerMechanicTutorial(mechanic: ArenaMechanic): string {
    switch (mechanic) {
      case 'vacuum':
        return 'TUTORIAL [1/3]: Usa el Tentáculo de Succión para atrapar escombros o enemigos livianos y usarlos como proyectiles cinéticos.';
      case 'mutagen':
        return 'TUTORIAL [2/3]: Inyecta Suero de Esporas en tu módulo de arma para mutar sus atributos y obtener pasivas de dreno de entropía.';
      case 'bash':
        return 'TUTORIAL [3/3]: Ejecuta un Bash contra el entorno para romper formaciones enemigas y elevar el pánico en el BehaviorDNA.';
    }
  }

  public static performMechanic(state: ArenaState, mechanic: ArenaMechanic): ArenaActionResult {
    const nextState = { ...state, completedMechanics: [...state.completedMechanics] };
    if (state.roomComplete) {
      return { state: nextState, message: 'Cámara despejada. Reinicia el protocolo para repetir el entrenamiento.', success: false };
    }

    if (mechanic === 'mutagen') {
      if (state.mutagenApplied) {
        return { state: nextState, message: 'El módulo ya tiene una cepa activa. Conserva el suero para otra incursión.', success: false };
      }
      nextState.mutagenApplied = true;
      nextState.weaponDamageMultiplier = 1.15;
      if (!nextState.completedMechanics.includes(mechanic)) nextState.completedMechanics.push(mechanic);
      return {
        state: nextState,
        message: 'Cepas sincronizadas. El módulo de arma recibe +15% de daño de práctica.',
        success: true,
      };
    }

    if (state.miniBossActive) {
      return { state: nextState, message: 'El miniboss bloquea la formación. Cierra la distancia con un Bash.', success: false };
    }
    if (state.activeMobsCount === 0) {
      return { state: nextState, message: 'No quedan objetivos menores en la cámara.', success: false };
    }

    if (mechanic === 'vacuum') {
      nextState.activeMobsCount -= 1;
      nextState.vacuumedTargets += 1;
    } else {
      nextState.activeMobsCount = Math.max(0, state.activeMobsCount - 2);
      nextState.enemyPanic = Math.min(100, state.enemyPanic + 35);
      nextState.hiveTension = Math.max(0, state.hiveTension - 5);
    }

    if (!nextState.completedMechanics.includes(mechanic)) nextState.completedMechanics.push(mechanic);
    if (nextState.activeMobsCount === 0) {
      nextState.miniBossActive = true;
      return {
        state: nextState,
        message: mechanic === 'vacuum'
          ? 'Objetivo contenido. La cámara detecta movimiento pesado: un miniboss entra en el sector.'
          : 'Formación rota. La cámara detecta movimiento pesado: un miniboss entra en el sector.',
        success: true,
      };
    }

    return {
      state: nextState,
      message: mechanic === 'vacuum'
        ? 'Objetivo succionado y proyectado. Un enemigo menos en la cámara.'
        : 'Bash ejecutado. Formación rota, pánico elevado y dos objetivos neutralizados.',
      success: true,
    };
  }

  public static defeatMiniBoss(state: ArenaState): ArenaActionResult {
    const nextState = { ...state, completedMechanics: [...state.completedMechanics] };
    if (!state.miniBossActive) {
      return { state: nextState, message: 'No hay señales de miniboss en este sector.', success: false };
    }

    nextState.miniBossActive = false;
    nextState.roomComplete = true;
    nextState.shelterMorale = Math.min(100, state.shelterMorale + 8);
    nextState.hiveTension = Math.max(0, state.hiveTension - 12);
    return {
      state: nextState,
      message: 'Miniboss neutralizado. Simulación local cerrada; la moral del refugio aumenta.',
      success: true,
    };
  }
}