// Restrict ?next to an HTML page within the current app's mounted directory.
// This prevents redirects to external sites or unrelated API endpoints.
function safeLoginNext() {
  const fallback = 'ward.html';
  const raw = new URLSearchParams(location.search).get('next');
  if (!raw) return fallback;
  try {
    const base = new URL('.', location.href);
    const url = new URL(raw, base);
    if (url.origin !== base.origin) return fallback;
    if (!url.pathname.startsWith(base.pathname)) return fallback;
    if (!url.pathname.endsWith('.html')) return fallback;
    if (url.pathname === base.pathname + 'login.html') return fallback;
    return url.pathname + url.search + url.hash;
  } catch (_) {
    return fallback;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ENR.clearSession();

  if (new URLSearchParams(location.search).get('password_change_required') === '1') {
    const notice = document.getElementById('loginError');
    notice.textContent = 'บัญชีนี้ต้องเปลี่ยนรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อใช้ขั้นตอนเปลี่ยนรหัสผ่านที่ได้รับอนุญาต';
    notice.classList.add('show');
  }

  const form = document.getElementById('loginForm');
  const err = document.getElementById('loginError');
  const pw = document.getElementById('password');
  const toggle = document.getElementById('togglePassword');
  const submit = form.querySelector('button[type="submit"]');

  toggle.onclick = () => {
    pw.type = pw.type === 'password' ? 'text' : 'password';
    toggle.textContent = pw.type === 'password' ? 'แสดงรหัสผ่าน' : 'ซ่อนรหัสผ่าน';
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    err.classList.remove('show');
    const username = document.getElementById('username').value.trim();
    const password = pw.value;

    submit.disabled = true;
    submit.textContent = 'กำลังเข้าสู่ระบบ...';

    try {
      const result = await ENR.api.login(username, password);
      if (!result?.authenticated || !result?.session) {
        throw new Error('ไม่สามารถสร้าง Session ได้');
      }

      // Never grant a usable client session when the backend requires reset.
      // A password-change API is not included in this frontend-only repo.
      if (result.session.mustChangePassword) {
        throw new Error('บัญชีนี้ต้องเปลี่ยนรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อใช้ขั้นตอนเปลี่ยนรหัสผ่านที่ได้รับอนุญาต');
      }

      ENR.setSession(result.session);
      location.href = safeLoginNext();
    } catch (error) {
      err.textContent = error.message || 'เข้าสู่ระบบไม่สำเร็จ';
      err.classList.add('show');
    } finally {
      submit.disabled = false;
      submit.textContent = 'เข้าสู่ระบบ';
    }
  };
});
