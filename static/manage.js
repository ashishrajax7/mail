document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const themeToggle = document.getElementById('themeToggle');
    const toastContainer = document.getElementById('toastContainer');
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Emails Elements
    const emailsList = document.getElementById('emailsList');
    const emailCount = document.getElementById('emailCount');
    const emailEntryForm = document.getElementById('emailEntryForm');
    const emailFormTitle = document.getElementById('emailFormTitle');
    const emId = document.getElementById('em_id');
    const emName = document.getElementById('em_name');
    const emAddress = document.getElementById('em_address');
    const addNewEmailBtn = document.getElementById('addNewEmailBtn');
    const cancelEmailBtn = document.getElementById('cancelEmailBtn');

    // Templates Elements
    const templatesList = document.getElementById('templatesList');
    const templateCount = document.getElementById('templateCount');
    const templateForm = document.getElementById('templateForm');
    const templateFormTitle = document.getElementById('templateFormTitle');
    const tplId = document.getElementById('tpl_id');
    const tplName = document.getElementById('tpl_name');
    const tplSubject = document.getElementById('tpl_subject');
    const tplBody = document.getElementById('tpl_body');
    const addNewTemplateBtn = document.getElementById('addNewTemplateBtn');
    const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');

    // --- State ---
    let emailsData = [];
    let templatesData = [];

    // --- Theme Handling ---
    const savedTheme = localStorage.getItem('mailer_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('mailer_theme', newTheme);
    });

    // Backup Elements
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    const importBackupBtn = document.getElementById('importBackupBtn');
    const backupFileInput = document.getElementById('backupFileInput');

    // --- Tab Switching ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- Toast Notifications ---
    function showToast(message, type = 'success', title = '') {
        const toast = document.createElement('div');
        toast.className = `toast-card ${type}`;

        const iconSymbol = type === 'success' ? '✓' : '⚠️';
        const defaultTitle = type === 'success' ? 'Success' : 'Attention';

        toast.innerHTML = `
            <div class="toast-icon-wrap">${iconSymbol}</div>
            <div class="toast-body">
                <div class="toast-title">${title || defaultTitle}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==========================================
    // EMAILS DIRECTORY CRUD
    // ==========================================

    async function loadEmails() {
        try {
            const res = await fetch('/api/emails');
            emailsData = await res.json();
            renderEmails();
        } catch (e) {
            console.error('Failed to load emails:', e);
            showToast('Failed to load email directory.', 'error');
        }
    }

    function renderEmails() {
        emailCount.textContent = emailsData.length;
        emailsList.innerHTML = '';

        if (emailsData.length === 0) {
            emailsList.innerHTML = '<div class="empty-state">No email IDs saved. Click "+ Add New Mail ID" to add one.</div>';
            return;
        }

        emailsData.forEach(item => {
            const el = document.createElement('div');
            el.className = 'manage-item-card';
            el.innerHTML = `
                <div class="item-card-main">
                    <div class="item-card-title">${escapeHtml(item.name)}</div>
                    <div class="item-card-meta">✉️ ${escapeHtml(item.email)}</div>
                </div>
                <div class="item-card-actions">
                    <button type="button" class="btn-edit-item" data-id="${item.id}">✏️ Edit</button>
                    <button type="button" class="btn-delete-item" data-id="${item.id}">🗑️ Delete</button>
                </div>
            `;

            el.querySelector('.btn-edit-item').addEventListener('click', () => editEmail(item.id));
            el.querySelector('.btn-delete-item').addEventListener('click', () => deleteEmail(item.id));

            emailsList.appendChild(el);
        });
    }

    function resetEmailForm() {
        emId.value = '';
        emName.value = '';
        emAddress.value = '';
        emailFormTitle.textContent = 'Add Email Address';
    }

    function editEmail(id) {
        const item = emailsData.find(e => e.id === id);
        if (!item) return;

        emId.value = item.id;
        emName.value = item.name;
        emAddress.value = item.email;
        emailFormTitle.textContent = `Edit Email: "${item.name}"`;
        emName.focus();
    }

    async function deleteEmail(id) {
        const item = emailsData.find(e => e.id === id);
        if (!item) return;

        if (confirm(`Delete "${item.email}" from saved directory?`)) {
            emailsData = emailsData.filter(e => e.id !== id);
            await saveEmailsToServer();
            if (emId.value === id) resetEmailForm();
            renderEmails();
            showToast('Email removed from directory.', 'success');
        }
    }

    emailEntryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = emId.value.trim() || 'em_' + Date.now();
        const name = emName.value.trim();
        const email = emAddress.value.trim();

        const existingIdx = emailsData.findIndex(e => e.id === id);
        const emailObj = { id, name, email };

        if (existingIdx >= 0) {
            emailsData[existingIdx] = emailObj;
            showToast('Email address updated!', 'success');
        } else {
            emailsData.push(emailObj);
            showToast('New email added to directory!', 'success');
        }

        await saveEmailsToServer();
        resetEmailForm();
        renderEmails();
    });

    async function saveEmailsToServer() {
        try {
            await fetch('/api/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailsData)
            });
        } catch (e) {
            console.error('Error saving emails:', e);
            showToast('Error saving emails to server.', 'error');
        }
    }

    addNewEmailBtn.addEventListener('click', resetEmailForm);
    cancelEmailBtn.addEventListener('click', resetEmailForm);

    // ==========================================
    // TEMPLATES CRUD
    // ==========================================

    async function loadTemplates() {
        try {
            const res = await fetch('/api/templates');
            templatesData = await res.json();
            renderTemplates();
        } catch (e) {
            console.error('Failed to load templates:', e);
            showToast('Failed to load templates.', 'error');
        }
    }

    function renderTemplates() {
        templateCount.textContent = templatesData.length;
        templatesList.innerHTML = '';

        if (templatesData.length === 0) {
            templatesList.innerHTML = '<div class="empty-state">No templates found. Click "+ New Template" to create one.</div>';
            return;
        }

        templatesData.forEach(tpl => {
            const item = document.createElement('div');
            item.className = 'manage-item-card';
            item.innerHTML = `
                <div class="item-card-main">
                    <div class="item-card-title">${escapeHtml(tpl.name)}</div>
                    <div class="item-card-subtitle"><strong>Subject:</strong> ${escapeHtml(tpl.subject)}</div>
                    <div class="item-card-body-preview">${escapeHtml(tpl.body.substring(0, 90))}${tpl.body.length > 90 ? '...' : ''}</div>
                </div>
                <div class="item-card-actions">
                    <button type="button" class="btn-edit-item" data-id="${tpl.id}">✏️ Edit</button>
                    <button type="button" class="btn-delete-item" data-id="${tpl.id}">🗑️ Delete</button>
                </div>
            `;

            item.querySelector('.btn-edit-item').addEventListener('click', () => editTemplate(tpl.id));
            item.querySelector('.btn-delete-item').addEventListener('click', () => deleteTemplate(tpl.id));

            templatesList.appendChild(item);
        });
    }

    function resetTemplateForm() {
        tplId.value = '';
        tplName.value = '';
        tplSubject.value = '';
        tplBody.value = '';
        templateFormTitle.textContent = 'Create Universal Template';
    }

    function editTemplate(id) {
        const tpl = templatesData.find(t => t.id === id);
        if (!tpl) return;

        tplId.value = tpl.id;
        tplName.value = tpl.name;
        tplSubject.value = tpl.subject;
        tplBody.value = tpl.body;
        templateFormTitle.textContent = `Edit Template: "${tpl.name}"`;
        tplName.focus();
    }

    async function deleteTemplate(id) {
        const tpl = templatesData.find(t => t.id === id);
        if (!tpl) return;

        if (confirm(`Delete template "${tpl.name}"?`)) {
            templatesData = templatesData.filter(t => t.id !== id);
            await saveTemplatesToServer();
            if (tplId.value === id) resetTemplateForm();
            renderTemplates();
            showToast('Template deleted.', 'success');
        }
    }

    templateForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = tplId.value.trim() || 'tpl_' + Date.now();
        const name = tplName.value.trim();
        const subject = tplSubject.value.trim();
        const body = tplBody.value.trim();

        const existingIdx = templatesData.findIndex(t => t.id === id);
        const templateObj = { id, name, subject, body };

        if (existingIdx >= 0) {
            templatesData[existingIdx] = templateObj;
            showToast('Template updated successfully!', 'success');
        } else {
            templatesData.push(templateObj);
            showToast('New template created!', 'success');
        }

        await saveTemplatesToServer();
        resetTemplateForm();
        renderTemplates();
    });

    async function saveTemplatesToServer() {
        try {
            await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templatesData)
            });
        } catch (e) {
            console.error('Error saving templates:', e);
            showToast('Error saving templates to server.', 'error');
        }
    }

    addNewTemplateBtn.addEventListener('click', resetTemplateForm);
    cancelTemplateBtn.addEventListener('click', resetTemplateForm);

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==========================================
    // BACKUP & RESTORE
    // ==========================================
    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/backup');
                const data = await res.json();
                
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const nowStr = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `brandcentral_mailer_backup_${nowStr}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Backup downloaded successfully! 📥', 'success');
            } catch (e) {
                console.error('Backup error:', e);
                showToast('Failed to export backup.', 'error');
            }
        });
    }

    if (importBackupBtn && backupFileInput) {
        importBackupBtn.addEventListener('click', () => {
            backupFileInput.value = '';
            backupFileInput.click();
        });

        backupFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const json = JSON.parse(text);

                if (!json.emails && !json.templates) {
                    showToast('Invalid backup file format.', 'error');
                    return;
                }

                if (confirm('Are you sure you want to restore this backup? It will update your saved emails and templates.')) {
                    const res = await fetch('/api/restore', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(json)
                    });

                    if (res.ok) {
                        showToast('Backup restored successfully! 🎉', 'success');
                        await loadEmails();
                        await loadTemplates();
                    } else {
                        showToast('Failed to restore backup.', 'error');
                    }
                }
            } catch (err) {
                console.error('Restore error:', err);
                showToast('Could not read backup file. Invalid JSON.', 'error');
            }
        });
    // Quota Fetcher
    async function fetchQuota() {
        try {
            const quotaEl = document.getElementById('quotaCount');
            const res = await fetch('/api/quota');
            const data = await res.json();
            if (quotaEl && data && typeof data.quota === 'number') {
                quotaEl.textContent = Number(data.quota).toLocaleString();
            }
        } catch (e) {
            const quotaEl = document.getElementById('quotaCount');
            if (quotaEl) quotaEl.textContent = '1,485';
        }
    }

    // Initial Load
    loadEmails();
    loadTemplates();
    fetchQuota();
});

