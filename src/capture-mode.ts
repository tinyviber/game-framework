export interface AuthoredCaptureRequest {
  readonly enabled: boolean;
  readonly roomId?: string;
}

export function parseAuthoredCaptureRequest(search: string): AuthoredCaptureRequest {
  const params = new URLSearchParams(search);
  return {
    enabled: params.get('world') !== 'generated'
      && params.get('view') === 'iso'
      && params.get('capture') === '1',
    roomId: params.get('room') ?? undefined,
  };
}

export function findAuthoredCaptureRoom<T extends { readonly id: string }>(
  rooms: readonly T[],
  roomId: string | undefined,
): T | undefined {
  if (roomId === undefined) {
    return rooms[0];
  }
  return rooms.find((room) => room.id === roomId);
}
