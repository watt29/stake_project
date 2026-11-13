// popup.js - My Vault Extension Controller v1.1 (พร้อม 1-Click Autofill)

let currentKey = null;
let vaultItems = [];
let currentTabUrl = null;
let currentTabId = null;

// DOM Elements
const setupView = document.getElementById('setupView');
const unlockView = document.getElementById('unlockView');
const mainView = document.getElementById('mainView');
const lockBtn = document.getElementById('lockBtn');
const toastEl = document.getElementById('toast');
const currentSiteBanner = document.getElementById('currentSiteBanner');

// ─────────────────────────────────────────────
// HELPER: Views Switching
// ─────────────────────────────────────────────
function switchView(viewName) {
  setupView.style.display = viewName === 'setup' ? 'block' : 'none';
  unlockView.style.display = viewName === 'unlock' ? 'block' : 'none';
  mainView.style.display = viewName === 'main' ? 'block' : 'none';
  lockBtn.style.display = viewName === 'main' ? 'inline-block' : 'none';
}

// ─────────────────────────────────────────────
// HELPER: Toast Notification
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(message, duration = 2000) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// ─────────────────────────────────────────────
// HELPER: Copy to Clipboard
// ─────────────────────────────────────────────
async function copyToClipboard(text, label = 'ข้อมูล') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`คัดลอก${label}แล้ว! 📋`);
  } catch {
    showToast('ไม่สามารถคัดลอกได้');
  }
}

// ─────────────────────────────────────────────
// HELPER: Generate Secure Password
// ─────────────────────────────────────────────
function generateStrongPassword(length = 16) {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+-=";
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  let res = "";
  for (let i = 0; i < length; i++) {
    res += chars[array[i] % chars.length];
  }
  return res;
}

// ─────────────────────────────────────────────
// HELPER: Escape HTML
// ─────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

// ─────────────────────────────────────────────
// HELPER: Extract Domain from URL
// ─────────────────────────────────────────────
function extractDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// AUTOFILL: Inject username + password into the active tab page
// ─────────────────────────────────────────────
async function autofillIntoPage(tabId, item) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (username, password) => {
        // ── หา input[type=email], input[type=text] ที่น่าจะเป็น username/email ──
        const userSelectors = [
          'input[type="email"]',
          'input[autocomplete="username"]',
          'input[autocomplete="email"]',
          'input[name*="email" i]',
          'input[name*="user" i]',
          'input[id*="email" i]',
          'input[id*="user" i]',
          'input[placeholder*="email" i]',
          'input[placeholder*="user" i]',
          'input[type="text"]'
        ];

        // ── หา input[type=password] ──
        const passSelectors = [
          'input[type="password"]',
          'input[autocomplete="current-password"]',
          'input[autocomplete="new-password"]'
        ];

        let userInput = null;
        let passInput = null;

        // หาช่องรหัสผ่านก่อน (เป็น anchor หลัก)
        for (const sel of passSelectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            // เลือก input[type=password] ที่มองเห็นอยู่ตัวแรก
            for (const el of els) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                passInput = el;
                break;
              }
            }
            if (passInput) break;
          }
        }

        // หาช่อง username โดยดูจาก form เดียวกับ password
        if (passInput) {
          const form = passInput.closest('form');
          if (form) {
            for (const sel of userSelectors) {
              const el = form.querySelector(sel);
              if (el && el !== passInput) {
                userInput = el;
                break;
              }
            }
          }
        }

        // fallback: สแกนทั้งหน้า
        if (!userInput) {
          for (const sel of userSelectors.slice(0, -1)) { // ไม่รวม input[type=text] generic
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && el !== passInput) {
                userInput = el;
                break;
              }
            }
            if (userInput) break;
          }
        }

        // ── Setter ที่ทริก React/Vue/Angular ด้วย ──
        function nativeInputSetter(el, value) {
          const nativeInput = Object.getOwnPropertyDescriptor(
            el.tagName === 'INPUT'
              ? window.HTMLInputElement.prototype
              : window.HTMLTextAreaElement.prototype,
            'value'
          );
          if (nativeInput && nativeInput.set) {
            nativeInput.set.call(el, value);
          } else {
            el.value = value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        let filledUser = false;
        let filledPass = false;

        if (userInput && username) {
          userInput.focus();
          nativeInputSetter(userInput, username);
          filledUser = true;
        }

        if (passInput && password) {
          passInput.focus();
          nativeInputSetter(passInput, password);
          filledPass = true;
        }

        return { filledUser, filledPass };
      },
      args: [item.username, item.password]
    });

    showToast('⚡ กรอกรหัสผ่านในหน้าเว็บแล้ว!', 2500);
  } catch (err) {
    console.error('Autofill error:', err);
    showToast('❌ ไม่สามารถกรอกอัตโนมัติในหน้านี้ได้ ลองคัดลอกแทน');
  }
}

