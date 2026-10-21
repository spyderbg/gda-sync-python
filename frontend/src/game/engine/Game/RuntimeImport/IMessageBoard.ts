// Egt::Game::IMessageBoard (IMessageBoard.bridge.h): the cabinet's messages over the game. The browser kernel has none:
// the game's states react to it where the cabinet has it.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum MessageType {
  Undefined,
  Overlay,
  WaitingInput,
  BlockingInput,
}

export interface IMessageBoard {
  AddMessage(type: MessageType, message: string): number;
  RemoveMessage(messageId: number): void;
  RemoveAllMessage(): void;
}

export class IMessageBoardEvents {
  readonly onWaitingInput = new Event();
  readonly onBlocking = new Event();
}

export const IMessageBoard = Interface<IMessageBoard, IMessageBoardEvents>('IMessageBoard');
