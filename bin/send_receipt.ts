import { createInfraiEmail } from "../src/infrai_email.ts";
import { sendReceipt, type LogisticsOrder } from "../src/receipt_sender.ts";

const [recipientEmail, orderId, amountText, currency, trackingUrl] = process.argv.slice(2);
const amountMinor = Number(amountText);

if (!recipientEmail || !orderId || !Number.isInteger(amountMinor) || currency !== "USD" || !trackingUrl) {
  throw new Error(
    "usage: npm run send -- <email> <order-id> <amount-minor> USD <tracking-url>",
  );
}

const order: LogisticsOrder = {
  recipientEmail,
  orderId,
  amountMinor,
  currency,
  trackingUrl,
};

const infrai = createInfraiEmail(process.env.INFRAI_API_KEY ?? "");
const result = await sendReceipt(infrai, order);
console.log(`receipt sent: ${result.message_id}`);
