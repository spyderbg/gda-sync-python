// Egt::Integration::IKernelIntegration: the kernel the gameflow plays matches with. The C++ integrations talk to the
// cabinet's kernel (playground, hat, astro...); the browser game has the BrowserKernel. Each request is answered later,
// by an event the kernel posts from its Process.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IKernelApi {
  RequestStartMatch(creditBet: number): void;
  RequestStartRound(roundName: string): void;
  /** maxValue 0: as many bits as the kernel can give. */
  RequestRandoms(count: number, maxValue: number): void;
  RequestRoundOutcome(creditWin: number): void;
  RequestEndMatch(creditWin: number): void;
}

export class IKernelIntegrationEvents {
  /** The platform suspends the game, and resumes it ({name}): the browser kernel never does. */
  readonly suspendRequested = new Event<[string]>();
  readonly resumeRequested = new Event<[string]>();
  readonly startMatchReply = new Event<[boolean]>();
  readonly startRoundReply = new Event();
  readonly randomsReply = new Event<[number[], number]>(); // {randoms, maxValue}
  readonly roundOutcomeReply = new Event();
  readonly endMatchReply = new Event<[number]>();
}

export interface IKernelIntegration {
  GetKernelApi(): IKernelApi;
}

export const IKernelIntegration = Interface<IKernelIntegration, IKernelIntegrationEvents>('IKernelIntegration');
