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
