# Sinerys Game Motor

Motor de juego híbrido construido con **Godot 4.x** + **.NET 8 (C#)**.

## Sistemas

- **Mapa de Campaña estilo FFT** — Mapa global con nodos conectados, desbloqueo progresivo
- **Combate estilo Serious Sam** — Portales que generan hordas, sistema de oleadas
- **Vehículos / Bonus Stages** — Etapas de conducción y Gummy Ship
- **Pipeline JSON bidireccional** — 30 misiones sincronizadas via `data/json/campaign.json`

## Estructura

```
Sinerys_Game_Motor/
├── scripts/
│   ├── Core/          # GlobalManager, SceneTransitionManager, JSONSyncManager
│   ├── Campaign/      # CampaignManager, CampaignMapView (mapa FFT)
│   ├── Combat/        # CombatManager, PortalSpawner, EnemyEntity, PlayerController
│   ├── Vehicles/      # VehicleManager, BonusStageController, GummyShipController
│   └── UI/            # MainMenuController
├── scenes/
│   ├── UI/            # MainMenu.tscn
│   ├── Levels/        # CampaignMap.tscn, CombatLevel.tscn
│   └── Vehicles/      # BonusStage.tscn, GummyShip.tscn
├── data/
│   ├── json/          # campaign.json (30 misiones)
│   └── configs/       # game_config.json, bosses.json
├── project.godot
├── CanYouSurvive.csproj
├── CanYouSurvive.sln
└── icon.svg
```

## Namespace

- **Sinerys.Vision.Core** — Sistemas centrales
- **Sinerys.Vision.Campaign** — Mapa y progresión
- **Sinerys.Vision.Combat** — Combate y enemigos
- **Sinerys.Vision.Vehicles** — Vehículos y bonus stages
- **Sinerys.Vision.UI** — Interfaz

## Configuración

1. Abrir el proyecto en **Godot 4.3+** con soporte .NET
2. Compilar la solución C# (`CanYouSurvive.sln`)
3. Ejecutar desde el editor

## Campaña

30 misiones distribuidas en:
- 5 jefes (Misiones 6, 14, 20, 26, 29)
- 4 bonus stages de vehículo
- 3 misiones Gummy Ship
- 18 misiones de combate/story
