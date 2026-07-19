export class SpecSentinelError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SpecSentinelError';
  }
}
