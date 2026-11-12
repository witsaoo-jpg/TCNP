(function () {
  const Admin = window.ENRAdmin = window.ENRAdmin || {};
  const appRoot = new URL('.', document.baseURI).pathname;

  async function fetchJson(path, options = {}) {
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

  Admin.isAdminSession = (session) => {
    const text = JSON.stringify(session?.serverContext || session?.userContext || session || {}).toUpperCase();
    return ['SUPER_ADMIN','HOSPITAL_ADMIN','GROUP_ADMIN','WARD_ADMIN','NURSING_ADMIN','"ADMIN"']
      .some((role) => text.includes(role));
  };

  Admin.guard = async () => {
    try {
      const session = await fetchJson('/api/auth/session');
      if (!session.authenticated) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`${appRoot}login.html?next=${next}`);
        return null;
      }
      if (session.mustChangePassword) {
        location.replace(`${appRoot}login.html?password_change_required=1`);
        return null;
      }

      const user = session.user || {};
      document.querySelectorAll('#adminUser').forEach((el) => {
        el.textContent = user.full_name_th || user.username || 'Admin';
      });

      const status = await fetchJson('/api/admin/auth/status');
      if (!status.eligible) {
        const message = document.getElementById('adminGuardMessage');
        if (message) {
          message.hidden = false;
          message.innerHTML = '<strong>ไม่มีสิทธิ์ Nursing Admin</strong><br>บัญชีนี้ยังใช้งาน Clinical และ Nursing Analytics ตามสิทธิ์เดิมได้ แต่ไม่สามารถจัดการ Master data ได้';
        }
        document.querySelectorAll('button,input,select,textarea,a.admin-module--primary').forEach((el) => {
          if (el.id === 'logoutBtn' || el.id === 'backWardBtn') return;
          el.disabled = true;
          el.setAttribute?.('aria-disabled', 'true');
        });
        return null;
      }

      if (!status.verified) {
        const next = encodeURIComponent(location.pathname + location.search + location.hash);
        location.replace(`${appRoot}admin/login.html?next=${next}`);
        return null;
      }

      return {
        appUserId: Number(user.id || 0) || null,
        username: user.username || '',
        displayName: user.full_name_th || user.username || 'Admin',
        serverContext: session.userContext || {},
        adminAuth: status,
      };
    } catch (error) {
      if (error.status === 401) {
        location.replace(`${appRoot}login.html`);
        return null;
      }
      const message = document.getElementById('adminGuardMessage');
      if (message) {
        message.hidden = false;
        message.innerHTML = `<strong>ตรวจสอบสิทธิ์ Admin ไม่สำเร็จ</strong><br>${Admin.escape(error.message || '')}`;
      }
      return null;
    }
  };

  Admin.bindChrome = () => {
    document.getElementById('backWardBtn')?.addEventListener('click', () => { location.href = `${appRoot}ward.html`; });
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      try { await fetchJson('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
      location.href = `${appRoot}login.html`;
    });
  };

  Admin.exitAdminMode = async () => {
    try { await fetchJson('/api/admin/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    location.href = `${appRoot}ward.html`;
  };

  Admin.escape = value => ENR?.escape ? ENR.escape(value) : String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  Admin.clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  Admin.makeId = prefix => `${prefix || 'TMP'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  Admin.formatDate = value => value ? (ENR?.formatThaiDateTime ? ENR.formatThaiDateTime(value) : new Date(value).toLocaleString('th-TH')) : '-';

  Admin.apiError = (error, fallback = 'เกิดข้อผิดพลาด') => {
    if (error?.code === 'ADMIN_REAUTH_REQUIRED') {
      const next = encodeURIComponent(location.pathname + location.search + location.hash);
      setTimeout(() => location.replace(`${appRoot}admin/login.html?next=${next}`), 0);
      return 'สิทธิ์ Admin หมดอายุ กรุณายืนยันรหัสผ่าน Admin อีกครั้ง';
    }
    if (error?.status === 403 || error?.code === 'ADMIN_REQUIRED') return 'บัญชีนี้ยังไม่มีสิทธิ์ Nursing Admin';
    return String(error?.message || fallback);
  };
})();
