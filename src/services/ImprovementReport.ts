export type ImprovementFormat = 'json' | 'csv';

export interface MejoraItem {
  categoria: string;
  descripcion: string;
  accionSugerida: string;
  prioridad: 'Alta' | 'Media' | 'Baja';
}

export interface ReporteMejorasPayload {
  modulo: string;
  version: string;
  timestamp: string;
  recomendaciones: MejoraItem[];
}

export const generarInformeMejoras = (): ReporteMejorasPayload => ({
  modulo: 'Conquer of Darkness',
  version: '0.4.0',
  timestamp: new Date().toISOString(),
  recomendaciones: [
    {
      categoria: 'Gameplay',
      descripcion: 'La arena y las crisis estratégicas todavía usan progresión local de demostración.',
      accionSugerida: 'Conectar las acciones de arena con una sesión de juego y objetivos persistentes.',
      prioridad: 'Media',
    },
    {
      categoria: 'Rendimiento',
      descripcion: 'El tamaño y la latencia de los módulos de IA afectan el presupuesto de cada frame.',
      accionSugerida: 'Medir FPS e inferencia durante combates y cargar modelos solo cuando se necesiten.',
      prioridad: 'Alta',
    },
    {
      categoria: 'Registro de sesión',
      descripcion: 'Las decisiones del refugio aún no tienen una línea temporal exportable de la partida.',
      accionSugerida: 'Añadir exportación JSON/CSV para revisar crisis, costes y cambios del mundo.',
      prioridad: 'Alta',
    },
  ],
});

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function downloadImprovementReport(format: ImprovementFormat): void {
  const report = generarInformeMejoras();
  const content = format === 'json'
    ? JSON.stringify(report, null, 2)
    : [
      ['categoria', 'descripcion', 'accionSugerida', 'prioridad'],
      ...report.recomendaciones.map(({ categoria, descripcion, accionSugerida, prioridad }) => [
        categoria,
        descripcion,
        accionSugerida,
        prioridad,
      ]),
    ].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

  const blob = new Blob([content], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sentra-reporte-mejoras-${Date.now()}.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}