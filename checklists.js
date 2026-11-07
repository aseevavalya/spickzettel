(() => {
  const key = 'study-checklists-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { /* Storage may be unavailable. */ }
  if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const notice = document.createElement('p');
  notice.className = 'checklist-storage-note';
  notice.textContent = 'Отметки сохраняются в этом браузере. Галочка — понятно; без галочки — ещё разобрать.';
  const records = [];
  const changed = new EventTarget();
  let account = null;
  let pending = {};
  let syncing = Promise.resolve();
  const prefix = 'checklist-item:';
  const cacheKey = () => account ? `${key}:${account}` : key;
  const pendingKey = () => `${cacheKey()}:pending`;
  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  function message(text) {
    document.querySelectorAll('.checklist-storage-note').forEach(el => { el.textContent = text; });
  }
  function refresh() {
    records.forEach(({inputs, update}) => {
      inputs.forEach(input => { input.checked = saved[input.dataset.checkId] === true; });
      update();
    });
  }
  function persist() {
    localStorage.setItem(cacheKey(), JSON.stringify(saved));
    localStorage.setItem(pendingKey(), JSON.stringify(pending));
  }
  async function sync() {
    const sb = window.studySupabase;
    if (!sb) return;
    const {data: auth, error: authError} = await sb.auth.getSession();
    if (authError) throw authError;
    const user = auth.session?.user.id || null;
    if (user !== account) {
      account = user;
      saved = read(cacheKey());
      pending = read(pendingKey());
      // Import marks created before checklist cloud sync was introduced once per browser.
      if (user && !localStorage.getItem(`${key}:migrated`)) {
        Object.entries(read(key)).forEach(([id, value]) => {
          if (typeof value === 'boolean') pending[id] = {value, version: crypto.randomUUID()};
        });
        saved = {...saved, ...Object.fromEntries(Object.entries(pending).map(([id, item]) => [id, item.value]))};
        persist();
        localStorage.setItem(`${key}:migrated`, 'true');
      }
      refresh();
    }
    if (!user) {
      message('Отметки сохранены в браузере. Войдите в аккаунт для синхронизации между устройствами.');
      return;
    }
    message('Синхронизация отметок…');
    const batch = {...pending};
    for (const [id, item] of Object.entries(batch)) {
      const {error} = await sb.from('study_topic_edits').upsert({
        user_id: user, topic_id: prefix + id, payload: {checked: item.value}, updated_at: new Date().toISOString()
      }, {onConflict: 'user_id,topic_id'});
      if (error) throw error;
      if (account !== user) return;
      if (pending[id]?.version === item.version) delete pending[id];
      persist();
    }
    const {data, error} = await sb.from('study_topic_edits').select('topic_id,payload').eq('user_id', user).like('topic_id', prefix + '%');
    if (error) throw error;
    if (account !== user) return;
    const cloud = {};
    for (const row of data || []) {
      if (typeof row.payload?.checked === 'boolean') cloud[row.topic_id.slice(prefix.length)] = row.payload.checked;
    }
    saved = {...cloud, ...Object.fromEntries(Object.entries(pending).map(([id, item]) => [id, item.value]))};
    persist();
    refresh();
    message(Object.keys(pending).length ? 'Есть отметки, ожидающие синхронизации.' : 'Отметки синхронизированы через Supabase. Галочка — понятно; без галочки — ещё разобрать.');
  }
  function scheduleSync() {
    syncing = syncing.catch(() => {}).then(sync).catch(error => {
      console.warn('Checklist sync failed', error);
      message('Отметки сохранены локально. Синхронизация не удалась — повторим при подключении или через «Jetzt synchronisieren».');
    });
    return syncing;
  }
  window.studyChecklistSync = scheduleSync;
  document.querySelectorAll('.subject').forEach(section => {
    const formulas = document.createElement('div');
    formulas.className = 'formula-panel';
    [...section.children].filter(el => el.tagName !== 'H2').forEach(el => formulas.append(el));
    const panel = document.createElement('div');
    panel.className = 'checklist-panel hidden';
    panel.lang = 'ru';
    panel.append(notice.cloneNode(true));
    const sheets = window.studyChecklists[section.dataset.subject] || [];
    if (!sheets.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-subject';
      empty.textContent = 'Чек-листов пока нет. Здесь появятся листы с задачами по этому предмету.';
      panel.append(empty);
    }
    sheets.forEach(sheet => {
      const details = document.createElement('details');
      details.className = 'checklist-sheet';
      const summary = document.createElement('summary');
      const title = document.createElement('span');
      title.textContent = sheet.title;
      const progress = document.createElement('span');
      progress.className = 'checklist-progress';
      progress.setAttribute('aria-live', 'polite');
      summary.append(title, progress);
      const body = document.createElement('div');
      body.className = 'checklist-body';
      const meter = document.createElement('progress');
      meter.setAttribute('aria-label', 'Прогресс по листу');
      body.append(meter);
      const inputs = [];
      sheet.sections.forEach(group => {
        const heading = document.createElement('h3');
        heading.textContent = group.title;
        body.append(heading);
        group.blocks.forEach(block => {
          if (block.type === 'item') {
            const label = document.createElement('label');
            label.className = 'checklist-item';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.checkId = block.id;
            input.checked = saved[block.id] === true;
            const text = document.createElement('span');
            text.textContent = block.text;
            label.append(input, text);
            body.append(label);
            inputs.push(input);
            input.addEventListener('change', () => {
              saved[block.id] = input.checked;
              pending[block.id] = {value: input.checked, version: crypto.randomUUID()};
              try { persist(); }
              catch (_) { panel.querySelector('.checklist-storage-note').textContent = 'Не удалось сохранить отметки. Они доступны только до перезагрузки страницы.'; }
              update();
              changed.dispatchEvent(new Event('change'));
            });
          } else {
            const el = document.createElement(block.type === 'heading' ? 'h4' : 'p');
            el.textContent = block.text;
            body.append(el);
          }
        });
      });
      function update() {
        const done = inputs.filter(input => input.checked).length;
        progress.textContent = `${done}/${inputs.length} · ${Math.round(done / inputs.length * 100)}%`;
        meter.max = inputs.length;
        meter.value = done;
      }
      update();
      records.push({inputs, update});
      details.append(summary, body);
      panel.append(details);
      details.addEventListener('toggle', () => {
        if (details.open && window.MathJax?.typesetPromise) {
          window.MathJax.startup.promise.then(() => window.MathJax.typesetPromise([body])).catch(console.warn);
        }
      });
    });
    section.append(formulas, panel);
  });
  window.addEventListener('storage', event => {
    if (event.key !== cacheKey()) return;
    try {
      const next = JSON.parse(event.newValue) || {};
      if (typeof next !== 'object' || Array.isArray(next)) return;
      saved = next;
      records.forEach(({inputs, update}) => {
        inputs.forEach(input => { input.checked = saved[input.dataset.checkId] === true; });
        update();
      });
    } catch (_) { /* Ignore malformed storage from another tab. */ }
  });
  pending = read(pendingKey());
  changed.addEventListener('change', scheduleSync);
  window.addEventListener('online', scheduleSync);
  window.addEventListener('focus', scheduleSync);
  function connect() {
    if (!window.studySupabase) return;
    window.studySupabase.auth.onAuthStateChange(() => { setTimeout(scheduleSync, 0); });
    scheduleSync();
  }
  if (window.studySupabase) connect();
  else window.addEventListener('study-supabase-ready', connect, {once:true});
})();
