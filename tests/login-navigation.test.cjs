'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/pages/login.js'), 'utf8');

function boot(next, result = { authenticated: true, session: { username: 'demo', mustChangePassword: false } }, mount = '/v3/') {
  const loginUrl = new URL(`https://example.test${mount}login.html${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  const calls = { sessions: [], cleared: 0 };
  const loginError = { textContent: '', classList: { add() {}, remove() {} } };
  const submit = { disabled: false, textContent: '' };
  const form = { querySelector() { return submit; }, onsubmit: null };
  const password = { value: 'placeholder', type: 'password' };
  const toggle = { textContent: '', onclick: null };
  const username = { value: 'test-nurse' };
  const ids = { loginForm: form, loginError, password, togglePassword: toggle, username };
  const location = { href: loginUrl.href, origin: loginUrl.origin, pathname: loginUrl.pathname, search: loginUrl.search };
  const ENR = {
    clearSession() { calls.cleared++; },
    setSession(session) { calls.sessions.push(session); },
    api: { async login() { return result; } },
  };
  const document = {
    getElementById(id) { return ids[id]; },
    addEventListener(event, listener) { assert.equal(event, 'DOMContentLoaded'); listener(); },
  };
  vm.runInNewContext(source, { document, location, ENR, URL, URLSearchParams, Error });
  return { location, form, calls, loginError };
}

for (const [label, target, expected] of [
  ['no next', null, 'ward.html'],
  ['same app admin page', '/v3/admin/index.html', '/v3/admin/index.html'],
  ['same app ward page', 'patient_list.html', '/v3/patient_list.html'],
  ['external https', 'https://attacker.example/steal', 'ward.html'],
  ['scheme relative', '//attacker.example/steal', 'ward.html'],
  ['javascript scheme', 'javascript:alert(1)', 'ward.html'],
  ['outside mounted app', '/outside/index.html', 'ward.html'],
  ['API route', '/v3/api/auth/logout', 'ward.html'],
  ['login recursion', '/v3/login.html', 'ward.html'],
]) {
  test(`safe login redirect: ${label}`, async () => {
    const app = boot(target);
    await app.form.onsubmit({ preventDefault() {} });
    assert.equal(app.location.href, expected);
    assert.equal(app.calls.sessions.length, 1);
  });
}

test('password-reset required never grants a client session or redirects to a missing page', async () => {
  const app = boot('/v3/admin/index.html', { authenticated: true, session: { mustChangePassword: true } });
  await app.form.onsubmit({ preventDefault() {} });
  assert.equal(app.calls.sessions.length, 0);
  assert.match(app.loginError.textContent, /เปลี่ยนรหัสผ่าน/);
  assert.equal(app.location.href, 'https://example.test/v3/login.html?next=%2Fv3%2Fadmin%2Findex.html');
});

test('root-mounted local preview redirect stays within root', async () => {
  const app = boot('/admin/index.html', undefined, '/');
  await app.form.onsubmit({ preventDefault() {} });
  assert.equal(app.location.href, '/admin/index.html');
});
