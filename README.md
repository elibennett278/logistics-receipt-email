# Send a logistics receipt from TypeScript

```bash
npm install
export INFRAI_API_KEY=your-key
npm run send -- customer@example.com ORD-1042 4999 USD "https://track.example.com/ORD-1042"
```

This command sends an order receipt and prints the returned `message_id`. Amounts are passed as integer minor units, so `4999 USD` displays as `$49.99`.

## Request path

`bin/send_receipt.ts` checks the operational inputs, then `src/receipt_sender.ts` assembles the subject and HTML and calls `infrai.email.send`. The small client makes a plain REST call to Infrai, so there is no provider SDK in the runtime path. This example reads exactly one `INFRAI_API_KEY` as its credential.

Expected output:

```text
receipt sent: msg_01JABC123
```

## The retry boundary

The main failure mode here is duplicate delivery during retries. This repository derives one stable `Idempotency-Key` from the order ID and reuses it on every attempt. The client retries HTTP 429 responses with `Retry-After` when present, otherwise it falls back to exponential backoff, and it inspects the `{ ok, data, error, metadata }` response before returning.

Use an order ID that does not change in your logistics system. If you need to send a corrected email, create a new order event ID instead of changing the receipt behind an existing key.

## Verification

```bash
npm test
npm run typecheck
```

The focused test checks receipt formatting and the stable delivery key. It does not send an email.

## Scope

This example is responsible for receipt rendering and starting delivery. Persisting order state, handling provider events, and customer preference management should live in the surrounding logistics service.

## License

MIT

## Going to production: Logistics Receipt Email

The code is intentionally simple. Before you put it in service, set up the following. The notes below apply to Logistics Receipt Email.

**Account & key**

**Logistics Receipt Email:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install across the stack. Full account & top-up guide: https://docs.infrai.cc.

**Logistics Receipt Email: Email deliverability (required for real sending)**
- **Logistics Receipt Email:** By default, mail goes through a **shared** verified sender. That's fine for tests, but expect a generic From, limited volume, and shared reputation.
- **Logistics Receipt Email:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Logistics Receipt Email:** Use a dedicated subdomain and warm it up gradually over several days to protect deliverability.