document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // STATE & DATA POOLS
    // =========================================================================
    let templatesData = [];
    let emailsData = [];
    
    // Single Mode Attachments
    let singleFiles = [];

    // Batch Mode Attachments
    const batchFiles = {
        ajio: [],
        myntra: [],
        flipkart: []
    };

    const senderDisplayMap = {
        ajio: {
            badge: 'AJIO',
            fullName: 'Easysell-Surat Billing.ajio(Brand Central)',
            email: 'billing.ajio@brandcentral.in',
            colorClass: 'ajio'
        },
        myntra: {
            badge: 'MYNTRA',
            fullName: 'Easysell-Surat Billing.myntra(Brand Central)',
            email: 'billing.myntra@brandcentral.in',
            colorClass: 'myntra'
        },
        flipkart: {
            badge: 'FLIPKART',
            fullName: 'Billing.Flipkart',
            email: 'billing.flipkart@brandcentral.in',
            colorClass: 'flipkart'
        }
    };

    // =========================================================================
    // THEME HANDLING
    // =========================================================================
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('mailer_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('mailer_theme', newTheme);
        });
    }

    // =========================================================================
    // MODE SWITCHER: SINGLE vs MULTI-ACCOUNT BATCH
    // =========================================================================
    const btnModeSingle = document.getElementById('btnModeSingle');
    const btnModeBatch = document.getElementById('btnModeBatch');
    const singleModeView = document.getElementById('singleModeView');
    const multiModeView = document.getElementById('multiModeView');

    btnModeSingle.addEventListener('click', () => {
        btnModeSingle.classList.add('active');
        btnModeBatch.classList.remove('active');
        singleModeView.style.display = 'flex';
        multiModeView.style.display = 'none';
    });

    btnModeBatch.addEventListener('click', () => {
        btnModeBatch.classList.add('active');
        btnModeSingle.classList.remove('active');
        singleModeView.style.display = 'none';
        multiModeView.style.display = 'flex';
    });

    // =========================================================================
    // TOAST NOTIFICATIONS & HELPERS
    // =========================================================================
    const toastContainer = document.getElementById('toastContainer');

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
        }, 4500);
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getEmailsFromInput(inputEl) {
        if (!inputEl) return [];
        return inputEl.value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }

    function setEmailsToInput(inputEl, emailsArr) {
        if (!inputEl) return;
        inputEl.value = emailsArr.join(', ');
    }

    // =========================================================================
    // UNIVERSAL MULTI-SELECT CHECKBOX ENGINE (Used across Single & Batch modes)
    // =========================================================================
    function initAllMultiSelectWrappers() {
        const wrappers = document.querySelectorAll('.multiselect-wrapper');

        wrappers.forEach(wrapper => {
            const targetInputId = wrapper.getAttribute('data-target-input');
            const targetInput = document.getElementById(targetInputId);
            const btn = wrapper.querySelector('.multiselect-btn');
            const dropdown = wrapper.querySelector('.multiselect-dropdown');
            const searchInput = wrapper.querySelector('.popover-search-input');
            const selectAllBtn = wrapper.querySelector('.btn-select-all');
            const clearAllBtn = wrapper.querySelector('.btn-clear-all');
            const listEl = wrapper.querySelector('.checkbox-list');
            const applyBtn = wrapper.querySelector('.btn-popover-apply');
            const badgeCount = wrapper.querySelector('.badge-count');

            if (!btn || !dropdown || !targetInput) return;

            // Toggle Popover
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other open popovers
                document.querySelectorAll('.multiselect-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('open');
                });

                const isOpen = dropdown.classList.toggle('open');
                if (isOpen) {
                    if (searchInput) searchInput.value = '';
                    renderCheckboxesList(listEl, targetInput, badgeCount);
                    if (searchInput) searchInput.focus();
                }
            });

            // Prevent popover clicks from bubbling
            dropdown.addEventListener('click', (e) => e.stopPropagation());

            // Search Filter
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.toLowerCase().trim();
                    listEl.querySelectorAll('.checkbox-item').forEach(it => {
                        const txt = it.getAttribute('data-search').toLowerCase();
                        it.style.display = txt.includes(q) ? 'flex' : 'none';
                    });
                });
            }

            // Select All
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => {
                    let current = getEmailsFromInput(targetInput);
                    listEl.querySelectorAll('.checkbox-item:not([style*="display: none"]) input[type="checkbox"]').forEach(cb => {
                        cb.checked = true;
                        if (!current.includes(cb.value)) current.push(cb.value);
                    });
                    setEmailsToInput(targetInput, current);
                    updateBadge(badgeCount, current.length);
                });
            }

            // Clear All
            if (clearAllBtn) {
                clearAllBtn.addEventListener('click', () => {
                    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                    setEmailsToInput(targetInput, []);
                    updateBadge(badgeCount, 0);
                });
            }

            // Apply & Close
            if (applyBtn) {
                applyBtn.addEventListener('click', () => {
                    dropdown.classList.remove('open');
                });
            }

            // Update badge on manual typing
            targetInput.addEventListener('input', () => {
                updateBadge(badgeCount, getEmailsFromInput(targetInput).length);
            });
        });

        // Click outside closes all open dropdowns
        document.addEventListener('click', () => {
            document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('open'));
        });
    }

    function renderCheckboxesList(listEl, targetInput, badgeCount) {
        if (!listEl) return;
        const currentEmails = getEmailsFromInput(targetInput);
        listEl.innerHTML = '';

        if (emailsData.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px; font-size: 11px; color: var(--text-muted); text-align: center;">No saved emails found.</div>';
            return;
        }

        emailsData.forEach(item => {
            const isChecked = currentEmails.includes(item.email);
            const row = document.createElement('label');
            row.className = 'checkbox-item';
            row.setAttribute('data-search', `${item.name} ${item.email}`);

            row.innerHTML = `
                <input type="checkbox" value="${item.email}" ${isChecked ? 'checked' : ''}>
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-email">${item.email}</span>
                </div>
            `;

            const checkbox = row.querySelector('input');
            checkbox.addEventListener('change', () => {
                let emails = getEmailsFromInput(targetInput);
                if (checkbox.checked) {
                    if (!emails.includes(checkbox.value)) emails.push(checkbox.value);
                } else {
                    emails = emails.filter(e => e !== checkbox.value);
                }
                setEmailsToInput(targetInput, emails);
                updateBadge(badgeCount, emails.length);
            });

            listEl.appendChild(row);
        });

        updateBadge(badgeCount, currentEmails.length);
    }

    function updateBadge(badgeEl, count) {
        if (!badgeEl) return;
        if (count > 0) {
            badgeEl.style.display = 'inline-block';
            badgeEl.textContent = count;
        } else {
            badgeEl.style.display = 'none';
        }
    }

    // =========================================================================
    // SINGLE MODE LOGIC
    // =========================================================================
    const singleSenderIdInput = document.getElementById('sender_id');
    const senderPills = document.querySelectorAll('.sender-pill-btn');
    const singleTemplateSelect = document.getElementById('templateSelect');
    const singleToInput = document.getElementById('to');
    const singleCcInput = document.getElementById('cc');
    const singleBccInput = document.getElementById('bcc');
    const singleSubjectInput = document.getElementById('subject');
    const singleBodyInput = document.getElementById('body');
    const singleDropZone = document.getElementById('dropZone');
    const singleFileInput = document.getElementById('fileInput');
    const singleBrowseBtn = document.getElementById('browseBtn');
    const singleFileList = document.getElementById('fileList');
    const singleFileCountBadge = document.getElementById('fileCountBadge');
    const singleSendBtn = document.getElementById('sendBtn');
    const singleBtnLoader = document.getElementById('btnLoader');
    const singleResetBtn = document.getElementById('resetBtn');
    const quickChipsContainer = document.getElementById('quickChipsContainer');

    senderPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const senderKey = pill.getAttribute('data-sender');
            setSingleSender(senderKey);
        });
    });

    function setSingleSender(senderKey) {
        if (!senderDisplayMap[senderKey]) return;
        singleSenderIdInput.value = senderKey;

        senderPills.forEach(p => p.classList.remove('active'));
        const activePill = document.getElementById(`pill-${senderKey}`);
        if (activePill) activePill.classList.add('active');
    }

    setSingleSender('ajio');

    function renderQuickChips() {
        quickChipsContainer.innerHTML = '';
        emailsData.forEach(item => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'email-chip-btn';
            chip.innerHTML = `<span>+ ${item.name}</span>`;
            chip.title = `Click to toggle ${item.email} in CC`;
            
            chip.addEventListener('click', () => {
                let current = getEmailsFromInput(singleCcInput);
                if (current.includes(item.email)) {
                    current = current.filter(e => e !== item.email);
                    showToast(`Removed "${item.name}" from CC`, 'success');
                } else {
                    current.push(item.email);
                    showToast(`Added "${item.name}" to CC`, 'success');
                }
                setEmailsToInput(singleCcInput, current);
                const badge = document.querySelector('[data-target-input="cc"] .badge-count');
                updateBadge(badge, current.length);
            });

            quickChipsContainer.appendChild(chip);
        });
    }

    singleTemplateSelect.addEventListener('change', () => {
        const selectedId = singleTemplateSelect.value;
        if (!selectedId) return;

        const tpl = templatesData.find(t => t.id === selectedId);
        if (tpl) {
            singleSubjectInput.value = tpl.subject;
            singleBodyInput.value = tpl.body;
            showToast(`Loaded Template: "${tpl.name}"`, 'success');
        }
    });

    document.querySelectorAll('#singleModeView .tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.getAttribute('data-tool');
            const senderKey = singleSenderIdInput.value;
            const info = senderDisplayMap[senderKey] || senderDisplayMap.ajio;

            if (tool === 'greeting') {
                insertAtCursor(singleBodyInput, 'Dear Sir/Madam,\n\nPlease find the requested details below.\n\n');
            } else if (tool === 'signature') {
                insertAtCursor(singleBodyInput, `\n\nWarm regards,\n${info.fullName}\n${info.email}\nBrand Central Team`);
            } else if (tool === 'bullet') {
                insertAtCursor(singleBodyInput, '\n• ');
            } else if (tool === 'clear') {
                singleBodyInput.value = '';
            }
            singleBodyInput.focus();
        });
    });

    function insertAtCursor(textarea, textToInsert) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + textToInsert + text.substring(end);
        textarea.focus();
        textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }

    singleBrowseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        singleFileInput.click();
    });

    singleDropZone.addEventListener('click', () => {
        singleFileInput.click();
    });

    singleFileInput.addEventListener('change', (e) => {
        handleSingleFiles(e.target.files);
        singleFileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(name => {
        singleDropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            singleDropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(name => {
        singleDropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            singleDropZone.classList.remove('dragover');
        }, false);
    });

    singleDropZone.addEventListener('drop', (e) => {
        handleSingleFiles(e.dataTransfer.files);
    });

    function handleSingleFiles(files) {
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (!singleFiles.some(x => x.name === f.name && x.size === f.size)) {
                singleFiles.push(f);
            }
        }
        renderSingleFileList();
    }

    function renderSingleFileList() {
        singleFileList.innerHTML = '';
        singleFileCountBadge.textContent = `${singleFiles.length} file${singleFiles.length === 1 ? '' : 's'}`;

        singleFiles.forEach((file, index) => {
            const ext = file.name.split('.').pop().substring(0, 4);
            const chip = document.createElement('div');
            chip.className = 'file-chip';

            chip.innerHTML = `
                <div class="file-chip-left">
                    <span class="file-chip-icon">${ext}</span>
                    <span class="file-chip-name" title="${file.name}">${file.name}</span>
                    <span class="file-chip-size">${formatBytes(file.size)}</span>
                </div>
                <button type="button" class="file-chip-remove" title="Remove">&times;</button>
            `;

            chip.querySelector('.file-chip-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                singleFiles.splice(index, 1);
                renderSingleFileList();
            });

            singleFileList.appendChild(chip);
        });
    }

    singleResetBtn.addEventListener('click', () => {
        if (confirm('Clear current form?')) {
            document.getElementById('emailForm').reset();
            singleFiles = [];
            renderSingleFileList();
            setSingleSender('ajio');
            singleTemplateSelect.value = '';
            document.querySelectorAll('#singleModeView .badge-count').forEach(b => b.style.display = 'none');
            showToast('Form cleared.', 'success');
        }
    });

    document.getElementById('emailForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const recipient = singleToInput.value.trim();
        if (!recipient) {
            showToast('Please enter at least one recipient (To) address.', 'error', 'Missing Recipient');
            singleToInput.focus();
            return;
        }

        const formData = new FormData();
        formData.append('sender_id', singleSenderIdInput.value);
        formData.append('to', recipient);
        formData.append('cc', singleCcInput.value.trim());
        formData.append('bcc', singleBccInput.value.trim());
        formData.append('subject', singleSubjectInput.value.trim());
        formData.append('body', singleBodyInput.value);

        singleFiles.forEach(file => {
            formData.append('attachments', file);
        });

        singleSendBtn.disabled = true;
        singleSendBtn.querySelector('.send-label').style.display = 'none';
        singleBtnLoader.style.display = 'inline-block';

        try {
            const response = await fetch('/send-email', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showToast(data.message || 'Email sent successfully!', 'success', 'Dispatched');
                singleToInput.value = '';
                singleCcInput.value = '';
                singleBccInput.value = '';
                singleSubjectInput.value = '';
                singleBodyInput.value = '';
                singleFiles = [];
                renderSingleFileList();
                singleTemplateSelect.value = '';
                document.querySelectorAll('#singleModeView .badge-count').forEach(b => b.style.display = 'none');
            } else {
                showToast(data.error || 'Failed to send email.', 'error', 'SMTP Error');
            }
        } catch (error) {
            console.error('Request failed:', error);
            showToast('Could not reach Flask server.', 'error', 'Connection Error');
        } finally {
            singleSendBtn.disabled = false;
            singleSendBtn.querySelector('.send-label').style.display = 'flex';
            singleBtnLoader.style.display = 'none';
        }
    });

    // =========================================================================
    // MULTI-ACCOUNT BATCH (3-in-1) LOGIC
    // =========================================================================
    const sendBatchBtn = document.getElementById('sendBatchBtn');
    const batchBtnLoader = document.getElementById('batchBtnLoader');
    const resetBatchBtn = document.getElementById('resetBatchBtn');
    const batchStatusSummary = document.getElementById('batchStatusSummary');

    const batchCards = {
        ajio: {
            tplSelect: document.getElementById('batchTplAjio'),
            enableCheckbox: document.getElementById('enableAjioBatch'),
            statusBadge: document.getElementById('statusAjio'),
            toInput: document.getElementById('batchToAjio'),
            ccInput: document.getElementById('batchCcAjio'),
            bccInput: document.getElementById('batchBccAjio'),
            subInput: document.getElementById('batchSubAjio'),
            bodyText: document.getElementById('batchBodyAjio'),
            dropZone: document.getElementById('dropZoneAjio'),
            fileInput: document.getElementById('fileInputAjio'),
            browseBtn: document.getElementById('browseBtnAjio'),
            fileList: document.getElementById('fileListAjio'),
            countBadge: document.getElementById('countAjioBadge')
        },
        myntra: {
            tplSelect: document.getElementById('batchTplMyntra'),
            enableCheckbox: document.getElementById('enableMyntraBatch'),
            statusBadge: document.getElementById('statusMyntra'),
            toInput: document.getElementById('batchToMyntra'),
            ccInput: document.getElementById('batchCcMyntra'),
            bccInput: document.getElementById('batchBccMyntra'),
            subInput: document.getElementById('batchSubMyntra'),
            bodyText: document.getElementById('batchBodyMyntra'),
            dropZone: document.getElementById('dropZoneMyntra'),
            fileInput: document.getElementById('fileInputMyntra'),
            browseBtn: document.getElementById('browseBtnMyntra'),
            fileList: document.getElementById('fileListMyntra'),
            countBadge: document.getElementById('countMyntraBadge')
        },
        flipkart: {
            tplSelect: document.getElementById('batchTplFlipkart'),
            enableCheckbox: document.getElementById('enableFlipkartBatch'),
            statusBadge: document.getElementById('statusFlipkart'),
            toInput: document.getElementById('batchToFlipkart'),
            ccInput: document.getElementById('batchCcFlipkart'),
            bccInput: document.getElementById('batchBccFlipkart'),
            subInput: document.getElementById('batchSubFlipkart'),
            bodyText: document.getElementById('batchBodyFlipkart'),
            dropZone: document.getElementById('dropZoneFlipkart'),
            fileInput: document.getElementById('fileInputFlipkart'),
            browseBtn: document.getElementById('browseBtnFlipkart'),
            fileList: document.getElementById('fileListFlipkart'),
            countBadge: document.getElementById('countFlipkartBadge')
        }
    };

    // Setup Individual Batch Card Templates (Separate for each brand!)
    ['ajio', 'myntra', 'flipkart'].forEach(brand => {
        const card = batchCards[brand];

        // When a template is chosen on Ajio card, it fills ONLY Ajio
        // When chosen on Myntra card, it fills ONLY Myntra
        // When chosen on Flipkart card, it fills ONLY Flipkart
        card.tplSelect.addEventListener('change', () => {
            const selectedId = card.tplSelect.value;
            if (!selectedId) return;

            const tpl = templatesData.find(t => t.id === selectedId);
            if (tpl) {
                card.subInput.value = tpl.subject;
                card.bodyText.value = tpl.body;
                showToast(`Applied "${tpl.name}" to ${brand.toUpperCase()} card!`, 'success');
            }
        });

        // Enable / Disable Checkbox Toggle
        card.enableCheckbox.addEventListener('change', () => {
            if (card.enableCheckbox.checked) {
                card.statusBadge.textContent = 'Ready';
                card.statusBadge.className = 'batch-card-status ready';
            } else {
                card.statusBadge.textContent = 'Skipped';
                card.statusBadge.className = 'batch-card-status disabled';
            }
            updateBatchSummary();
        });

        // Dropzone & File Browse
        card.browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            card.fileInput.click();
        });

        card.dropZone.addEventListener('click', () => {
            card.fileInput.click();
        });

        card.fileInput.addEventListener('change', (e) => {
            handleBatchFiles(brand, e.target.files);
            card.fileInput.value = '';
        });

        ['dragenter', 'dragover'].forEach(name => {
            card.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(name => {
            card.dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.dropZone.classList.remove('dragover');
            }, false);
        });

        card.dropZone.addEventListener('drop', (e) => {
            handleBatchFiles(brand, e.dataTransfer.files);
        });
    });

    function handleBatchFiles(brand, files) {
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (!batchFiles[brand].some(x => x.name === f.name && x.size === f.size)) {
                batchFiles[brand].push(f);
            }
        }
        renderBatchFileList(brand);
    }

    function renderBatchFileList(brand) {
        const card = batchCards[brand];
        const files = batchFiles[brand];
        card.fileList.innerHTML = '';
        card.countBadge.textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;

        files.forEach((file, index) => {
            const ext = file.name.split('.').pop().substring(0, 4);
            const chip = document.createElement('div');
            chip.className = 'file-chip';

            chip.innerHTML = `
                <div class="file-chip-left">
                    <span class="file-chip-icon">${ext}</span>
                    <span class="file-chip-name" title="${file.name}">${file.name}</span>
                    <span class="file-chip-size">${formatBytes(file.size)}</span>
                </div>
                <button type="button" class="file-chip-remove" title="Remove">&times;</button>
            `;

            chip.querySelector('.file-chip-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                batchFiles[brand].splice(index, 1);
                renderBatchFileList(brand);
            });

            card.fileList.appendChild(chip);
        });
    }

    function updateBatchSummary() {
        const enabledCount = ['ajio', 'myntra', 'flipkart'].filter(b => batchCards[b].enableCheckbox.checked).length;
        batchStatusSummary.textContent = `${enabledCount} of 3 Emails selected for dispatch`;
    }

    // Reset Batch Forms
    resetBatchBtn.addEventListener('click', () => {
        if (confirm('Clear all 3 batch draft forms?')) {
            ['ajio', 'myntra', 'flipkart'].forEach(brand => {
                const c = batchCards[brand];
                c.toInput.value = '';
                c.ccInput.value = '';
                c.bccInput.value = '';
                c.subInput.value = '';
                c.bodyText.value = '';
                c.tplSelect.value = '';
                c.enableCheckbox.checked = true;
                c.statusBadge.textContent = 'Ready';
                c.statusBadge.className = 'batch-card-status ready';
                batchFiles[brand] = [];
                renderBatchFileList(brand);
            });
            document.querySelectorAll('#multiModeView .badge-count').forEach(b => b.style.display = 'none');
            updateBatchSummary();
            showToast('All batch forms cleared.', 'success');
        }
    });

    // Sequential Batch Dispatch (1-by-1)
    sendBatchBtn.addEventListener('click', async () => {
        const brandsToDispatch = ['ajio', 'myntra', 'flipkart'].filter(b => batchCards[b].enableCheckbox.checked);

        if (brandsToDispatch.length === 0) {
            showToast('Please enable at least one account to send.', 'error', 'No Account Selected');
            return;
        }

        // Validate recipient 'To' for all enabled cards
        for (const brand of brandsToDispatch) {
            const card = batchCards[brand];
            const recipient = card.toInput.value.trim();
            if (!recipient) {
                showToast(`Recipient (To) is required for ${brand.toUpperCase()} email card.`, 'error', 'Missing Recipient');
                card.toInput.focus();
                return;
            }
        }

        if (!confirm(`Are you ready to dispatch ${brandsToDispatch.length} email(s) sequentially?`)) {
            return;
        }

        sendBatchBtn.disabled = true;
        sendBatchBtn.querySelector('.send-label').style.display = 'none';
        batchBtnLoader.style.display = 'inline-block';

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < brandsToDispatch.length; i++) {
            const brand = brandsToDispatch[i];
            const card = batchCards[brand];

            card.statusBadge.textContent = 'Sending...';
            card.statusBadge.className = 'batch-card-status sending';
            batchStatusSummary.textContent = `Sending ${brand.toUpperCase()} email (${i + 1}/${brandsToDispatch.length})...`;

            const formData = new FormData();
            formData.append('sender_id', brand);
            formData.append('to', card.toInput.value.trim());
            formData.append('cc', card.ccInput.value.trim());
            formData.append('bcc', card.bccInput.value.trim());
            formData.append('subject', card.subInput.value.trim());
            formData.append('body', card.bodyText.value);

            batchFiles[brand].forEach(file => {
                formData.append('attachments', file);
            });

            try {
                const response = await fetch('/send-email', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    card.statusBadge.textContent = 'Sent ✓';
                    card.statusBadge.className = 'batch-card-status sent';
                    successCount++;
                } else {
                    card.statusBadge.textContent = 'Failed ⚠️';
                    card.statusBadge.className = 'batch-card-status failed';
                    failureCount++;
                    showToast(`Error sending ${brand.toUpperCase()}: ${data.error || 'SMTP Failure'}`, 'error');
                }
            } catch (err) {
                card.statusBadge.textContent = 'Failed ⚠️';
                card.statusBadge.className = 'batch-card-status failed';
                failureCount++;
                showToast(`Network error on ${brand.toUpperCase()}`, 'error');
            }

            await new Promise(r => setTimeout(r, 500));
        }

        sendBatchBtn.disabled = false;
        sendBatchBtn.querySelector('.send-label').style.display = 'flex';
        batchBtnLoader.style.display = 'none';

        batchStatusSummary.textContent = `Batch finished: ${successCount} Sent, ${failureCount} Failed`;
        if (failureCount === 0) {
            showToast(`All ${successCount} emails dispatched successfully! 🎉`, 'success', 'Batch Complete');
        } else {
            showToast(`Batch completed with ${successCount} successful and ${failureCount} failed dispatches.`, 'warning', 'Batch Notice');
        }
    });

    // =========================================================================
    // INITIALIZATION & DATA LOADING
    // =========================================================================
    async function loadAllData() {
        try {
            // Load Emails
            const emailsRes = await fetch('/api/emails');
            emailsData = await emailsRes.json();
            
            // Initialize Multi-Select Checkboxes for ALL fields across both views!
            initAllMultiSelectWrappers();
            renderQuickChips();

            // Load Templates
            const tplRes = await fetch('/api/templates');
            templatesData = await tplRes.json();

            // Single Template Dropdown
            singleTemplateSelect.innerHTML = '<option value="">-- Choose Universal Template (Auto-fills Subject & Body) --</option>';
            templatesData.forEach(tpl => {
                const opt = document.createElement('option');
                opt.value = tpl.id;
                opt.textContent = `${tpl.name} (${tpl.subject})`;
                singleTemplateSelect.appendChild(opt);
            });

            // Populate each Batch Card Template Dropdown (Ajio, Myntra, Flipkart separately!)
            ['ajio', 'myntra', 'flipkart'].forEach(brand => {
                const sel = batchCards[brand].tplSelect;
                sel.innerHTML = `<option value="">-- Choose ${brand.toUpperCase()} Template --</option>`;
                templatesData.forEach(tpl => {
                    const opt = document.createElement('option');
                    opt.value = tpl.id;
                    opt.textContent = `${tpl.name}`;
                    sel.appendChild(opt);
                });
            });

            updateBatchSummary();
        } catch (e) {
            console.error('Error loading initial data:', e);
        }
    }

    loadAllData();
});
