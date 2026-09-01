import {
  createAuthoredWorld,
  type AuthoredCell,
  type AuthoredWorld,
} from '@/world/authored-world';
import { createRoomId } from '@/world/types';

const GRASS: AuthoredCell = {
  surface: 'grass',
  elevation: 0,
  obstacle: null,
  walkable: true,
};
const ROAD: AuthoredCell = {
  surface: 'dirt',
  elevation: 0,
  obstacle: null,
  walkable: true,
};
const ROCK: AuthoredCell = {
  surface: 'stone',
  elevation: 0,
  obstacle: 'rock',
  walkable: false,
};
const TREE: AuthoredCell = {
  surface: 'grass',
  elevation: 0,
  obstacle: 'forest',
  walkable: false,
};
const BUILDING: AuthoredCell = {
  surface: 'stone',
  elevation: 0,
  obstacle: 'building',
  walkable: false,
};

const LEGEND: Readonly<Record<string, AuthoredCell>> = {
  '.': GRASS,
  '=': ROAD,
  '#': ROCK,
  T: TREE,
  B: BUILDING,
  '<': GRASS,
  '>': GRASS,
  '^': GRASS,
  v: GRASS,
};

const villageSquare = createRoomId('village-square');
const elderHouse = createRoomId('elder-house');
const eastRoad = createRoomId('east-road');
const ruinsEntrance = createRoomId('ruins-entrance');

export const MAIN_WORLD: AuthoredWorld = createAuthoredWorld({
  startRoomId: villageSquare,
  startPosition: { x: 6, y: 5 },
  rooms: [
    {
      id: villageSquare,
      title: 'Village Square',
      description: 'A broad green square with a worn road and quiet edges.',
      width: 13,
      height: 11,
      grid: [
        'BBBBBB^BBBBBB',
        'BTT.......TTB',
        'B...........B',
        'B...====....B',
        'B...====....B',
        'B...====....>',
        'B...====....B',
        'B...====....B',
        'B...........B',
        'BTT.......TTB',
        'BBBBBBBBBBBBB',
      ],
      legend: LEGEND,
      spawn: { x: 6, y: 5 },
      exits: [
        {
          id: 'village-square-east',
          direction: 'right',
          position: { x: 12, y: 5 },
          targetRoomId: eastRoad,
          targetEntry: { x: 0, y: 4 },
          reciprocalExitId: 'east-road-west',
        },
        {
          id: 'village-square-north',
          direction: 'up',
          position: { x: 6, y: 0 },
          targetRoomId: elderHouse,
          targetEntry: { x: 6, y: 10 },
          reciprocalExitId: 'elder-house-south',
        },
      ],
    },
    {
      id: eastRoad,
      title: 'East Road',
      description: 'A long dirt road threads between trees, stone, and old walls.',
      width: 17,
      height: 9,
      grid: [
        'TT..BBBBBBBBB..TT',
        'T...=========...T',
        'T...=========...T',
        'T...=========...T',
        '<....========....',
        'T...=========...T',
        'T..=====...====.T',
        'T...=========...T',
        'TT..BBBBBBBBB..TT',
      ],
      legend: LEGEND,
      spawn: { x: 8, y: 4 },
      exits: [
        {
          id: 'east-road-west',
          direction: 'left',
          position: { x: 0, y: 4 },
          targetRoomId: villageSquare,
          targetEntry: { x: 12, y: 5 },
          reciprocalExitId: 'village-square-east',
        },
        {
          id: 'east-road-east',
          direction: 'right',
          position: { x: 16, y: 4 },
          targetRoomId: ruinsEntrance,
          targetEntry: { x: 0, y: 3 },
          reciprocalExitId: 'ruins-entrance-west',
        },
      ],
    },
    {
      id: ruinsEntrance,
      title: 'Ruins Entrance',
      description: 'Broken stonework marks the quiet entrance to the old ruins.',
      width: 13,
      height: 11,
      grid: [
        'BBBBBBBBBBBBB',
        'BTT.......TTB',
        'B...####...TB',
        '<...#..#....B',
        'B...#..#....B',
        'B...#....#..B',
        'B...#....#..B',
        'B...######..B',
        'BTT.......TTB',
        'B...........B',
        'BBBBBBBBBBBBB',
      ],
      legend: LEGEND,
      spawn: { x: 3, y: 9 },
      exits: [
        {
          id: 'ruins-entrance-west',
          direction: 'left',
          position: { x: 0, y: 3 },
          targetRoomId: eastRoad,
          targetEntry: { x: 16, y: 4 },
          reciprocalExitId: 'east-road-east',
        },
      ],
    },
    {
      id: elderHouse,
      title: 'Elder House',
      description: 'A small, quiet interior with worn stone walls and a south door.',
      width: 13,
      height: 11,
      grid: [
        'BBBBBBBBBBBBB',
        'B###########B',
        'B#.........#B',
        'B#..====...#B',
        'B#.........#B',
        'B#.........#B',
        'B#.........#B',
        'B#..====...#B',
        'B#.........#B',
        'B###########B',
        'BBBBBBvBBBBBB',
      ],
      legend: LEGEND,
      spawn: { x: 6, y: 8 },
      exits: [
        {
          id: 'elder-house-south',
          direction: 'down',
          position: { x: 6, y: 10 },
          targetRoomId: villageSquare,
          targetEntry: { x: 6, y: 0 },
          reciprocalExitId: 'village-square-north',
        },
      ],
    },
  ],
});
