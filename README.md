# Sinerys Perception Motor (Sinerys Game Motor)

<div align="center">
  <img src="https://raw.githubusercontent.com/matylipsa-create/Sinerys_Game_Motor/main/public/favicon.svg" alt="Sinerys Logo" width="140" />
  <h3>Sistema de percepción agnóstico • SDK para motores (Unreal / Godot)</h3>
  <p>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-68%25-3178C6?logo=typescript&logoColor=white" />
    <img alt="C#" src="https://img.shields.io/badge/C%23-15%25-239120?logo=c-sharp&logoColor=white" />
    <img alt="C++" src="https://img.shields.io/badge/C%2B%2B-3%25-00599C?logo=c%2B%2B&logoColor=white" />
    <img alt="License" src="https://img.shields.io/badge/License-Open%20Source-green" />
  </p>
</div>

```text
   _____ _         _                  ____                      _
  / ____| |       (_)                |  _ \                    | |
 | (___ | |__  ___ _  ___  _ __ ___  | |_) | ___  _   _   _ __ | |_
  \___ \| '_ \/ __| |/ _ \| '_ ` _ \ |  _ < / _ \| | | | | '_ \| __|
  ____) | | | \__ \ | (_) | | | | | || |_) | (_) | |_| |_| | | | |_
 |_____/|_| |_|___/_|\___/|_| |_| |_||____/ \___/ \__,_(_) |_|\__|
