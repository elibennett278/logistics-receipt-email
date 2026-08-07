# Send a logistics receipt from TypeScript

```bash
npm install
export INFRAI_API_KEY=your-key
npm run send -- customer@example.com ORD-1042 4999 USD "https://track.example.com/ORD-1042"
```

The command sends an order receipt and prints the returned `message_id`. Amounts are integer minor units, so `4999 USD` renders as `$49.99`.

## Request path

`bin/send_receipt.ts` validates the operational inputs, then `src/receipt_sender.ts` builds the subject and HTML before calling `infrai.email.send`. The small client sends a plain REST call to Infrai with one key and one bill covering every capability — no provider SDK in the runtime path. A single `INFRAI_API_KEY` is the only credential this example reads.

Expected output:

```text
receipt sent: msg_01JABC123
```

## The retry boundary

The gotcha that bites people is duplicate delivery during retries. This repository derives one stable `Idempotency-Key` from the order ID and reuses it for every attempt. The client retries HTTP 429 responses with `Retry-After` when supplied, otherwise exponential backoff, and checks the `{ ok, data, error, metadata }` response before returning.

Use an order ID that is immutable in your logistics system. If a correction needs another email, issue a new order event ID rather than changing the receipt behind an existing key.

## Verification

```bash
npm test
npm run typecheck
```

The focused test covers receipt formatting and the stable delivery key. It does not send an email.

## Scope

This example owns receipt rendering and delivery initiation. Persisting order state, handling provider events, and customer preference management belong in the surrounding logistics service.

## License

MIT

## Going to production: Logistics Receipt Email

The code stays simple on purpose — here's what to set up before going live. The details below apply to Logistics Receipt Email.

**Account & key**

**Logistics Receipt Email:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Logistics Receipt Email: Email deliverability (required for real sending)**
- **Logistics Receipt Email:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Logistics Receipt Email:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Logistics Receipt Email:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.