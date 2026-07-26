import nodemailer, { type Transporter } from "nodemailer";
import type { MailerPort } from "@/modules/auth/service/ports";

// Implementação REAL do MailerPort (M1) por SMTP. Substitui o console mailer.
export function createSmtpMailer(
  transporter: Transporter,
  opts: { from: string; baseUrl: string },
): MailerPort {
  return {
    async sendResetLink(email: string, token: string) {
      const link = `${opts.baseUrl}/definir-password?token=${encodeURIComponent(token)}`;
      await transporter.sendMail({
        from: opts.from,
        to: email,
        subject: "Recuperação de acesso",
        text: `Para definir uma nova password, abra: ${link}\nO link expira em breve e só pode ser usado uma vez.`,
      });
    },
  };
}

// Fábrica do transporter a partir de variáveis de ambiente.
export function smtpTransporterFromEnv(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}
