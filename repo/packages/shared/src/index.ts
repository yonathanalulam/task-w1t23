export type UserRole =
  | 'researcher'
  | 'reviewer'
  | 'approver'
  | 'resource_manager'
  | 'finance_clerk'
  | 'administrator';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  roles: UserRole[];
  sessionId: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
