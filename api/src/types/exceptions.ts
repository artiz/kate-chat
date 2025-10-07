export class HttpError<T = unknown> extends Error {
  readonly statusCode: number;
  readonly details?: T;

  constructor(message: string, statusCode: number = 500, details?: T) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;

    // Only because we are extending a built in class
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
