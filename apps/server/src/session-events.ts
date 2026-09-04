import { EventEmitter } from 'node:events';
import type { UserFacingStatus } from '@likec4-ai/core-domain';

export type SessionEvent = { type: 'status'; status: UserFacingStatus } | { type: 'completed' } | { type: 'failed' };

/**
 * In-process pub/sub keyed by sessionId — единственный процесс (ФТ28), так
 * что EventEmitter достаточно, никакого внешнего message broker не нужно.
 * Оркестратор публикует статусы стадий сюда через `onStatus`, SSE-роут
 * подписывается на конкретную сессию.
 */
export class SessionEventBus {
  #emitter = new EventEmitter();

  publish(sessionId: string, event: SessionEvent): void {
    this.#emitter.emit(sessionId, event);
  }

  subscribe(sessionId: string, listener: (event: SessionEvent) => void): () => void {
    this.#emitter.on(sessionId, listener);
    return () => this.#emitter.off(sessionId, listener);
  }
}
