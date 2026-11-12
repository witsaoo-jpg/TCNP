document.addEventListener('DOMContentLoaded', async () => {
  ENRAdmin.bindChrome();
  const session = await ENRAdmin.guard();
  if (!session) return;
  try {
    await ENR.api.adminListTemplates('');
  } catch (error) {
    const box = document.getElementById('adminGuardMessage');
    box.hidden = false;
    box.innerHTML = `<strong>Admin API ยังไม่พร้อม</strong><br>${ENRAdmin.escape(ENRAdmin.apiError(error))}`;
  }
});