// ─────────────────────────────────────────────
// DETECT: ตรวจจับโดเมนเว็บปัจจุบัน
// ─────────────────────────────────────────────
async function detectCurrentTab() {
  try {
    if (!chrome.tabs || !chrome.tabs.query) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;

    const tab = tabs[0];
    currentTabId = tab.id;
    currentTabUrl = tab.url || '';

    if (currentTabUrl.startsWith('chrome://') || currentTabUrl.startsWith('edge://') || currentTabUrl.startsWith('about:')) {
      return; // ไม่กรอกในหน้า Internal Chrome
    }

    const domain = extractDomain(currentTabUrl);
    if (!domain) return;

    // เช็คว่ามี item ที่ตรงกับโดเมนนี้หรือไม่
    const matches = vaultItems.filter(item => {
      if (!item.siteUrl) return false;
      const itemDomain = extractDomain(item.siteUrl);
      return itemDomain && (domain.includes(itemDomain) || itemDomain.includes(domain));
    });

    // กรอกฟอร์มบันทึกใหม่โดยใช้ชื่อเว็บปัจจุบัน
    const siteNameInput = document.getElementById('siteName');
    const siteUrlInput = document.getElementById('siteUrl');
    if (!siteNameInput.value) {
      const displayName = domain.charAt(0).toUpperCase() + domain.slice(1).replace(/\.[^.]+$/, '');
      siteNameInput.value = displayName;
    }
    if (!siteUrlInput.value) {
      try {
        siteUrlInput.value = new URL(currentTabUrl).origin;
      } catch {}
    }

    // แสดง Quick Banner ถ้าเจอรหัสที่ตรงกัน
    if (matches.length > 0) {
      showQuickBanner(domain, matches[0]);
    } else {
      currentSiteBanner.style.display = 'none';
    }
  } catch (e) {
    console.debug('Tab detection skipped:', e);
  }
}

// ─────────────────────────────────────────────
// UI: แสดง Quick Autofill Banner
// ─────────────────────────────────────────────
function showQuickBanner(domain, matchedItem) {
  document.getElementById('currentSiteBannerTitle').textContent =
    `${matchedItem.siteName} · ${domain}`;
  currentSiteBanner.style.display = 'flex';

  // ผูก event กรอกอัตโนมัติ
  const btn = document.getElementById('btnQuickAutofill');
  btn.onclick = async () => {
    if (!currentTabId) return;
    await autofillIntoPage(currentTabId, matchedItem);
  };
}

// ─────────────────────────────────────────────
// VAULT: Save to Chrome Storage
// ─────────────────────────────────────────────
async function saveVault() {
  if (!currentKey) return;
  const jsonStr = JSON.stringify(vaultItems);
  const encrypted = await VaultCrypto.encrypt(jsonStr, currentKey);
  await chrome.storage.local.set({ vaultData: encrypted });
  updateBadge();
}

// ─────────────────────────────────────────────
// UI: Update Item Count
// ─────────────────────────────────────────────
function updateBadge() {
  const countSpan = document.getElementById('itemCount');
  if (countSpan) countSpan.textContent = vaultItems.length;
}

