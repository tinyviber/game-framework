import roomSpecs from './rooms.json';
import {
  createAdventureCatalog,
  type AdventureCatalog,
  type AdventureRoomSpec,
} from '@/world/adventure';

const specs = roomSpecs as unknown as readonly AdventureRoomSpec[];

export const adventureCatalog: AdventureCatalog = createAdventureCatalog(specs);

export const adventureRoomCount = adventureCatalog.roomList.length;
