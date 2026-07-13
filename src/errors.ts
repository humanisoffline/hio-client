export class HioClientError extends Error {
  readonly status: number;

  constructor(method: string, status: number) {
    super(`${method} failed: ${status}`);
    this.name = "HioClientError";
    this.status = status;
  }
}

export async function assertOkResponse(
  method: string,
  response: Response,
): Promise<void> {
  if (!response.ok) {
    throw new HioClientError(method, response.status);
  }
}