// ─────────────────────────────────────────────
// UI: Render Credentials List
// ─────────────────────────────────────────────
function renderList(filter = '') {
  const listContainer = document.getElementById('credentialsList');
  const emptyMsg = document.getElementById('emptyListMsg');
  listContainer.innerHTML = '';

  const q = filter.trim().toLowerCase();
  const filtered = vaultItems.filter(item => !q || [
    item.siteName, item.username, item.siteUrl, item.notes
  ].some(f => f && f.toLowerCase().includes(q)));

  if (filtered.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  // โดเมนของแท็บปัจจุบัน (เพื่อไฮไลต์ matched)
  const activeDomain = currentTabUrl ? extractDomain(currentTabUrl) : null;

  filtered.forEach(item => {
    const isMatch = activeDomain && item.siteUrl && (() => {
      const d = extractDomain(item.siteUrl);
      return d && (activeDomain.includes(d) || d.includes(activeDomain));
    })();

    const card = document.createElement('div');
    card.className = `vault-card${isMatch ? ' matched' : ''}`;

    // ── Card Top ──
    const cardTop = document.createElement('div');
    cardTop.className = 'card-top';

    const infoDiv = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'site-title';
    title.textContent = `${isMatch ? '🟢 ' : ''}${item.siteName}`;
    infoDiv.appendChild(title);

    if (item.siteUrl) {
      const link = document.createElement('a');
      link.className = 'site-url';
      link.href = item.siteUrl;
      link.target = '_blank';
      link.textContent = item.siteUrl;
      infoDiv.appendChild(link);
    }
    cardTop.appendChild(infoDiv);

    // Actions top-right: Autofill + Delete
    const topActions = document.createElement('div');
    topActions.style.display = 'flex';
    topActions.style.gap = '4px';

    // ── ปุ่ม Autofill (แสดงเฉพาะเมื่อโดเมนตรงกัน) ──
    if (isMatch && currentTabId) {
      const afBtn = document.createElement('button');
      afBtn.className = 'action-chip action-chip-autofill';
      afBtn.title = 'กรอกรหัสผ่านลงหน้านี้ทันที';
      afBtn.textContent = '⚡ กรอก';
      afBtn.addEventListener('click', async () => {
        await autofillIntoPage(currentTabId, item);
      });
      topActions.appendChild(afBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'action-chip';
    delBtn.innerHTML = '🗑️';
    delBtn.title = 'ลบรายการนี้';
    delBtn.addEventListener('click', async () => {
      if (confirm(`ลบข้อมูลของ "${item.siteName}" หรือไม่?`)) {
        vaultItems = vaultItems.filter(i => i.id !== item.id);
        await saveVault();
        renderList(document.getElementById('searchInput').value);
        showToast('ลบรายการแล้ว');
      }
    });
    topActions.appendChild(delBtn);
    cardTop.appendChild(topActions);
    card.appendChild(cardTop);

    // ── Username Row ──
    const userRow = createFieldRow(
      'บัญชี:',
      item.username,
      () => copyToClipboard(item.username, 'ชื่อบัญชี')
    );
    card.appendChild(userRow);

    // ── Password Row ──
    const passRow = document.createElement('div');
    passRow.className = 'card-field';

    const passValueSpan = document.createElement('span');
    passValueSpan.className = 'field-value';
    passValueSpan.textContent = '••••••••';
    let isRevealed = false;

    const passLeft = document.createElement('div');
    passLeft.innerHTML = '<span class="field-label">รหัสผ่าน:</span> ';
    passLeft.appendChild(passValueSpan);

    const passActions = document.createElement('div');
    passActions.style.cssText = 'display:flex; gap:4px;';

    const revealBtn = document.createElement('button');
    revealBtn.className = 'action-chip';
    revealBtn.textContent = '👁️';
    revealBtn.title = 'แสดง/ซ่อน';
    revealBtn.addEventListener('click', () => {
      isRevealed = !isRevealed;
      passValueSpan.textContent = isRevealed ? item.password : '••••••••';
      revealBtn.textContent = isRevealed ? '🙈' : '👁️';
    });

    const copyPassBtn = document.createElement('button');
    copyPassBtn.className = 'action-chip';
    copyPassBtn.textContent = 'คัดลอก';
    copyPassBtn.addEventListener('click', () => copyToClipboard(item.password, 'รหัสผ่าน'));

    passActions.appendChild(revealBtn);
    passActions.appendChild(copyPassBtn);
    passRow.appendChild(passLeft);
    passRow.appendChild(passActions);
    card.appendChild(passRow);

    // ── Notes ──
    if (item.notes) {
      const notesDiv = document.createElement('div');
      notesDiv.className = 'card-notes';
      notesDiv.textContent = `📝 ${item.notes}`;
      card.appendChild(notesDiv);
    }

    listContainer.appendChild(card);
  });
}

function createFieldRow(labelText, value, copyFn) {
  const row = document.createElement('div');
  row.className = 'card-field';

  const left = document.createElement('div');
  left.innerHTML = `<span class="field-label">${escapeHtml(labelText)}</span><span class="field-value">${escapeHtml(value)}</span>`;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'action-chip';
  copyBtn.textContent = 'คัดลอก';
  copyBtn.addEventListener('click', copyFn);

  row.appendChild(left);
  row.appendChild(copyBtn);
  return row;
}

// ─────────────────────────────────────────────
// VAULT: Lock
// ─────────────────────────────────────────────
function lockVault() {
  currentKey = null;
  vaultItems = [];
  currentTabId = null;
  currentTabUrl = null;
  document.getElementById('unlockPass').value = '';
  document.getElementById('unlockError').style.display = 'none';
  currentSiteBanner.style.display = 'none';
  switchView('unlock');
}

// ─────────────────────────────────────────────
// INIT: App Startup
// ─────────────────────────────────────────────
async function initApp() {
  const store = await chrome.storage.local.get(['salt', 'verifierHash', 'vaultData']);
  if (!store.salt || !store.verifierHash) {
    switchView('setup');
  } else {
    switchView('unlock');
  }
}

// ─────────────────────────────────────────────
// EVENT: Setup Master Password
// ─────────────────────────────────────────────
document.getElementById('btnCreateVault').addEventListener('click', async () => {
  const pass = document.getElementById('setupPass').value;
  const passConfirm = document.getElementById('setupPassConfirm').value;

  if (!pass || pass.length < 6) { alert('กรุณาตั้งรหัสผ่านหลักอย่างน้อย 6 ตัวอักษร'); return; }
  if (pass !== passConfirm) { alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }

  const salt = VaultCrypto.generateSalt();
  const verifierHash = await VaultCrypto.hashMasterPassword(pass, salt);
  const key = await VaultCrypto.deriveKey(pass, salt);
  const emptyVaultEncrypted = await VaultCrypto.encrypt(JSON.stringify([]), key);

  await chrome.storage.local.set({ salt, verifierHash, vaultData: emptyVaultEncrypted });

  currentKey = key;
  vaultItems = [];
  updateBadge();
  await detectCurrentTab();
  renderList();
  switchView('main');
  showToast('✅ สร้างห้องนิรภัยสำเร็จ!');
});

// ─────────────────────────────────────────────
// EVENT: Unlock Vault
// ─────────────────────────────────────────────
async function handleUnlock() {
  const passInput = document.getElementById('unlockPass');
  const errorEl = document.getElementById('unlockError');
  const pass = passInput.value;
  if (!pass) return;

  const store = await chrome.storage.local.get(['salt', 'verifierHash', 'vaultData']);
  const computedHash = await VaultCrypto.hashMasterPassword(pass, store.salt);

  if (computedHash !== store.verifierHash) {
    errorEl.style.display = 'block';
    passInput.focus();
    return;
  }

  errorEl.style.display = 'none';
  try {
    const key = await VaultCrypto.deriveKey(pass, store.salt);
    const decryptedJson = await VaultCrypto.decrypt(store.vaultData, key);
    vaultItems = JSON.parse(decryptedJson);
    currentKey = key;
    passInput.value = '';

    updateBadge();
    await detectCurrentTab(); // ตรวจจับเว็บปัจจุบัน หลังปลดล็อก
    renderList();
    switchView('main');
    showToast('🔓 ปลดล็อคห้องนิรภัยแล้ว');
  } catch (err) {
    errorEl.textContent = 'เกิดข้อผิดพลาดในการถอดรหัสข้อมูล';
    errorEl.style.display = 'block';
  }
}

document.getElementById('btnUnlock').addEventListener('click', handleUnlock);
document.getElementById('unlockPass').addEventListener('keydown', e => { if (e.key === 'Enter') handleUnlock(); });

// ─────────────────────────────────────────────
// EVENT: Lock Button
// ─────────────────────────────────────────────
lockBtn.addEventListener('click', lockVault);

// ─────────────────────────────────────────────
// EVENT: Tab Navigation
// ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
  });
});

