import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';

export const INVENTORY_VIEWPORT = {
  width: 960,
  height: 600,
} as const;

export const INVENTORY_CATEGORIES = [
  'all',
  'gear',
  'consumable',
  'key',
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export type InventoryItemKind = Exclude<InventoryCategory, 'all'>;
export type InventoryRarity = 'common' | 'uncommon' | 'rare' | 'quest';

export interface InventoryItemView {
  readonly id: string;
  readonly name: string;
  readonly kind: InventoryItemKind;
  readonly description: string;
  readonly quantity: number;
  readonly rarity: InventoryRarity;
  readonly accent: number;
  readonly icon?: Texture;
  readonly stats?: readonly (readonly [string, string])[];
}

export interface InventoryView {
  readonly items: readonly InventoryItemView[];
  readonly capacity: number;
  readonly gold: number;
  readonly characterName: string;
  readonly level: number;
}

export interface InventoryUi {
  render(view: InventoryView): void;
  setOpen(open: boolean): void;
  toggle(): void;
  isOpen(): boolean;
  destroy(): void;
}

export interface InventoryUiHooks {
  readonly onOpenChange?: (open: boolean) => void;
}

const COLORS = {
  ink: 0x14233a,
  inkSoft: 0x253957,
  panel: 0x20324d,
  panelLight: 0x2d4664,
  panelDark: 0x192a43,
  slot: 0x14253e,
  slotHover: 0x294866,
  slotSelected: 0x3c5f7d,
  parchment: 0xf7e7bd,
  parchmentMuted: 0xc6b88f,
  outline: 0x6d84a0,
  outlineDark: 0x0c1728,
  gold: 0xf5c866,
  green: 0x79d39b,
  white: 0xf6f3e8,
  muted: 0x95a9bd,
  red: 0xe17870,
} as const;

const RARITY_COLORS: Readonly<Record<InventoryRarity, number>> = {
  common: 0xb8c4ce,
  uncommon: 0x79d39b,
  rare: 0x70b8e8,
  quest: 0xf5c866,
};

const RARITY_LABELS: Readonly<Record<InventoryRarity, string>> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  quest: 'QUEST ITEM',
};

const CATEGORY_LABELS: Readonly<Record<InventoryCategory, string>> = {
  all: 'ALL',
  gear: 'GEAR',
  consumable: 'FOOD',
  key: 'KEY ITEMS',
};

const PANEL = {
  x: 64,
  y: 34,
  width: 832,
  height: 532,
};

const GRID = {
  x: 94,
  y: 174,
  columns: 5,
  rows: 4,
  slot: 68,
  gap: 8,
};

const DETAIL = {
  x: 550,
  y: 174,
  width: 314,
  height: 254,
};

function text(
  value: string,
  size: number,
  color: number,
  weight: 'normal' | 'bold' = 'normal',
): Text {
  return new Text({
    text: value,
    style: {
      fontFamily: 'monospace',
      fontSize: size,
      fontWeight: weight,
      fill: color,
      letterSpacing: size >= 13 ? 0.2 : 1.1,
    },
  });
}

function drawPixelBox(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number,
  outline: number = COLORS.outline,
  alpha = 1,
): void {
  graphics
    .rect(x + 4, y, width - 8, height)
    .rect(x, y + 4, width, height - 8)
    .fill({ color: fill, alpha });
  graphics
    .rect(x + 3, y + 3, width - 6, height - 6)
    .stroke({ color: outline, width: 2, alpha });
  graphics
    .rect(x + 7, y + 7, width - 14, 2)
    .fill({ color: 0xffffff, alpha: alpha * 0.1 });
}

function drawDivider(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
): void {
  graphics.rect(x, y, width, 2).fill({
    color: COLORS.outlineDark,
    alpha: 0.65,
  });
  graphics.rect(x + 4, y + 2, width - 8, 1).fill({
    color: COLORS.outline,
    alpha: 0.45,
  });
}

