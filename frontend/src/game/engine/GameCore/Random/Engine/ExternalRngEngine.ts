// Egt::GameCore::ExternalRngEngineHat (game_core Random/Engine/ExternalRngEngine.h: BaseExternalRngEngine<BitQueue,
// RngDistributionHat>): an engine of numbers from outside, a kernel's: its BitQueue holds them, and each draw takes its
// bits with RngDistributionHat. When the queue runs out, a draw throws InsufficientRandomBits. The C++ template has
// other distributions (Vbr, Opt) the game does not use.

import type { uint32_t } from '@game/engine/GameCore/Common/Types';
import { BitQueue } from '../BitGenerator/BitQueue';
import { RngDistributionHat } from '../Distribution/RngDistributionHat';
import type { IRng, RngOp, RngSequence } from '../IRng';

export class ExternalRngEngineHat implements IRng {
  private m_queue = new BitQueue();

  /** Generate(op) is all 32 bits, as Generate(op, 0) is: both are the queue's next 32 bits. */
  Generate(op: RngOp, range: uint32_t = 0): uint32_t {
    console.assert(op !== 0, 'RngOp::Undefined');
    return RngDistributionHat.GenerateUniform(this.m_queue, range);
  }

  GetHistory(): RngSequence {
    return { data: [] };
  }

  GetBitsUsed() {
    return this.m_queue.GetBitsPopped();
  }

  GetBitsRemaining() {
    return this.m_queue.GetBitsRemaining();
  }

  GetBitQueue(): Readonly<BitQueue> {
    return this.m_queue;
  }

  /** C++'s MutableBitQueue() = queue: the engine's queue replaced. */
  SetBitQueue(queue: BitQueue) {
    this.m_queue = queue;
  }
}
