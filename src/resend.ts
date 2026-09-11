const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_FROM = "Kompis Sverige Monitor <onboarding@resend.dev>";

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
};

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const from = payload.from || process.env.FROM_EMAIL || DEFAULT_FROM;
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend failed (${response.status}): ${body}`);
  }
}
