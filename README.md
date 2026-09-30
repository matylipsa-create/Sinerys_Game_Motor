# Conquer-of_Darkness
# Conquer of Darkness

**Motor de orquestacion gaming construido sobre Sentra Core.**

Conquer of Darkness es la linea gaming de Sentra: una base para coordinar sistemas de juego, agentes inteligentes y experiencias adaptativas, con ejecucion local y control del usuario.

## Enfoque

- Orquestacion de agentes y sistemas de juego con decisiones trazables.
- Adaptacion a recursos y estado de la sesion para mantener una experiencia fluida.
- Integracion modular de voz, vision, sensores y accesibilidad cuando el juego los necesite.
- Arquitectura offline-first para que las funciones locales no dependan de servicios remotos.

## Estado

Este repositorio contiene la base de Sentra Core adaptada como plataforma gaming. La capa especifica de runtime de juego esta en desarrollo: este proyecto aun no incluye un motor de renderizado 3D, simulacion fisica ni networking multijugador.

## Desarrollo

Requiere Node.js y npm.

```bash
npm ci
npm run dev
```

Build y verificacion de tipos:

```bash
npm run build
npm run typecheck
```

## Base tecnologica

La aplicacion web usa React, TypeScript y Vite. Los modulos de Sentra Core aportan orquestacion, percepcion, audio, adaptacion y accesibilidad; las integraciones concretas de gameplay se incorporaran como sistemas y plugins de esta plataforma.
