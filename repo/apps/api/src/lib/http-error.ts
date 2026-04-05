export class HttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Authentication required', details?: unknown): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message, details);

export const forbidden = (message = 'Access denied', details?: unknown): HttpError =>
  new HttpError(403, 'FORBIDDEN', message, details);

export const conflict = (message: string, details?: unknown): HttpError =>
  new HttpError(409, 'CONFLICT', message, details);
