# Sinerys Perception Motor

<div align="center">
  <img src="https://raw.githubusercontent.com/matylipsa-create/Sinerys_Game_Motor/main/public/favicon.svg" alt="Sinerys Logo" width="140" />
  <h3>Perception middleware y SDK agnóstico para Unreal, Godot y runtimes</h3>
  <p>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-68%25-3178C6?logo=typescript&logoColor=white" />
    <img alt="C#" src="https://img.shields.io/badge/C%23-15%25-239120?logo=c-sharp&logoColor=white" />
    <img alt="C++" src="https://img.shields.io/badge/C%2B%2B-3%25-00599C?logo=c%2B%2B&logoColor=white" />
    <img alt="Open Source" src="https://img.shields.io/badge/License-Open%20Source-green" />
  </p>
</div>

Sinerys Perception Motor es una capa modular orientada a percepción, detección de eventos, orquestación sensorial e integración con runtimes interactivos.

Este repositorio no está pensado como un motor de juegos standalone. Su propósito es funcionar como SDK y middleware de percepción que puede integrarse en Unreal, Godot y otros motores o runtimes.

## Propósito

El proyecto busca ofrecer una arquitectura reutilizable para:

- adquisición de datos sensoriales
- pipelines de percepción
- interpretación de eventos
- enrutamiento de señales en tiempo real
- integración con UI, backend y capas de simulación
- orquestación agnóstica para sistemas interactivos

## Idea central

El sistema se organiza en un flujo simple:

```text
Sensores / Entradas
      ↓
Capa de Adquisición
      ↓
Perception Core
      ↓
Enrutamiento de Eventos / Capa de Decisión
      ↓
Integración con Motor / Runtime
```

Esto convierte al proyecto en una base reutilizable de percepción y orquestación, en lugar de un proyecto de juego único y cerrado.

## Estructura del repositorio

```text
Sinerys_Game_Motor/
├── .github/                 # Workflows y automatización de GitHub
├── docs/                    # documentación técnica y guías de integración
├── firmware/                # utilidades relacionadas con firmware y sensores
├── frontend/                # dashboard web y herramientas de monitoreo
├── godot/                   # prototipos e integración con Godot
├── server/                  # capa de servicios y APIs
├── sinerys_game_motor/      # núcleo principal del motor y SDK
├── src/                     # lógica compartida y utilidades TypeScript
├── tests/                   # pruebas y validación
├── ARCHITECTURE.md          # overview de arquitectura
├── README.md                # documentación principal
├── package.json             # scripts y dependencias del proyecto
├── vite.config.ts           # configuración de Vite
├── tsconfig.json            # configuración de TypeScript
├── tailwind.config.js       # configuración de Tailwind
├── index.html               # punto de entrada web
├── package-lock.json        # lockfile
├── public/                  # assets estáticos y branding
└── LICENSE                  # licencia del proyecto (si aplica)
```

## Qué es este proyecto

Este repositorio se entiende mejor como:

- un framework de percepción
- una capa de orquestación agnóstica
- un SDK middleware para motores y herramientas de simulación
- una base para construir sistemas interactivos orientados a eventos

## Qué no es

- no es un game engine completo
- no es un proyecto de juego único
- no es un producto final cerrado, sino una base reutilizable

## Objetivos de integración

El proyecto está pensado para soportar integraciones como:

- plugin o bridge para Unreal Engine
- extensión para Godot o adaptador a nivel de scripting
- dashboards web para monitoreo y telemetría
- servicios backend para procesamiento de eventos y orquestación

## Inicio rápido

Requisitos:

- Node.js 18+
- npm

```bash
npm install
npm run dev
```

Validación y build:

```bash
npm run typecheck
npm run build
```

## Modelo de desarrollo

El repositorio separa responsabilidades por capas:

- `src/`: lógica compartida y utilidades
- `frontend/`: paneles, dashboards y herramientas de visualización
- `server/`: APIs, manejo de eventos y servicios
- `godot/`: prototipos e integraciones experimentales
- `firmware/`: utilidades y componentes relacionados con sensores
- `docs/`: documentación técnica y de arquitectura

## Roadmap

Dirección prevista del proyecto:

1. estabilizar el core de percepción
2. definir adaptadores claros para Unreal/Godot
3. formalizar la API de eventos del runtime
4. mejorar herramientas de dashboard y debugging
5. documentar patrones de integración para proyectos reales

## Contribución

Las contribuciones son bienvenidas. Si querés colaborar:

1. hacer fork del repositorio
2. crear una rama de feature
3. documentar el cambio de manera clara
4. abrir un pull request con contexto y validación

## Licencia

Este proyecto es open source. Agregar el archivo de licencia correspondiente si aplica (por ejemplo MIT o Apache-2.0).

## Contacto

- GitHub: https://github.com/matylipsa-create
- Repositorio: https://github.com/matylipsa-create/Sinerys_Game_Motor

---

Esta documentación refleja la dirección actual del proyecto: una capa middleware orientada a percepción y SDK diseñado para integrarse con motores y runtimes interactivos.
