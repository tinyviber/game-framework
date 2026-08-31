import { describe, expect, it } from 'vitest';
import {
  createDemoInventoryView,
  filterInventoryItems,
  inventoryUsage,
  type InventoryItemView,
} from './inventory-ui';

const items: readonly InventoryItemView[] = [
  {
    id: 'rope',
    name: 'Rope Bundle',
    kind: 'gear',
    description: 'A practical coil.',
    quantity: 1,
    rarity: 'common',
    accent: 0xe0b17a,
  },
  {
    id: 'berry',
    name: 'Healing Berry',
    kind: 'consumable',
    description: 'A bright berry.',
    quantity: 3,
    rarity: 'common',
    accent: 0xe17870,
  },
  {
    id: 'key',
    name: 'Starlight Key',
    kind: 'key',
    description: 'A small key.',
    quantity: 1,
    rarity: 'quest',
    accent: 0xf5c866,
  },
];

describe('inventory UI view helpers', () => {
  it('filters items by category while preserving source order', () => {
    expect(filterInventoryItems(items, 'all')).toEqual(items);
    expect(filterInventoryItems(items, 'consumable').map((item) => item.id)).toEqual(['berry']);
    expect(filterInventoryItems(items, 'key').map((item) => item.id)).toEqual(['key']);
  });

  it('reports occupied slots rather than summing stack quantities', () => {
    expect(inventoryUsage({
      items,
      capacity: 20,
      gold: 0,
      characterName: 'Tester',
      level: 1,
    })).toBe(3);
  });

  it('provides a usable Kenney-style demo kit without loaded textures', () => {
    const view = createDemoInventoryView();
    expect(view.items).toHaveLength(10);
    expect(view.items[0]?.name).toBe('Starlight Key');
    expect(view.items.every((item) => item.description.length > 0)).toBe(true);
  });
});
