import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
};

export const verifyPassword = async (passwordHash: string, password: string): Promise<boolean> => {
  return argon2.verify(passwordHash, password);
};

export const createSessionToken = (): string => randomBytes(48).toString('base64url');

export const hashSessionToken = (sessionToken: string, sessionSecret: string): string => {
  return createHmac('sha256', sessionSecret).update(sessionToken).digest('hex');
};
