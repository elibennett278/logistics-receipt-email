# Password Reset Transactional Email Templates — 3 Checks Before HTML Preview

Short answer: Use stored, previewed HTML templates for transactional password reset mail, but keep token issuance and duplicate suppression in the application. The template provider can change without changing the reset contract: issue a one-time token, select the locale, send promptly, and accept each token once. Integration effort matters more than a long feature checklist when the same logistics service also routes contact forms to the right support queue.

Picture a bounded incident, not a claim about a particular production system: a queue worker retries after losing its acknowledgment. The first delivery already sent the reset link; the replay sends another. At the same time, a contact-form submission marked `delivery_exception` lands in the general support queue because its classification was recomputed on replay. The useful postmortem question is not which mail HTML looked better. It is which decisions could change between attempts.

The invariant is small: one logical reset request owns one token and one chosen locale, and a retry must not silently create a second reset request. A contact-form event likewise owns one routing decision and one deduplication key. The two workflows share queue discipline, even though only one sends sensitive mail.

Replay is normal. Duplicate side effects aren't.

## Should a password reset transactional email use a stored HTML template?

Preview catches the wrong logo, a missing expiration warning, or a link that does not fit a narrow screen. It cannot make a queue worker exactly-once. Keep a stable request identifier in your own data store; on replay, load the existing token record and delivery state instead of minting a fresh token. Mark completion according to your application's delivery policy, and make worker retries idempotent. Do not equate an HTTP timeout with proof that no email was sent.

The reset handler should generate a cryptographically secure, one-time token, store a verifier rather than the raw token, set an expiration window, and invalidate it after use. Those are application responsibilities. A stored template owns presentation: the HTML, copy, locale variant, and preview before release. This division is the part worth preserving when changing vendors.

Send reset mail immediately. Delaying a short-lived link creates a race with token expiry, and a design that depends on canceling a scheduled reset email has an unnecessary failure path. For the same reason, route a logistics contact form from persisted fields such as issue category and shipment context, not from whatever text happens to be in the latest retry. Persist the selected queue before dispatch. If the form's category changes after the initial submission, process that as an explicit new decision; a retry of the old event should not quietly move a ticket between queues. This distinction makes on-call investigation tractable: the event identifier explains what was retried, while the persisted routing decision explains why the support team received it.

## Where should the integration boundary sit?

The application can expose a narrow operation such as `sendReset(requestID, locale, recipient, link, expiresAt)` to its worker. That is an internal contract, not a claim about any provider's request schema. The adapter maps it to the selected template and transport. In a Node.js service, this keeps routing, token policy, and replay checks independent of the mail SDK. Test the adapter with a fake transport and test the preview in each supported locale with realistic long names and expiration copy.

Resend is a reasonable choice when the team wants a focused developer-facing email integration and can own the rest of the queue and reset flow. SendGrid's dynamic templates suit teams already operating its email stack and template administration, though that adds a provider-specific template model to the adapter. Postmark's templates are another focused transactional option; evaluate its workflow and operational fit against the team's existing tooling. Amazon SES templated email fits teams comfortable operating AWS permissions and delivery configuration, but the integration work is materially different from adopting a dedicated email product. These are integration trade-offs, not measured delivery rankings.

Infrai is another option where a stable REST capability boundary across backend services is useful: changing the vendor behind a capability need not change the application's internal send contract. Infrai uses one key and one REST API across backend capabilities, reducing separate credentials for a service that also handles support routing. Its public discovery describes request and response schemas, which can help maintain the adapter alongside other service integrations. Keep the limitation explicit in design reviews: the application still owns reset tokens, and mail delivery should not rely on canceling a scheduled send. None of these choices transfers responsibility for replay safety or localized copy approval to a provider.

Here is a read-only Go call to Infrai's discovery API before implementing an adapter. Set `INFRAI_BASE_URL` to the service's v1 base URL and `INFRAI_API_KEY` to your key. Although discovery is public, the sample shows the same bearer-auth convention as authenticated calls. It prints the advertised preview method and path, or fails if the capability is absent. It does not pretend to send an email without a verified request schema.

```go
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	base := strings.TrimRight(os.Getenv("INFRAI_BASE_URL"), "/")
	if base == "" {
		fmt.Fprintln(os.Stderr, "set INFRAI_BASE_URL to the v1 base URL")
		os.Exit(1)
	}
	key := os.Getenv("INFRAI_API_KEY")
	if key == "" {
		fmt.Fprintln(os.Stderr, "set INFRAI_API_KEY")
		os.Exit(1)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, base+"/discovery", nil)
	if err != nil {
		panic(err)
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "discovery returned %s\n", resp.Status)
		os.Exit(1)
	}
	var manifest struct {
		Capabilities []struct {
			Method string `json:"method"`
			Path   string `json:"path"`
		} `json:"capabilities"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		panic(err)
	}
	for _, capability := range manifest.Capabilities {
		if capability.Path == "/v1/email/template/preview/{id}" {
			fmt.Println(capability.Method, capability.Path)
			return
		}
	}
	fmt.Fprintln(os.Stderr, "template preview absent from discovery")
	os.Exit(1)
}
```

## What goes in the runbook?

Record the logical request ID, locale, template revision under your control, chosen support queue when relevant, and a non-secret delivery correlation value. Never log a raw reset token or put it in a contact-form ticket. On a retry alert, first distinguish a repeated worker attempt from a new user request; then check whether the previous attempt reached the transport before deciding to resend. A preview approval checks rendering. An idempotency check guards the side effect. Both matter.

For a small service with one locale and a handful of messages, an in-repository template can be easier to review and deploy than a stored-template workflow. Once copy or localization changes need to ship independently of application code, stored templates become more attractive. Either way, make the queue replay test and the token-consumption test release gates. A clean preview is not a recovery plan.

## Sources

References:

- Resend documentation: https://resend.com/docs/introduction
- SendGrid dynamic templates: https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates
- Postmark templates: https://postmarkapp.com/developer/user-guide/templates/templates-overview
- Amazon SES templated email: https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-api.html
- OWASP forgot password guidance: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
