(() => {
  const $ = (id) => document.getElementById(id);

  function safeNext() {
    const raw = new URLSearchParams(location.search).get('next') || '/v3/admin/';
    try {
      const url = new URL(raw, location.origin);
      if (url.origin !== location.origin) return '/v3/admin/';
      if (!url.pathname.startsWith('/v3/admin/')) return '/v3/admin/';
      if (url.pathname === '/v3/admin/login.html') return '/v3/admin/';
      return url.pathname + url.search + url.hash;
    } catch {
      return '/v3/admin/';
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      const error = new Error(body.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = body.code || null;
      error.payload = body;
      throw error;
    }
    return body;
  }

  function message(text, kind = 'danger') {
    const box = $('authMessage');
    box.hidden = !text;
    box.className = `admin-alert admin-alert--${kind}`;
    box.textContent = text || '';
  }

  function setBusy(form, busy) {
    form.querySelectorAll('input,button').forEach((el) => { el.disabled = busy; });
  }

  function showMode(status) {
    $('verifyForm').hidden = true;
    $('setupForm').hidden = true;
    $('notEligible').hidden = true;

    if (!status.eligible) {
      $('notEligible').hidden = false;
      return;
    }
    if (status.verified) {
      location.replace(safeNext());
      return;
    }
    if (status.configured) {
      $('verifyForm').hidden = false;
      $('adminPassword').focus();
    } else {
      $('setupForm').hidden = false;
      $('currentEnrPassword').focus();
    }
  }

  async function boot() {
    try {
      const session = await api('/api/auth/session');
      if (!session.authenticated) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`/v3/login.html?next=${next}`);
        return;
      }
      if (session.mustChangePassword) {
        location.replace('/v3/change-password.html');
        return;
      }

      const user = session.user || {};
      $('currentAdminUser').textContent = user.full_name_th || user.username || 'ผู้ใช้งาน';

      const status = await api('/api/admin/auth/status');
      $('currentAdminRoles').textContent = (status.roles || []).join(' • ') || 'NURSE';
      showMode(status);
    } catch (error) {
      if (error.status === 401) {
        location.replace('/v3/login.html');
        return;
      }
      message(error.message || 'ไม่สามารถตรวจสอบสิทธิ์ Admin ได้');
    }
  }

  $('verifyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    message('');
    setBusy(form, true);
    try {
      await api('/api/admin/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ admin_password: $('adminPassword').value }),
      });
      location.replace(safeNext());
    } catch (error) {
      const lock = error.payload?.locked_until
        ? ` (ล็อกถึง ${new Date(error.payload.locked_until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })})`
        : '';
      message(`${error.message || 'ยืนยันรหัส Admin ไม่สำเร็จ'}${lock}`);
      $('adminPassword').value = '';
      $('adminPassword').focus();
    } finally {
      setBusy(form, false);
    }
  });

  $('setupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    message('');
    const adminPassword = $('newAdminPassword').value;
    const confirmPassword = $('confirmAdminPassword').value;
    if (adminPassword !== confirmPassword) {
      message('ยืนยันรหัสผ่าน Admin ไม่ตรงกัน');
      return;
    }
    setBusy(form, true);
    try {
      await api('/api/admin/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          current_password: $('currentEnrPassword').value,
          admin_password: adminPassword,
          confirm_password: confirmPassword,
        }),
      });
      location.replace(safeNext());
    } catch (error) {
      message(error.message || 'ตั้งรหัสผ่าน Admin ไม่สำเร็จ');
    } finally {
      setBusy(form, false);
    }
  });

  $('backWardBtn').addEventListener('click', () => { location.href = '/v3/ward.html'; });
  $('deniedBackWard').addEventListener('click', () => { location.href = '/v3/ward.html'; });
  $('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    location.replace('/v3/login.html');
  });

  boot();
})();
