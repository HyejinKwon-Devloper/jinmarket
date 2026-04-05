export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code?: string
  ) {
    super(message);
  }
}

export function isPgUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
