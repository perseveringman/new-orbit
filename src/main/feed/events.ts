import { EventEmitter } from 'node:events';
import type { FeedChangeEvent } from '@shared/feed';

type FeedChangeEventInput = Omit<FeedChangeEvent, 'at'> & Partial<Pick<FeedChangeEvent, 'at'>>;

const feedEventBus = new EventEmitter();
feedEventBus.setMaxListeners(100);

export function publishFeedChange(input: FeedChangeEventInput): FeedChangeEvent {
  const event: FeedChangeEvent = {
    ...input,
    at: input.at ?? new Date().toISOString()
  };
  feedEventBus.emit('event', event);
  return event;
}

export function onFeedChange(cb: (event: FeedChangeEvent) => void): () => void {
  feedEventBus.on('event', cb);
  return () => feedEventBus.off('event', cb);
}
