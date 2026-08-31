export interface GeneratedInspectionFacts {
  readonly x: number;
  readonly y: number;
  readonly terrainType: string;
  readonly regionId?: string;
  readonly biome: string;
  readonly weather: string;
  readonly lighting: string;
  readonly elevation: number;
  readonly traversableDirections?: readonly string[];
}

export type GeneratedViewMode = 'iso' | 'ortho';

export interface GeneratedWorldDescriptionFacts {
  readonly width: number;
  readonly height: number;
  readonly biome: string;
  readonly weather: string;
  readonly lighting: string;
  readonly topologyFamily: string;
  readonly disruptionCellCount: number;
}

const TOPOLOGY_NOTES: Readonly<Record<string, string>> = {
  'parallel-loop': 'Two routes braid around a patient loop',
  switchback: 'A switchback trail keeps its secrets in the bends',
  ring: 'The path remembers how to come back around',
  'hub-and-spoke': 'A crossroads sends every story outward',
  'two-region': 'Two regions meet at a pair of crossings',
};

export function formatGeneratedWorldDescription(
  facts: GeneratedWorldDescriptionFacts,
): string {
  const topologyNote = TOPOLOGY_NOTES[facts.topologyFamily]
    ?? 'A new path is waiting to be mapped';
  const anomalyLabel = `${facts.disruptionCellCount}-cell elevation anomaly`;
  return [
    `${facts.width}×${facts.height} ${facts.biome}`,
    `${facts.weather} · ${facts.lighting}`,
    topologyNote,
    anomalyLabel,
  ].join(' · ');
}

export function parseGeneratedView(search: string): GeneratedViewMode {
  return new URLSearchParams(search).get('view') === 'ortho' ? 'ortho' : 'iso';
}

export function isGeneratedDebugMode(search: string): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

export function formatBlockedMovement(): string {
  return 'MOVEMENT BLOCKED';
}

export function formatGeneratedInspection(
  facts: GeneratedInspectionFacts,
  debug = false,
): string {
  const localFacts = [
    `CELL ${facts.x},${facts.y}`,
    `TERRAIN ${facts.terrainType}`,
    `BIOME ${facts.biome}`,
    `WEATHER ${facts.weather}`,
    `LIGHTING ${facts.lighting}`,
    `ELEVATION ${facts.elevation}`,
  ];
  if (!debug) {
    return localFacts.join(' · ');
  }
  const exits = facts.traversableDirections && facts.traversableDirections.length > 0
    ? facts.traversableDirections.join(', ')
    : 'none';
  return [
    ...localFacts,
    `REGION ${facts.regionId ?? 'unknown'}`,
    `OPEN ${exits}`,
  ].join(' · ');
}
