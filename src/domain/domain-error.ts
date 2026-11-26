/**
 * Error raised when a business rule is violated.
 * The code is stable, so the interface can pick the message and the handling.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