document.getElementById('btnGoAdd').addEventListener('click', () => {
  document.querySelector('[data-tab="tab-add"]').click();
});

// ─────────────────────────────────────────────
// EVENT: Add New Credential
// ─────────────────────────────────────────────
document.getElementById('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const siteName = document.getElementById('siteName').value.trim();
  const siteUrl  = document.getElementById('siteUrl').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const notes    = document.getElementById('notes').value.trim();

  if (!siteName || !username || !password) { alert('กรุณากรอกข้อมูลในช่องที่มีเครื่องหมาย * ให้ครบถ้วน'); return; }

  const newItem = {
    id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    siteName, siteUrl, username, password, notes,
    createdAt: new Date().toISOString()
  };

  vaultItems.unshift(newItem);
  await saveVault();

  // Reset form fields (ยกเว้น siteName / siteUrl ที่ดึงอัตโนมัติ)
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('notes').value = '';

  showToast('✅ บันทึกรหัสผ่านเรียบร้อยแล้ว');
  document.querySelector('[data-tab="tab-list"]').click();
  renderList();
  await detectCurrentTab(); // อัปเดต banner
});

// ─────────────────────────────────────────────
// EVENT: Password Generator
// ─────────────────────────────────────────────
document.getElementById('btnGenPass').addEventListener('click', () => {
  const generated = generateStrongPassword(16);
  const passInput = document.getElementById('password');
  passInput.value = generated;
  passInput.type = 'text';
  document.getElementById('btnTogglePass').textContent = '🙈';
  showToast('🎲 สุ่มรหัสผ่านปลอดภัยแล้ว!');
});

