import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SECURITY_SETTINGS,
  mergeSettings,
  validatePasswordPlain
} from './securityPolicy.js';
import { validateProductionConfig } from './productionConfig.js';

describe('Security Policy', () => {
  describe('mergeSettings', () => {
    it('should return default settings when no raw data', () => {
      const result = mergeSettings(null);
      expect(result).toEqual(DEFAULT_SECURITY_SETTINGS);
    });

    it('should merge valid settings while respecting bounds', () => {
      const raw = {
        minPasswordLength: 12,
        loginFailMaxAttempts: 10,
        bannedPasswords: ['test123', 'admin123'],
        idleTimeoutMinutes: 30
      };
      const result = mergeSettings(raw);

      expect(result.minPasswordLength).toBe(12);
      expect(result.loginFailMaxAttempts).toBe(10);
      expect(result.bannedPasswords).toContain('test123');
      expect(result.idleTimeoutMinutes).toBe(30);
      // Should keep defaults for unset
      expect(result.errorLogRetentionDays).toBe(DEFAULT_SECURITY_SETTINGS.errorLogRetentionDays);
    });

    it('should clamp values to valid ranges', () => {
      const raw = {
        minPasswordLength: 3, // too small
        loginFailMaxAttempts: 30, // too large
      };
      const result = mergeSettings(raw);

      expect(result.minPasswordLength).toBe(DEFAULT_SECURITY_SETTINGS.minPasswordLength);
      expect(result.loginFailMaxAttempts).toBe(DEFAULT_SECURITY_SETTINGS.loginFailMaxAttempts);
    });
  });

  describe('validatePasswordPlain', () => {
    it('should reject short passwords', () => {
      const settings = { minPasswordLength: 8, bannedPasswords: [] };
      const result = validatePasswordPlain('short', settings);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('PASSWORD_TOO_SHORT');
    });

    it('should reject banned passwords', () => {
      const settings = { 
        minPasswordLength: 6, 
        bannedPasswords: ['password', 'admin'] 
      };
      const result = validatePasswordPlain('password', settings);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('PASSWORD_TOO_SIMPLE');
    });

    it('should accept strong password', () => {
      const settings = { minPasswordLength: 8, bannedPasswords: ['123456'] };
      const result = validatePasswordPlain('StrongPass123!', settings);
      expect(result.ok).toBe(true);
    });
  });
});

describe('Production Config Validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should pass in development even with weak config', () => {
    const env = {
      NODE_ENV: 'development',
      ENABLE_API_DOCS: 'true',
      JWT_SECRET: 'weak',
      MYSQL_PASSWORD: 'admin'
    };
    const result = validateProductionConfig(env);
    expect(result.ok).toBe(true);
    expect(result.isProd).toBe(false);
  });

  it('should fail production with weak JWT_SECRET', () => {
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'abc123weak',
      MYSQL_PASSWORD: 'StrongPass1234567890!',
      ENABLE_API_DOCS: 'false',
      PUBLIC_BASE_URL: 'https://example.com'
    };
    const result = validateProductionConfig(env);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.includes('JWT_SECRET'))).toBe(true);
  });

  it('should pass with strong production config', () => {
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'super-strong-secret-key-32-chars-minimum-for-jwt-123456',
      MYSQL_PASSWORD: 'X7kP9mQ2vR5tY8uZ4wN6bH3jL9qW1eS0!',
      ENABLE_API_DOCS: 'false',
      PUBLIC_BASE_URL: 'https://api.example.com'
    };
    const result = validateProductionConfig(env);
    expect(result.ok).toBe(true);
    expect(result.isProd).toBe(true);
  });
});
