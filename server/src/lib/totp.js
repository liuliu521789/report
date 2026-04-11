import { authenticator } from 'otplib';

authenticator.options = { window: 1 };

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function verifyTotpToken(secret, token) {
  if (!secret || !token) return false;
  const t = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  try {
    return authenticator.verify({ token: t, secret });
  } catch {
    return false;
  }
}

export function totpKeyUri({ issuer, accountName, secret }) {
  return authenticator.keyuri(accountName, issuer, secret);
}
