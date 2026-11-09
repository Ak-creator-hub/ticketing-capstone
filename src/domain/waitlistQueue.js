import { DomainError } from './errors.js';

export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  enqueue(value) {
    if (value === undefined) {
      throw new DomainError('VALIDATION', 'Queue values cannot be undefined.');
    }

    const node = { value, next: null };
    if (this.#tail === null) {
      this.#head = node;
      this.#tail = node;
    } else {
      this.#tail.next = node;
      this.#tail = node;
    }
    this.#size += 1;
    return this.#size;
  }

  dequeue() {
    if (this.#head === null) {
      return undefined;
    }

    const value = this.#head.value;
    this.#head = this.#head.next;
    this.#size -= 1;
    if (this.#head === null) {
      this.#tail = null;
    }
    return value;
  }

  peek() {
    return this.#head === null ? undefined : this.#head.value;
  }

  get size() {
    return this.#size;
  }
}
