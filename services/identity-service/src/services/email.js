const { createHash, randomBytes } = require('node:crypto');
const nodemailer = require('nodemailer');

function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createEmailService(config = {}, { transport, logger = console } = {}) {
  const resolvedTransport = transport || createTransport(config);
  const appUrl = String(config.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const from = config.SMTP_FROM || config.SMTP_USER || 'no-reply@ecobazar.local';
  if (/[\r\n]/.test(from)) throw new Error('SMTP_FROM cannot contain line breaks');

  async function send({ to, subject, text, html }) {
    if (!resolvedTransport) {
      logger.warn?.(`[identity-service] email delivery disabled recipient=${to} subject=${subject}`);
      return { accepted: false, disabled: true };
    }

    return resolvedTransport.sendMail({ from, to, subject, text, html });
  }

  return {
    createToken: createOpaqueToken,
    hashToken,
    async sendVerificationEmail({ to, token }) {
      const link = `${appUrl}/verificar-email#token=${encodeURIComponent(token)}`;
      return send({
        to,
        subject: 'Confirma tu correo de EcoBazar',
        text: `Confirma tu correo abriendo este enlace: ${link}`,
        html: `<p>Confirma tu correo para activar tu cuenta de EcoBazar.</p><p><a href="${link}">Confirmar correo</a></p>`,
      });
    },
    async sendPasswordResetEmail({ to, token }) {
      const link = `${appUrl}/restablecer-contrasena#token=${encodeURIComponent(token)}`;
      return send({
        to,
        subject: 'Restablece tu contraseña de EcoBazar',
        text: `Restablece tu contraseña abriendo este enlace: ${link}`,
        html: `<p>Solicitaste restablecer tu contraseña de EcoBazar.</p><p><a href="${link}">Restablecer contraseña</a></p>`,
      });
    },
  };
}

function createTransport(config) {
  if (!config.SMTP_HOST) return null;

  const options = {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT || 587,
    secure: Number(config.SMTP_PORT) === 465,
    requireTLS: config.NODE_ENV === 'production' && Number(config.SMTP_PORT) !== 465,
    tls: { minVersion: 'TLSv1.2' },
  };
  if (config.SMTP_USER || config.SMTP_PASS) {
    options.auth = {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    };
  }
  return nodemailer.createTransport(options);
}

module.exports = {
  createEmailService,
  createOpaqueToken,
  hashToken,
};
