import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceiptEmail,
  receiptDeliveryKey,
  sendReceipt,
  type LogisticsOrder,
} from "../src/receipt_sender.ts";

const order: LogisticsOrder = {
  orderId: "ORD-1042",
  recipientEmail: "customer@example.com",
  amountMinor: 4999,
  currency: "USD",
  trackingUrl: "https://track.example.com/ORD-1042",
};

test("builds and sends a receipt with a stable order key", async () => {
  const calls: unknown[] = [];
  const fakeInfrai = {
    email: {
      async send(input: unknown, idempotencyKey: string) {
        calls.push({ input, idempotencyKey });
        return { message_id: "msg_test_1042" };
      },
    },
  };

  const result = await sendReceipt(fakeInfrai, order);

  assert.equal(result.message_id, "msg_test_1042");
  assert.deepEqual(calls, [
    {
      input: buildReceiptEmail(order),
      idempotencyKey: "logistics-receipt:ORD-1042",
    },
  ]);
  assert.equal(receiptDeliveryKey(order.orderId), "logistics-receipt:ORD-1042");
  assert.match(buildReceiptEmail(order).html, /\$49\.99/);
});
