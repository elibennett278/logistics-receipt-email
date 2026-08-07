import type { SendEmailInput, SendEmailResult } from "./infrai_email.ts";

export type LogisticsOrder = {
  orderId: string;
  recipientEmail: string;
  amountMinor: number;
  currency: "USD";
  trackingUrl: string;
};

type EmailPort = {
  email: {
    send(input: SendEmailInput, idempotencyKey: string): Promise<SendEmailResult>;
  };
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function receiptDeliveryKey(orderId: string): string {
  return `logistics-receipt:${orderId}`;
}

export function buildReceiptEmail(order: LogisticsOrder): SendEmailInput {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: order.currency,
  }).format(order.amountMinor / 100);

  const orderId = escapeHtml(order.orderId);
  const trackingUrl = escapeHtml(order.trackingUrl);

  return {
    to: order.recipientEmail,
    subject: `Receipt for order ${order.orderId}`,
    html: `<h1>Order receipt</h1><p>Order <strong>${orderId}</strong> was confirmed for ${amount}.</p><p><a href="${trackingUrl}">Track this shipment</a></p>`,
  };
}

export async function sendReceipt(
  infrai: EmailPort,
  order: LogisticsOrder,
): Promise<SendEmailResult> {
  return infrai.email.send(buildReceiptEmail(order), receiptDeliveryKey(order.orderId));
}
