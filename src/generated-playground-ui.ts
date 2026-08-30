export interface GeneratedInspectionFacts {
  readonly x: number;
  readonly y: number;
  readonly terrainType: string;
  readonly regionId: string;
  readonly biome: string;
  readonly weather: string;
  readonly lighting: string;
  readonly elevation: number;
  readonly traversableDirections: readonly string[];
}

export function isGeneratedDebugMode(search: string): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

export function formatBlockedMovement(): string {
  return 'MOVEMENT BLOCKED';
}

export function formatGeneratedInspection(facts: GeneratedInspectionFacts): string {
  const exits = facts.traversableDirections.length > 0
    ? facts.traversableDirections.join(', ')
    : 'none';
  return [
    `CELL ${facts.x},${facts.y}`,
    `TERRAIN ${facts.terrainType}`,
    `REGION ${facts.regionId}`,
    `BIOME ${facts.biome}`,
    `WEATHER ${facts.weather}`,
    `LIGHTING ${facts.lighting}`,
    `ELEVATION ${facts.elevation}`,
    `OPEN ${exits}`,
  ].join(' · ');
}