```

Resumen

Sinerys Perception Motor es un motor de percepción y procesamiento sensorial diseñado para integrarse como un SDK en motores y runtimes (Unreal Engine, Godot u otros). Su objetivo es ofrecer una capa agnóstica que procese datos de sensores, realice fusión sensorial, detección de eventos y entregue una API clara para que proyectos de interacción, VR/AR, robotics o entornos de juego puedan consumir resultados en tiempo real.

Principales ideas de diseño

- Agnóstico respecto al motor: núcleos en C/C++ con bindings en C# y capas de integración para Unreal/Godot.
- Enfoque en baja latencia y precisión en la detección/percepción.
- Pipeline modular: adquisición → preprocesado → inferencia/detección → publicación de eventos.
- Herramientas auxiliares en TypeScript/Node.js para procesamiento offline, dashboards y telemetría.

Características principales

- Núcleo en C/C++ optimizado para rendimiento.
- Bindings y wrappers en C# para integración con runtimes que usan .NET/Mono.
- Soporte de integración experimental con Godot (GDNative / GDExtension) y plantillas para Unreal (plugin C++).
- Módulos de fusión sensorial y detección de eventos configurables.
- Canal de telemetría y backend opcional para almacenar eventos y métricas (server/).
- Panel de control / visualizador (frontend/) para monitorización y ajuste de parámetros.
- Ejemplos y prototipos en godot/ para validar integración y comportamiento.

Estructura del repositorio

```text
Sinerys_Game_Motor/
├── .github/              # Workflows y config
├── docs/                 # Documentación técnica e integración
├── firmware/             # Drivers y firmware para sensores (si aplica)
├── frontend/             # Dashboard / herramientas web (TypeScript)
├── godot/                # Ejemplos y bindings para Godot (prototipos)
├── server/               # Backend opcional para telemetría y APIs
├── sinerys_game_motor/   # Código fuente del motor (C/C++ core / bindings)
├── src/                  # Librerías y utilidades (TypeScript / shared)
├── tests/                # Tests y validaciones
├── ARCHITECTURE.md       # Documentación de arquitectura
├── README.md             # Este archivo
└── package.json          # Scripts e integración para herramientas
```

Soportes e integraciones

- Unreal Engine: plugin C++ (puede usar el core en C++ para enlazar, exponer una API que publique eventos a Blueprints/C++).
- Godot: integración por GDExtension / GDNative (bindings a C++ o adaptadores en GDScript) — ver carpeta godot/.
- Node.js / TypeScript: herramientas de ingestión, visualización y pruebas (frontend/ y src/).
- Microcontroladores / sensores: firmware/ contiene ejemplos y utilidades para adquisición de datos.

Quickstart — integración básica

Unreal (resumen):
1. Compila el core C++ como una librería estática o dinámica para la plataforma target.
2. Crea un plugin de Unreal que enlace con la librería y exponga una clase manager: USinerysPerceptionManager.
3. Desde Blueprints o C++ suscríbete a los eventos de percepción publicados por el manager.

Godot (resumen):
1. Compila la extensión GDExtension/GDNative enlazando con el core C++.
2. Publica un objeto `SinerysPerception` con señales para eventos detectados.
3. Usa el ejemplo en godot/ como plantilla para arrancar.

Node / Herramientas CLI (local):

```bash
# instalar dependencias para herramientas y frontend
npm install
# arrancar dashboard y herramientas
npm run dev
```

Construcción y tests

- Compilar el core C++: revisa sinerys_game_motor/README (o docs/) para instrucciones por plataforma.
- Bindings C#: revisar proyectos en `sinerys_game_motor/bindings_cs/` o `src/bindings-csharp/` si existen.
- Testeo: `npm run test` para pruebas JS/TS; tests de integridad para el core en tests/.

API (visión general)

Exponeré aquí una vista de alto nivel — revisa las definiciones en el código para detalles concretos:

- PerceptionCore
  - init(config)
  - start()
  - stop()
  - registerHandler(callback/event)
  - setParameters(params)

- Event
  - timestamp
  - type (e.g., "object_detected", "proximity", "gesture")
  - payload (posición, confidence, metadata)

Buenas prácticas para integración

- Mantener el núcleo en C/C++ compacto y estable; exponer API mínima y estable.
- Implementar adaptadores por motor: plugin de Unreal y GDExtension para Godot.
- Validar latencia y throughput en escenario real con sensores.
- Añadir capas de seguridad y autenticación si se hace telemetría remota.

Documentación y ejemplos

- docs/ — guía de integración, descripción del pipeline y formatos de eventos.
- godot/ — ejemplo de cliente/plantilla para Godot.
- frontend/ — dashboard para ver eventos en tiempo real y ajustar parámetros.

Estado y roadmap sugerido

- Estado actual: base técnica con múltiples componentes (core, bindings, herramientas). Funcionalidades de percepción implementadas como módulos, con ejemplos experimentales.
- Próximos pasos recomendados:
  1. Documentar el ABI/C API del core y publicar ejemplos de compilación por plataforma.
  2. Completar y documentar el plugin de Unreal (ejemplo mínimo que genere eventos en el Editor).
  3. Consolidar GDExtension para Godot con empaquetado simple.
  4. Añadir tests de integración de extremo a extremo y demos reproducibles.

Contribuir

Gracias por tu interés en contribuir. Para colaborar:

1. Haz fork del repositorio
2. Crea una rama descriptiva (feature/perception-xyz)
3. Añade tests y documentación para cambios
4. Abre un PR con descripción y screenshots / logs si aplican

Licencia

Este proyecto es de código abierto. Indica en LICENSE la licencia que uses (ej. MIT, Apache-2.0).

Contacto

- GitHub: https://github.com/matylipsa-create
- Repo: https://github.com/matylipsa-create/Sinerys_Game_Motor

---

He actualizado el README para reflejar que este proyecto es un motor de percepción agnóstico pensado para integrarse como SDK en Unreal, Godot y otros runtimes. Si querés, puedo:

- Añadir secciones concretas con comandos de compilación por plataforma.
- Crear archivos en docs/ con guías paso a paso para Unreal y Godot.
- Generar ejemplos mínimos de plugin para Unreal (esqueleto) y GDExtension para Godot y subirlos a godot/ y sinerys_game_motor/bindings/.
