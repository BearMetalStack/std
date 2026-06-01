export class Message<T = string> {
  from: string | number;
  to: string;
  message: T;
  // We could actually make the server emit specific event names instead of using the message as the event
  event?: string;

  status?: 'SUCCESS' | 'FAILED';
  channelId?: string;
  constructor(m: Message<T>) {
    this.to = m.to;
    this.from = m.from;
    this.message = m.message;
    this.event = m.event;

    this.status = m.status;
    this.channelId = m.channelId;
  }
}