import { describe, expect, it } from 'vitest';
import { validateRoom } from './analyze';
import { genRoom } from './gen-room';

const fuzzDescribe =
  process.env.WORLD_FUZZ === '1' ? describe : describe.skip;

fuzzDescribe('genRoom fuzz', () => {
  it('keeps seeds 0 through 999 valid', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      expect(validateRoom(genRoom(seed)), `seed ${seed}`).toEqual([]);
    }
  });
});
