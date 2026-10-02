# Conquer of Darkness

**Un prototipo de supervivencia sci-fi impulsado por Sentra Core Orchestrator.**

El refugio no sigue un guion. El mundo responde. Conquer of Darkness explora una colonia al borde del colapso, donde las decisiones del jugador alteran la moral, los recursos, las facciones y las condiciones de la siguiente crisis.

> Un mundo hostil. Un refugio que decide. Un orquestador que recuerda.

## Demo

La aplicacion web incluye una demo operativa de crisis estrategicas y paneles para explorar el motor:

- `/game` — centro de operaciones: resuelve crisis y observa sus efectos sobre el refugio.
- `/arena` — sala táctica PWA con tutorial de succión, mutágenos y Bash.
- `/core` — dashboard de Sentra Core y su estado multiversal.
- `/master-engine` — controles del motor maestro.

La portada en `/` conecta las superficies gaming y presenta el ciclo del orquestador. La cámara y la demo visual de Sentra Core Orchestrator no forman parte de esta PWA gaming.

## Sentra Core Orchestrator

El core conecta percepcion, decisiones y cambios persistentes del mundo. La base actual contiene sistemas de crisis estrategicas, deriva multiversal, memoria de civilizacion, facciones, comportamiento adaptativo y una capa de eventos para entidades de juego.

El proyecto es un prototipo de software: **todavia no incluye un runtime 3D completo, simulacion fisica, guardado durable multiplataforma ni networking multijugador**. La carpeta `godot/` contiene un controlador experimental; no forma parte del build web de Vite.

## Desarrollo local

Requiere Node.js y npm.

```bash
npm ci
npm run dev
```

Verificacion de tipos y build de produccion:

```bash
npm run typecheck
npm run build
```

## Mapa del repositorio

- `src/core/` — orquestador y sistemas de juego escritos en TypeScript.
- `src/components/` — portada, dashboards e interfaces de la aplicacion.
- `godot/` — prototipos de control para una futura integracion con Godot.
- `docs/` — arquitectura, perception y decisiones del proyecto.
- `server/` — servicios auxiliares y protocolos de Sentra.

## Direccion

Conquer of Darkness es la linea gaming de Sentra Core. El siguiente paso es convertir los sistemas adaptativos y las decisiones trazables en un runtime jugable mas amplio, manteniendo la ejecucion local, la accesibilidad y el control del jugador.