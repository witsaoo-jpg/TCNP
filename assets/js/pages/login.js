document.addEventListener('DOMContentLoaded', () => {
  ENR.clearSession();

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

      ENR.setSession(result.session);

      if (result.session.mustChangePassword) {
        location.href = '../change-password.html';
        return;
      }

      const next = new URLSearchParams(location.search).get('next');
      location.href = next || 'ward.html';
    } catch (error) {
      err.textContent = error.message || 'เข้าสู่ระบบไม่สำเร็จ';
      err.classList.add('show');
    } finally {
      submit.disabled = false;
      submit.textContent = 'เข้าสู่ระบบ';
    }
  };
});
