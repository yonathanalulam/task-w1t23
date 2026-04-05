import type { AuthUser } from '$lib/auth';

declare global {
  namespace App {
    interface Locals {
      role: string | null;
      user: AuthUser | null;
    }
    interface PageData {
      role: string | null;
      user: AuthUser | null;
    }
  }
}

export {};