function fitText(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function filterInventoryItems(
  items: readonly InventoryItemView[],
  category: InventoryCategory,
): readonly InventoryItemView[] {
  if (category === 'all') {
    return items;
  }
  return items.filter((item) => item.kind === category);
}

export function inventoryUsage(view: InventoryView): number {
  return view.items.length;
}

function drawFallbackIcon(
  graphics: Graphics,
  kind: InventoryItemKind,
  accent: number,
): void {
  graphics.clear();
  graphics.rect(0, 0, 42, 42).fill({ color: accent, alpha: 0.12 });
  graphics.stroke({ color: accent, width: 2, alpha: 0.9 });

  if (kind === 'key') {
    graphics.circle(17, 18, 8).stroke({ color: accent, width: 3 });
    graphics.rect(23, 16, 14, 4).fill(accent);
    graphics.rect(31, 20, 3, 7).fill(accent);
  } else if (kind === 'consumable') {
    graphics.circle(21, 22, 12).fill({ color: accent, alpha: 0.9 });
    graphics.rect(18, 7, 6, 7).fill(accent);
    graphics.rect(24, 8, 7, 2).fill(COLORS.green);
  } else {
    graphics.rect(10, 11, 24, 24).fill({ color: accent, alpha: 0.85 });
    graphics.rect(14, 7, 16, 4).fill(accent);
    graphics.rect(14, 17, 16, 3).fill({ color: 0xffffff, alpha: 0.45 });
  }
}

function addIcon(
  parent: Container,
  item: InventoryItemView,
): void {
  if (item.icon) {
    const sprite = new Sprite(item.icon);
    sprite.x = 11;
    sprite.y = 7;
    sprite.width = 46;
    sprite.height = 46;
    sprite.alpha = 0.98;
    parent.addChild(sprite);
    return;
  }

  const fallback = new Graphics();
  fallback.x = 13;
  fallback.y = 13;
  drawFallbackIcon(fallback, item.kind, item.accent);
  parent.addChild(fallback);
}

interface InventorySlot {
  readonly root: Container;
  readonly background: Graphics;
  readonly icon: Container;
  readonly labelBackground: Graphics;
  readonly quantity: Text;
  readonly label: Text;
}

function createSlot(
  index: number,
  onSelect: (index: number) => void,
): InventorySlot {
  const root = new Container();
  root.x = GRID.x + (index % GRID.columns) * (GRID.slot + GRID.gap);
  root.y = GRID.y + Math.floor(index / GRID.columns) * (GRID.slot + GRID.gap);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.hitArea = new Rectangle(0, 0, GRID.slot, GRID.slot);
  root.on('pointertap', () => onSelect(index));

  const background = new Graphics();
  const icon = new Container();
  const labelBackground = new Graphics();
  const quantity = text('', 11, COLORS.parchment, 'bold');
  quantity.anchor.set(1, 1);
  quantity.x = GRID.slot - 7;
  quantity.y = GRID.slot - 7;
  const label = text('', 8, COLORS.muted);
  label.anchor.set(0.5, 0.5);
  label.x = GRID.slot / 2;
  label.y = GRID.slot - 8;

  root.addChild(background, icon, labelBackground, quantity, label);
  return { root, background, icon, labelBackground, quantity, label };
}

function createTab(
  category: InventoryCategory,
  index: number,
  onSelect: (category: InventoryCategory) => void,
): Container {
  const tab = new Container();
  tab.x = 94 + index * 92;
  tab.y = 118;
  tab.eventMode = 'static';
  tab.cursor = 'pointer';
  tab.hitArea = new Rectangle(0, 0, 84, 32);
  tab.on('pointertap', () => onSelect(category));

  const background = new Graphics();
  const label = text(CATEGORY_LABELS[category], 9, COLORS.muted, 'bold');
  label.x = 42;
  label.y = 9;
  label.anchor.set(0.5, 0.5);
  tab.addChild(background, label);
  tab.label = `InventoryTab:${category}`;
  return tab;
}

function drawBackpackMark(graphics: Graphics, x: number, y: number): void {
  graphics.rect(x + 7, y + 11, 28, 25).fill(COLORS.gold);
  graphics.rect(x + 12, y + 6, 18, 8).fill(COLORS.gold);
  graphics.rect(x + 4, y + 18, 6, 11).fill(COLORS.gold);
  graphics.rect(x + 32, y + 18, 6, 11).fill(COLORS.gold);
  graphics.rect(x + 13, y + 22, 16, 4).fill(COLORS.ink);
  graphics.rect(x + 17, y + 27, 8, 5).fill(COLORS.ink);
}

function drawCoin(graphics: Graphics, x: number, y: number): void {
  graphics.circle(x, y, 8).fill(COLORS.gold);
  graphics.circle(x, y, 5).stroke({ color: COLORS.ink, width: 2 });
}

export function createDemoInventoryView(
  icons: Readonly<Partial<Record<string, Texture>>> = {},
): InventoryView {
  const item = (
    id: string,
    name: string,
    kind: InventoryItemKind,
    description: string,
    quantity: number,
    rarity: InventoryRarity,
    accent: number,
    iconKey: string,
    stats?: readonly (readonly [string, string])[],
  ): InventoryItemView => ({
    id,
    name,
    kind,
    description,
    quantity,
    rarity,
    accent,
    icon: icons[iconKey],
    stats,
  });

  return {
    characterName: 'OOBI · PATHFINDER',
    level: 4,
    gold: 128,
    capacity: 20,
    items: [
      item('starlight-key', 'Starlight Key', 'key', 'A small key that remembers the way home.', 1, 'quest', COLORS.gold, 'key', [['USE', 'Ancient doors'], ['WEIGHT', '0.1 kg']]),
      item('healing-berry', 'Healing Berry', 'consumable', 'Restores a little vitality when the path gets rough.', 4, 'common', COLORS.red, 'heart', [['HEAL', '+2 hearts'], ['STACK', '8 max']]),
      item('mossy-charm', 'Mossy Charm', 'gear', 'A lucky green charm gathered beside the wetland.', 1, 'uncommon', COLORS.green, 'star', [['LUCK', '+5%'], ['SLOT', 'Trinket']]),
      item('old-compass', 'Old Compass', 'gear', 'The needle points toward places you have not seen yet.', 1, 'rare', 0x70b8e8, 'sign', [['DISCOVER', '+1 range'], ['SLOT', 'Utility']]),
      item('trail-rations', 'Trail Rations', 'consumable', 'Crunchy enough to survive a long afternoon outside.', 3, 'common', 0xdca66e, 'mushrooms', [['HEAL', '+1 heart'], ['STACK', '8 max']]),
      item('blue-crystal', 'Blue Crystal', 'key', 'It hums softly when a hidden route is nearby.', 2, 'rare', 0x6fc8ed, 'rocks', [['VALUE', '40 coins'], ['USE', 'Unknown']]),
      item('leaf-cloak', 'Leaf Cloak', 'gear', 'Lightweight fabric that smells like a summer meadow.', 1, 'uncommon', COLORS.green, 'tree', [['ARMOR', '+1'], ['SLOT', 'Body']]),
      item('rope-bundle', 'Rope Bundle', 'gear', 'A practical coil for steep ground and stubborn puzzles.', 1, 'common', 0xe0b17a, 'stairs', [['CLIMB', 'Short ledges'], ['WEIGHT', '1.0 kg']]),
      item('sunstone', 'Sunstone', 'key', 'A warm stone that still holds the afternoon light.', 1, 'quest', COLORS.gold, 'star', [['QUEST', 'Sunken vault'], ['VALUE', 'Priceless']]),
      item('field-flag', 'Field Flag', 'gear', 'Mark a safe place so future explorers can find it.', 1, 'common', 0xef8a75, 'flag', [['MARK', 'Safe spot'], ['SLOT', 'Utility']]),
    ],
  };
}

export function createInventoryUi(
  ui: Container,
  hooks: InventoryUiHooks = {},
): InventoryUi {
  const root = new Container();
  root.label = 'InventoryOverlay';
  root.visible = false;
  root.zIndex = 100;

  const backdrop = new Graphics();
  backdrop.rect(0, 0, INVENTORY_VIEWPORT.width, INVENTORY_VIEWPORT.height);
  backdrop.fill({ color: COLORS.ink, alpha: 0.78 });
  backdrop.eventMode = 'static';

  const panel = new Container();
  panel.label = 'InventoryPanel';
  const panelBackground = new Graphics();
  drawPixelBox(
    panelBackground,
    PANEL.x,
    PANEL.y,
    PANEL.width,
    PANEL.height,
    COLORS.panel,
    COLORS.outline,
  );
  panel.addChild(panelBackground);

  const headerMark = new Graphics();
  drawBackpackMark(headerMark, 88, 56);
  panel.addChild(headerMark);

  const title = text('BACKPACK', 22, COLORS.parchment, 'bold');
  title.x = 138;
  title.y = 58;
  panel.addChild(title);

  const subtitle = text('FIELD KIT', 9, COLORS.muted, 'bold');
  subtitle.x = 140;
  subtitle.y = 88;
  panel.addChild(subtitle);

  const close = new Container();
  close.x = 844;
  close.y = 52;
  close.eventMode = 'static';
  close.cursor = 'pointer';
  close.hitArea = new Rectangle(0, 0, 30, 30);
  const closeBackground = new Graphics();
  closeBackground.rect(2, 2, 26, 26).fill(COLORS.panelDark);
  closeBackground.rect(2, 2, 26, 26).stroke({ color: COLORS.outline, width: 2 });
  const closeLabel = text('×', 20, COLORS.parchment, 'bold');
  closeLabel.anchor.set(0.5);
  closeLabel.x = 15;
  closeLabel.y = 14;
  close.addChild(closeBackground, closeLabel);
  panel.addChild(close);

  const capacity = text('', 10, COLORS.parchmentMuted, 'bold');
  capacity.x = 650;
  capacity.y = 82;
  panel.addChild(capacity);

  const gold = text('', 10, COLORS.gold, 'bold');
  gold.x = 800;
  gold.y = 82;
  panel.addChild(gold);
  const coin = new Graphics();
  drawCoin(coin, 786, 88);
  panel.addChild(coin);

  const headerDivider = new Graphics();
  drawDivider(headerDivider, 94, 104, 770);
  panel.addChild(headerDivider);

  const tabs = INVENTORY_CATEGORIES.map((category, index) =>
    createTab(category, index, (nextCategory) => {
      selectedCategory = nextCategory;
      refresh();
    }));
  panel.addChild(...tabs);

  const grid = new Container();
  grid.label = 'InventoryGrid';
  panel.addChild(grid);

  const detail = new Container();
  detail.label = 'InventoryDetail';
  const detailBackground = new Graphics();
  drawPixelBox(detailBackground, DETAIL.x, DETAIL.y, DETAIL.width, DETAIL.height, COLORS.panelDark, COLORS.outline);
  detail.addChild(detailBackground);

  const detailRarity = text('', 9, COLORS.gold, 'bold');
  detailRarity.x = DETAIL.x + 20;
  detailRarity.y = DETAIL.y + 18;
  detail.addChild(detailRarity);

  const detailName = text('', 18, COLORS.parchment, 'bold');
  detailName.x = DETAIL.x + 20;
  detailName.y = DETAIL.y + 40;
  detail.addChild(detailName);

  const detailIcon = new Container();
  detailIcon.x = DETAIL.x + 224;
  detailIcon.y = DETAIL.y + 18;
  detail.addChild(detailIcon);

  const detailDivider = new Graphics();
  drawDivider(detailDivider, DETAIL.x + 20, DETAIL.y + 76, DETAIL.width - 40);
  detail.addChild(detailDivider);

  const detailDescription = text('', 11, COLORS.muted);
  detailDescription.x = DETAIL.x + 20;
  detailDescription.y = DETAIL.y + 92;
  detailDescription.style.wordWrap = true;
  detailDescription.style.wordWrapWidth = 265;
  detailDescription.style.lineHeight = 17;
  detail.addChild(detailDescription);

  const detailStats = new Container();
  detailStats.x = DETAIL.x + 20;
  detailStats.y = DETAIL.y + 157;
  detail.addChild(detailStats);
  panel.addChild(detail);

  const quickTitle = text('QUICK SLOTS', 9, COLORS.muted, 'bold');
  quickTitle.x = 550;
  quickTitle.y = 454;
  panel.addChild(quickTitle);

  const quickBackground = new Graphics();
  drawPixelBox(quickBackground, 550, 474, 314, 60, COLORS.panelDark, COLORS.outline);
  panel.addChild(quickBackground);
  const quickSlots = [0, 1, 2].map((index) => {
    const root = new Container();
    root.x = 558 + index * 84;
    root.y = 478;
    const background = new Graphics();
    drawPixelBox(background, 0, 0, 68, 52, COLORS.slot, COLORS.outlineDark);
    const icon = new Container();
    const label = text(String(index + 1), 9, COLORS.parchmentMuted, 'bold');
    label.x = 7;
    label.y = 36;
    root.addChild(background, icon, label);
    panel.addChild(root);
    return { icon };
  });

  const footer = text('CLICK AN ITEM TO INSPECT  ·  I / B TO CLOSE', 9, COLORS.muted, 'bold');
  footer.x = 94;
  footer.y = 506;
  panel.addChild(footer);

  root.addChild(backdrop, panel);
  ui.addChild(root);
  ui.sortableChildren = true;

  const slots = Array.from({ length: GRID.columns * GRID.rows }, (_, index) =>
    createSlot(index, (slotIndex) => {
      const item = filteredItems[slotIndex];
      if (item) {
        selectedItemId = item.id;
        refresh();
      }
    }));
  for (const slot of slots) {
    grid.addChild(slot.root);
  }

  let currentView: InventoryView = {
    items: [],
    capacity: 0,
    gold: 0,
    characterName: '',
    level: 0,
  };
  let filteredItems: readonly InventoryItemView[] = [];
  let selectedCategory: InventoryCategory = 'all';
  let selectedItemId: string | null = null;
  let open = false;

  function renderSlot(
    slot: InventorySlot,
    item: InventoryItemView | undefined,
    selected: boolean,
  ): void {
    slot.background.clear();
    drawPixelBox(
      slot.background,
      0,
      0,
      GRID.slot,
      GRID.slot,
      selected ? COLORS.slotSelected : COLORS.slot,
      selected ? COLORS.gold : COLORS.outline,
    );
    slot.icon.removeChildren().forEach((child) => child.destroy());
    slot.labelBackground.clear();
    slot.quantity.text = item && item.quantity > 1 ? String(item.quantity) : '';
    slot.label.text = item ? fitText(item.name.toUpperCase(), 11) : '';
    slot.label.style.fill = item ? COLORS.parchmentMuted : COLORS.muted;
    slot.root.visible = true;
    if (item) {
      slot.labelBackground
        .rect(4, GRID.slot - 17, GRID.slot - 8, 13)
        .fill({ color: COLORS.ink, alpha: 0.88 });
      addIcon(slot.icon, item);
    }
  }

  function renderDetail(item: InventoryItemView | undefined): void {
    detailIcon.removeChildren().forEach((child) => child.destroy());
    detailStats.removeChildren().forEach((child) => child.destroy());
    if (!item) {
      detailRarity.text = 'EMPTY POCKET';
      detailRarity.style.fill = COLORS.muted;
      detailName.text = 'Nothing selected';
      detailDescription.text = 'Choose an item from the field kit to inspect it.';
      return;
    }

    detailRarity.text = RARITY_LABELS[item.rarity];
    detailRarity.style.fill = RARITY_COLORS[item.rarity];
    detailName.text = fitText(item.name, 19);
    detailDescription.text = item.description;
    addIcon(detailIcon, item);

    for (const [index, [label, value]] of (item.stats ?? []).entries()) {
      const statLabel = text(label, 8, COLORS.muted, 'bold');
      statLabel.y = index * 24;
      const statValue = text(value, 10, COLORS.parchment, 'bold');
      statValue.x = 82;
      statValue.y = index * 24 - 1;
      detailStats.addChild(statLabel, statValue);
    }
  }

  function refresh(): void {
    filteredItems = filterInventoryItems(currentView.items, selectedCategory);
    const selectedItem = filteredItems.find((item) => item.id === selectedItemId)
      ?? filteredItems[0];
    selectedItemId = selectedItem?.id ?? null;
    for (const [index, slot] of slots.entries()) {
      renderSlot(slot, filteredItems[index], filteredItems[index]?.id === selectedItemId);
    }
    for (const [index, tab] of tabs.entries()) {
      const background = tab.children[0];
      const label = tab.children[1];
      if (!(background instanceof Graphics) || !(label instanceof Text)) {
        continue;
      }
      background.clear();
      drawPixelBox(
        background,
        0,
        0,
        84,
        32,
        INVENTORY_CATEGORIES[index] === selectedCategory ? COLORS.panelLight : COLORS.panelDark,
        INVENTORY_CATEGORIES[index] === selectedCategory ? COLORS.gold : COLORS.outlineDark,
      );
      label.style.fill = INVENTORY_CATEGORIES[index] === selectedCategory
        ? COLORS.parchment
        : COLORS.muted;
    }
    renderDetail(selectedItem);
    for (const [index, quickSlot] of quickSlots.entries()) {
      quickSlot.icon.removeChildren().forEach((child) => child.destroy());
      const quickItem = currentView.items[index + 1];
      if (quickItem) {
        addIcon(quickSlot.icon, quickItem);
      }
    }
    const used = inventoryUsage(currentView);
    capacity.text = `${used.toString().padStart(2, '0')} / ${currentView.capacity.toString().padStart(2, '0')} SLOTS`;
    gold.text = currentView.gold.toString().padStart(3, '0');
    subtitle.text = `${currentView.characterName}  ·  LVL ${currentView.level}`;
  }

  close.on('pointertap', () => setOpen(false));

  function setOpen(nextOpen: boolean): void {
    open = nextOpen;
    root.visible = open;
    hooks.onOpenChange?.(open);
  }

  return {
    render(view): void {
      currentView = view;
      if (!selectedItemId) {
        selectedItemId = view.items[0]?.id ?? null;
      }
      refresh();
    },

    setOpen,

    toggle(): void {
      setOpen(!open);
    },

    isOpen(): boolean {
      return open;
    },

    destroy(): void {
      root.destroy({ children: true });
    },
  };
}
