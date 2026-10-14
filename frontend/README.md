# Frontend README

This folder contains the front-end tooling and monitoring experience for the Sinerys Perception Motor project.

## Purpose

The frontend is intended to provide a visual layer for:

- observing engine and runtime events
- monitoring perception output
- debugging sensor data and system state
- checking service health and telemetry
- validating integration behavior during development

## Project type

This frontend is a web-oriented dashboard and debug interface, not a standalone game client.

## Local development

```bash
cd frontend
npm install
npm run dev
```

For a production-like build:

```bash
npm run build
```

## Typical responsibilities

- render live event data
- visualize perception activity
- expose service status
- support debugging of integration adapters
- facilitate telemetry inspection

## Notes

The frontend should remain decoupled from any single engine implementation. Its role is to provide observability and debug tooling around the perception core and integration layer.