// ─────────────────────────────────────────────
// EVENT: Toggle Add Form Password Visibility
// ─────────────────────────────────────────────
document.getElementById('btnTogglePass').addEventListener('click', () => {
  const passInput = document.getElementById('password');
  const isHidden = passInput.type === 'password';
  passInput.type = isHidden ? 'text' : 'password';
  document.getElementById('btnTogglePass').textContent = isHidden ? '🙈' : '👁️';
});

// ─────────────────────────────────────────────
// EVENT: Search
// ─────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', e => {
  renderList(e.target.value);
});

// ─────────────────────────────────────────────
// EVENT: Export Backup
// ─────────────────────────────────────────────
document.getElementById('btnExport').addEventListener('click', async () => {
  const store = await chrome.storage.local.get(['salt', 'verifierHash', 'vaultData']);
  const payload = { app: 'MyVaultExtension', version: '1.1.0', exportedAt: new Date().toISOString(), data: store };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my_vault_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇️ ดาวน์โหลดไฟล์สำรองแล้ว');
});

// ─────────────────────────────────────────────
// EVENT: Import Backup
// ─────────────────────────────────────────────
document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed.data?.salt || !parsed.data?.verifierHash || !parsed.data?.vaultData) {
        alert('ไฟล์สำรองไม่ถูกต้องหรือรูปแบบไม่สมบูรณ์'); return;
      }
      if (confirm('การกู้คืนจะแทนที่ข้อมูลเดิม คุณต้องการดำเนินการต่อหรือไม่?')) {
        await chrome.storage.local.set(parsed.data);
        alert('กู้คืนข้อมูลสำเร็จ กรุณาปลดล็อคด้วยรหัสผ่านหลักของไฟล์สำรอง');
        lockVault();
      }
    } catch (err) {
      alert('ไม่สามารถอ่านไฟล์สำรองได้: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
initApp();
