// Egt::GameCore::RngDistributionHat (game_core Random/Distribution/RngDistributionHat.h): a uniform number in [0, range)
// from a generator of uniform 32-bit numbers, as the C++ game draws its rounds from the kernel's numbers.
// - range 1: 0, and the generator gives nothing;
// - range 0 or a power of 2: the generator's highest bits ((n * range) >> 32), all 32 bits for range 0;
// - any other range: n * range / acceptable, a number n at or above acceptable (the biased tail) drawn again.
// The products are 64-bit in C++: BigInt here.

import type { uint32_t } from '@game/engine/GameCore/Common/Types';

const UINT32 = 0x1_0000_0000n;

/** A generator of uniform 32-bit numbers (std::uniform_random_bit_generator of min 0, max 2^32-1). */
export interface UniformRandomBitGenerator {
  Next(): uint32_t;
}

/** A queue numbers are pushed into (uniform_random_bit_queue). */
export interface UniformRandomBitQueue {
  Push(bits: number, value: uint32_t): void;
}

export const RngDistributionHat = {
  GenerateUniform(generator: UniformRandomBitGenerator, range: uint32_t): uint32_t {
    range = range >>> 0;

    // hat doesn't change generator state, if the range is 1
    if (range === 1) {
      return 0;
    }

    if ((range & (range - 1)) === 0) {
      // range is either 0 or power of 2 => no bias correction is needed
      // Note: GenerateRng(0) returns all 32 random bits
      return range ? Number((BigInt(generator.Next()) * BigInt(range)) >> 32n) : generator.Next();
    }

    const bias = (UINT32 - BigInt(range)) % BigInt(range);
    const acceptable = (UINT32 - bias) % UINT32;
    console.assert(acceptable > 0n);

    let n: bigint;
    do {
      n = BigInt(generator.Next());
    } while (n >= acceptable);

    return Number((n * BigInt(range)) / acceptable);
  },

  InverseUniform(value: uint32_t, range: uint32_t, queue: UniformRandomBitQueue) {
    range = range >>> 0;

    /// Inverse the algorithm in GenerateUniform
    if ((range & (range - 1)) === 0) {
      queue.Push(32, range ? Number(((BigInt(value) << 32n) / BigInt(range)) % UINT32) : value >>> 0);
    } else {
      const bias = (UINT32 - BigInt(range)) % BigInt(range);
      const acceptable = (UINT32 - bias) % UINT32;
      console.assert(acceptable > 0n);

      queue.Push(32, Number(((BigInt(value) * acceptable) / BigInt(range)) % UINT32));
    }
  },
};
