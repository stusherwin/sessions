/*
BSD 3-Clause License

Copyright (c) 2012-2023, katspaugh and contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

export type GeneralEventTypes = {
  // the name of the event and the data it dispatches with
  // e.g. 'entryCreated': [count: 1]
  [EventName: string]: unknown[] // eslint-disable-line @typescript-eslint/no-explicit-any
}

type EventListener<EventTypes extends GeneralEventTypes, EventName extends keyof EventTypes> = (
  ...args: EventTypes[EventName]
) => void

type EventMap<EventTypes extends GeneralEventTypes> = {
  [EventName in keyof EventTypes]: Set<EventListener<EventTypes, EventName>>
}

/** A simple event emitter that can be used to listen to and emit events. */
class EventEmitter<EventTypes extends GeneralEventTypes> {
  private listeners = {} as EventMap<EventTypes>

  /** Subscribe to an event. Returns an unsubscribe function. */
  public on<EventName extends keyof EventTypes>(
    event: EventName,
    listener: EventListener<EventTypes, EventName>,
    options?: { once?: boolean },
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set()
    }
    this.listeners[event].add(listener)

    if (options?.once) {
      const unsubscribeOnce = () => {
        this.un(event, unsubscribeOnce)
        this.un(event, listener)
      }
      this.on(event, unsubscribeOnce)
      return unsubscribeOnce
    }

    return () => this.un(event, listener)
  }

  /** Unsubscribe from an event */
  public un<EventName extends keyof EventTypes>(
    event: EventName,
    listener: EventListener<EventTypes, EventName>,
  ): void {
    this.listeners[event]?.delete(listener)
  }

  /** Subscribe to an event only once */
  public once<EventName extends keyof EventTypes>(
    event: EventName,
    listener: EventListener<EventTypes, EventName>,
  ): () => void {
    return this.on(event, listener, { once: true })
  }

  /** Clear all events */
  public unAll(): void {
    this.listeners = {} as EventMap<EventTypes>
  }

  /** Emit an event */
  protected emit<EventName extends keyof EventTypes>(eventName: EventName, ...args: EventTypes[EventName]): void {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach((listener) => listener(...args))
    }
  }
}

export default EventEmitter