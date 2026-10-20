// Egt::Integration::IKernelIntegration: the kernel the gameflow plays matches with. The C++ integrations talk to the
// cabinet's kernel (playground, hat, astro...); the browser game has the BrowserKernel. Each request is answered later,
// by an event the kernel posts from its Process.

import { Event } from '../../engine/Core/Event';
import { Interface } from '../../engine/GameCore/RuntimeAccess';

export interface IKernelApi {
  RequestStartMatch(creditBet: number): void;
  RequestStartRound(roundName: string): void;
  RequestRandoms(count: number): void;
  RequestRoundOutcome(creditWin: number): void;
  RequestEndMatch(creditWin: number): void;
}

export class IKernelIntegrationEvents {
  readonly startMatchReply = new Event<[boolean]>();
  readonly startRoundReply = new Event();
  readonly randomsReply = new Event<[number[]]>();
  readonly roundOutcomeReply = new Event();
  readonly endMatchReply = new Event<[number]>();
}

export interface IKernelIntegration {
  GetKernelApi(): IKernelApi;
}

export const IKernelIntegration = Interface<IKernelIntegration, IKernelIntegrationEvents>('IKernelIntegration');
