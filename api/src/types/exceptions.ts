import { HttpStatusCode } from "axios";

export class HttpError<T = unknown> extends Error {
  readonly statusCode: HttpStatusCode;
  readonly details?: T;

  constructor(message: string, statusCode: HttpStatusCode = HttpStatusCode.InternalServerError, details?: T) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;

    // Only because we are extending a built in class
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
