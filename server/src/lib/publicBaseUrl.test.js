import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diagnosePublicBaseUrl,
  pickBestLanIPv4,
  resolveConfiguredPublicBaseUrl,
  resolvePublicBaseUrl
} from './publicBaseUrl.js';

test('resolveConfiguredPublicBaseUrl auto-corrects wrong LAN IP', () => {
  const prev = process.env.PUBLIC_BASE_URL;
  const prevPort = process.env.PORT;
  process.env.PUBLIC_BASE_URL = 'http://192.168.110.7:3001';
  process.env.PORT = '3001';
  try {
    const effective = resolveConfiguredPublicBaseUrl();
    const lan = pickBestLanIPv4();
    if (lan && lan !== '192.168.110.7') {
      assert.equal(effective, `http://${lan}:3001`);
    } else {
      assert.match(effective, /^http:\/\//);
    }
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
    if (prevPort === undefined) delete process.env.PORT;
    else process.env.PORT = prevPort;
  }
});

test('resolveConfiguredPublicBaseUrl keeps public domain', () => {
  const prev = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://report.example.com';
  try {
    assert.equal(resolveConfiguredPublicBaseUrl(), 'https://report.example.com');
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
  }
});

test('resolvePublicBaseUrl prefers request host when not loopback', () => {
  const req = {
    protocol: 'http',
    get: (name) => (name === 'host' ? '203.0.113.10:3001' : ''),
    headers: {}
  };
  assert.equal(resolvePublicBaseUrl(req), 'http://203.0.113.10:3001');
});

test('resolvePublicBaseUrl uses configured LAN when host is loopback', () => {
  const prev = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'http://192.168.110.6:3001';
  try {
    const req = {
      protocol: 'http',
      get: (name) => (name === 'host' ? '127.0.0.1:3001' : ''),
      headers: {}
    };
    assert.equal(resolvePublicBaseUrl(req), 'http://192.168.110.6:3001');
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
  }
});

test('diagnosePublicBaseUrl reports mismatch', () => {
  const prev = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'http://192.168.110.7:3001';
  try {
    const diag = diagnosePublicBaseUrl();
    assert.equal(typeof diag.message, 'string');
    assert.equal(typeof diag.effective, 'string');
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
  }
});
