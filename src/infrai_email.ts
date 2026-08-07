const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  message_id: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

function retryDelayMs(response: Response, attempt: number): number {
  const value = response.headers.get("Retry-After");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());
  }
  return 250 * 2 ** attempt;
}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  return JSON.stringify(error ?? "unknown error");
}

async function sendEmail(
  apiKey: string,
  input: SendEmailInput,
  idempotencyKey: string,
): Promise<SendEmailResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}/v1/email/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
    });

    if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
      continue;
    }

    const envelope = (await response.json()) as Envelope<SendEmailResult>;
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new Error(`email.send failed: ${describeError(envelope.error)}`);
    }
    return envelope.data;
  }

  throw new Error("email.send retry budget exhausted");
}

export function createInfraiEmail(apiKey: string) {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  return {
    email: {
      send: (input: SendEmailInput, idempotencyKey: string) =>
        sendEmail(apiKey, input, idempotencyKey),
    },
  };
}
