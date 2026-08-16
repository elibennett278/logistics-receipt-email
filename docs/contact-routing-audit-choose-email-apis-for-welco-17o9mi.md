# Contact Routing Audit: Choose Email APIs for Welcome Flow Event Polling

Short answer: choose an email API only after proving that it can authenticate a custom domain, suppress known bad recipients before every send, and expose stable delivery events that a US/EU SaaS service can poll without webhooks. For a developer-tools contact form, the real output isn't merely a welcome email. It is a reviewable chain from submission to the correct support queue, user acknowledgement, provider acceptance, and final disposition.

## The 02:17 page arrives too late

The page arrives at 02:17: “enterprise contact unassigned.” The on-call sees a ticket ID, a tenant region, and an acknowledgement message ID, but no evidence that the routing worker claimed the submission or that the recipient passed suppression checks. Retrying the whole flow could create a second ticket and a duplicate welcome email. Doing nothing could leave a security question in the general queue until morning.

That's too late.

The signal that should have fired earlier was a broken evidence transition: `submitted` had not advanced to `queue_assigned` within the service objective. Delivery polling matters, but it cannot repair an unknown routing state. The system needs separate, correlated records for routing and mail delivery so an operator can retry one side without replaying the other.

## How should a US/EU SaaS team choose an email API for welcome email event polling?

Start with evidence requirements, then test API ergonomics. A candidate should let the application associate its own immutable message key with a send, return a provider message identifier, and later expose enough event data to reconcile that identifier. Polling also needs a documented pagination or cursor model and a retention period long enough for the application's worst credible recovery window. I'm not sure a provider's default retention is sufficient for your audit policy; only its current contract and documentation can resolve that.

Custom-domain DKIM is another gate, not a checkbox. The team should be able to verify the signing-domain setup, distinguish configuration from ongoing delivery state, and record when its own deployment accepted the domain as ready. DKIM defines a domain-level signature that a verifier can validate; it doesn't prove that a support ticket reached the right internal queue. Keep those claims separate. A mail-authentication result, an application routing decision, and a delivery event answer three different questions.

The suppression list belongs in the send path. Before issuing a welcome or acknowledgement email, look up the normalized recipient and record the result against the submission. If the recipient is suppressed, don't call the send API. Record a terminal `send_suppressed` decision, keep the contact request in its assigned support queue, and give the agent another approved way to respond. This avoids turning a mail policy decision into a lost customer request.

No-webhook operation changes the evaluation. The provider must offer pull-based events or another documented retrieval mechanism; a dashboard alone isn't an integration. Ask candidates to demonstrate these cases in a disposable domain: a successful delivery, a suppression hit, an invalid recipient, pagination across more than one result page, and a poller restart after its checkpoint has been saved. Preserve the raw response permitted by policy, plus a normalized event, because mappings evolve and an auditor may need to see what the application actually received.

Avoid a feature-score total. A provider that excels at template editing but cannot meet the event-retention or regional evidence requirement is not suitable for this flow. Conversely, stick with an existing provider when it already meets the controls and migration would only replace a known operational boundary with a new one. The catch is that pull-only monitoring trades inbound exposure for detection delay and repeated read traffic. That can be the right trade, but it must be explicit.

## Build the evidence chain before the mail adapter

Model each transition as an append-only fact. The mutable “current status” is a projection for fast reads, not the audit record. For this contact form, a useful correlation key is generated before any external call and is reused by the routing command, the acknowledgement send intent, and every normalized delivery event. Don't use an email address as that key; addresses are personal data, can change, and don't identify a particular submission.

The adapter boundary can stay small:

```go
package mailflow

import (
	"context"
	"time"
)

type SendIntent struct {
	MessageKey string
	Recipient  string
	Template   string
	Region     string
}

type DeliveryEvent struct {
	ProviderMessageID string
	Kind              string
	OccurredAt        time.Time
	Cursor            string
}

type MailProvider interface {
	IsSuppressed(ctx context.Context, recipient string) (bool, error)
	Send(ctx context.Context, intent SendIntent) (providerMessageID string, err error)
	PollEvents(ctx context.Context, cursor string, limit int) ([]DeliveryEvent, error)
}
```

This interface deliberately says nothing about a vendor URL. It encodes the behavior the flow needs while leaving authentication, pagination tokens, and response shapes inside an adapter. The application should persist the send intent before calling `Send`, then bind the returned provider ID to the existing message key. If a worker loses its lease between the external call and that bind, the runbook needs a reconciliation action based on the message key or provider evidence. Blindly calling `Send` again is not a recovery plan.

