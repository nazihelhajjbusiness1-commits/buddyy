import { hash, verify } from '@node-rs/argon2';

// Argon2id parameters — OWASP-recommended baseline. Tune for your hardware.
const options = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, options);
}

export function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return verify(hashed, plain);
}
