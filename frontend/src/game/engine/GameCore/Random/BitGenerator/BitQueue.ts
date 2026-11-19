// Egt::GameCore::BitQueue (game_core Random/BitGenerator/BitQueue.h/.cpp): a queue of random bits. Numbers are pushed
// in at a width of bits (a kernel's numbers at its bit width) and popped out at any width up to 32, lowest bits first:
// the gameflow pushes the kernel's numbers in, and RngDistributionHat pops 32 bits for each draw. Popping more bits than
// it holds throws InsufficientRandomBits.
//
// TypeScript's bit operators work on signed 32-bit integers: each word is kept unsigned (>>> 0), and a 32-bit shift,
// which JavaScript takes modulo 32, is never made (C++ never makes one either).

import type { uint32_t } from '@game/engine/GameCore/Common/Types';
import { InsufficientRandomBits } from '../Exceptions';

const UINT32_MAX = 0xffff_ffff;

/** The lowest bits of a value (bits < 32). */
function LowBits(value: uint32_t, bits: number) {
  return (value & ((1 << bits) - 1)) >>> 0;
}

export class BitQueue {
  static min() {
    return 0;
  }

  static max() {
    return UINT32_MAX;
  }

  static min_pop_bits() {
    return 1;
  }

  static max_pop_bits() {
    return 32;
  }

  private m_data: uint32_t[] = [];
  private m_headBit = 0;
  private m_tailBit = 32;
  private m_popped = 0;

  /** operator(): pops 32 bits. */
  Next(): uint32_t {
    return this.Pop(32);
  }

  /** Push(bits, value), or Push(bits, range): each number of the range at the width. */
  Push(bits: number, value: uint32_t | readonly uint32_t[]) {
    if (typeof value !== 'number') {
      for (const item of value) this.Push(bits, item);
      return;
    }
    if (!(bits <= 32)) throw new RangeError('BitQueue::Push supports at most 32 bits');
    if (this.m_tailBit === 32) {
      this.m_data.push(0);
      this.m_tailBit = 0;
    }
    if (this.m_tailBit + bits <= 32) {
      if (bits === 32) {
        this.PushBackNoCheck(bits, value >>> 0);
      } else {
        this.PushBackNoCheck(bits, LowBits(value, bits));
      }
    } else {
      const b = 32 - this.m_tailBit;
      console.assert(b < 32);
      this.PushBackNoCheck(b, LowBits(value, b));
      console.assert(this.m_tailBit === 32);
      this.m_data.push(0);
      this.m_tailBit = 0;
      this.PushBackNoCheck(bits - b, (value >>> 0) >>> b);
    }
  }

  private PushBackNoCheck(bits: number, value: uint32_t) {
    const last = this.m_data.length - 1;
    if (this.m_tailBit === 0) {
      console.assert(bits <= 32);
      this.m_data[last] = value >>> 0;
      this.m_tailBit = bits;
    } else {
      console.assert(this.m_tailBit + bits <= 32);
      this.m_data[last] = (this.m_data[last] | (value << this.m_tailBit)) >>> 0;
      this.m_tailBit += bits;
    }
  }

  Pop(bits: number): uint32_t {
    if (bits === 0) return 0;
    if (!(bits <= 32)) throw new RangeError('BitQueue::Pop supports at most 32 bits');

    if (bits > this.GetBitsRemaining()) {
      throw new InsufficientRandomBits(`BitQueue::Pop failed: bits=${bits}, remaining=${this.GetBitsRemaining()}`);
    }

    this.m_popped += bits;

    if (this.m_headBit + bits <= 32) {
      return this.PopFrontNoCheck(bits);
    } else {
      const b = 32 - this.m_headBit;
      console.assert(b < 32);
      let value = this.PopFrontNoCheck(b);
      value = (value | (this.PopFrontNoCheck(bits - b) << b)) >>> 0;
      return value;
    }
  }

  private PopFrontNoCheck(bits: number): uint32_t {
    if (bits === 32) {
      console.assert(this.m_headBit === 0);
      // Peek, then pop
      return this.m_data.shift()! >>> 0;
    } else {
      console.assert(bits < 32);
      console.assert(this.m_headBit < 32);
      console.assert(this.m_headBit + bits <= 32);
      // Peek
      const value = LowBits(this.m_data[0] >>> this.m_headBit, bits);
      // Pop
      this.m_headBit += bits;
      if (this.m_headBit === 32) {
        this.m_data.shift();
        this.m_headBit = 0;
      }
      return value;
    }
  }

  GetBitsPopped() {
    return this.m_popped;
  }

  GetBitsRemaining() {
    if (this.m_data.length === 0) return 0;
    return (this.m_data.length - 1) * 32 + this.m_tailBit - this.m_headBit;
  }
}