Idempotency first.

Polling follows the same rule. Acquire one lease per account and region, request a bounded page from the last committed cursor, normalize and upsert each event by a stable event identity, then advance the cursor in the same local transaction. Process overlapping windows if the provider's ordering guarantee requires it; deduplication makes overlap safe. Never advance a checkpoint merely because the request completed. Advance it after all events on that page are durable.

The audit schema should answer a narrow set of questions without joining operational logs that may already have expired: who or what made the routing decision, which rule version was used, whether suppression was checked, which domain configuration was active, which provider message ID was returned, which delivery events were observed, and when the poller recorded them. Access to recipient data and raw payloads should be limited, and retention should follow the documented purpose rather than “keep everything.” For EU users, GDPR principles include purpose limitation, data minimisation, accuracy, storage limitation, integrity, and confidentiality. Region labels alone do not establish compliance.

## Instrument the transition that can still be fixed

Page on stuck work that requires an operator, not on every disappointing email outcome. The first useful metrics are the age of the oldest unassigned contact, the count of send intents without a provider ID, the age of the last successfully committed event cursor, and the number of normalized events that cannot be matched to an intent. Slice them by deployment, tenant region, and queue rule version, but keep recipient addresses out of metric labels.

For example, a team might warn when the oldest unassigned contact exceeds five minutes and page at fifteen minutes during staffed support hours. Those are sample thresholds, not universal targets. Establish them from the stated response objective, queue schedule, normal processing distribution, and acceptable detection delay. Then test the alert with a paused routing worker and a paused poller as two separate exercises. The first should page on assignment lag; the second should page on cursor age while leaving queue assignment healthy.

An alert should carry the correlation key, current projection, last durable transition, queue rule version, deployment identifier, and a link to the internal runbook. It should not include the message body. The first runbook decision is whether the contact was assigned. The second is whether the acknowledgement has a durable send intent and provider ID. Only then should an operator inspect delivery events. That order prevents a mail symptom from hiding the more important failure: nobody owns the contact.

SMS escalation needs its own consent, opt-out, and sender controls; email consent must not be treated as permission for text messaging. If the service adds an SMS fallback, review the current CTIA messaging principles and applicable legal requirements, and retain that channel's decision evidence separately.

Every tighter threshold buys earlier detection and spends attention. A one-minute page for a queue whose normal batch cadence is three minutes teaches the on-call to distrust the alarm. A sixty-minute threshold for a promised fifteen-minute response hides a breach until it is irreversible. Measure both sides: time from broken transition to detection, and pages that resolve without action.

The same tension applies to event polling. A short interval reduces observation lag but increases API reads and may amplify rate-limit pressure; a long interval reduces traffic while extending the period in which the internal projection is stale. There isn't one correct interval. Choose it from the response objective and documented API limits, add jitter across workers, and page on sustained cursor age rather than one late cycle.

Run the decision as a failure-mode review, not a procurement demo. Reject a candidate when custom-domain DKIM cannot satisfy the domain-control model, suppression cannot be checked before send, event polling cannot cover the recovery window, or required evidence cannot be retained in the permitted region. A webhook-first API may be a fine choice elsewhere, but it is not suitable when policy forbids inbound delivery callbacks and no equivalent pull path exists.

The final acceptance test is intentionally dull: submit one contact, assign exactly one queue, create one acknowledgement intent, observe one provider message ID, reconcile its events, and reproduce the chain from retained evidence. Then repeat after stopping and restarting each worker. If the record remains complete and no action is duplicated, the selection has cleared the operational bar. Price can break a tie after that; it cannot repair a missing audit trail.

## References

- DKIM Signatures, RFC 6376: https://www.rfc-editor.org/rfc/rfc6376
- GDPR principles relating to processing personal data, Article 5: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Resend documentation (an example of provider documentation to inspect during evaluation): https://resend.com/docs/introduction
- CTIA messaging interoperability and compliance best practices: https://www.ctia.org/the-wireless-industry/industry-commitments/messaging-interoperability-sms-mms

## Further reading

- Internet Message Format, RFC 5322: https://www.rfc-editor.org/rfc/rfc5322
- SMTP enhanced status codes, RFC 3463: https://www.rfc-editor.org/rfc/rfc3463
