import { randomInt, randomUUID } from 'node:crypto';

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const REFERENCE_LENGTH = 8;

export function newId() {
  return randomUUID();
}

export function newReference() {
  let code = '';

  for (let index = 0; index < REFERENCE_LENGTH; index += 1) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }

  return `BK-${code}`;
}
