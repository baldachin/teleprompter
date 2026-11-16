(() => {
  'use strict';

  const SETTINGS_KEY = 'teleprompter.settings.v1';
  const SCRIPTS_KEY = 'teleprompter.scripts.v1';
  const DRAFT_KEY = 'teleprompter.draft.v1';
  const LAST_KEY = 'teleprompter.last.v1';
  const CURRENT_ID_KEY = 'teleprompter.current.v1';

  const SPEED_RANGE = {
    cpm: { min: 60, max: 600, step: 10, unit: '字 / 分' },
    px: { min: 10, max: 300, step: 5, unit: '像素 / 秒' }
  };

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    fontSize: 48,
    lineHeight: 1.6,
    margin: 5,
    speedMode: 'cpm',
    speed: 300,
    countdown: 3,
    mirror: false,
    keepAwake: true
  };

  const SAMPLE_TEXT = [
    '大家好，欢迎使用这套提词器。',
    '',
    '第一件事：把脚本粘贴到编辑区，空行代表换段。',
    '第二件事：在快速设置里挑一个配色主题，字号和边距随手可调。',
    '第三件事：点开始提词，三秒倒计时后自动滚动。',
    '',
    '提词过程中点右上角的「设置」，可以在不中断提词的情况下实时调整。'
  ].join('\n');

  // 调试参数：?reset=1 在读取设置前清空本地数据
  if (new URLSearchParams(location.search).get('reset') === '1') {
    try { localStorage.clear(); } catch (err) { console.warn('清空本地数据失败：', err); }
  }

  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS, loadJson(SETTINGS_KEY, {})),
    scripts: loadJson(SCRIPTS_KEY, []),
    lastSession: loadJson(LAST_KEY, null),
    currentScriptId: localStorage.getItem(CURRENT_ID_KEY) || '',
    playing: false,
    offset: 0,
    maxOffset: 0,
    lastTs: 0,
    rafId: null,
    wakeLock: null,
    hudTimer: null,
    drag: null
  };

  const dom = {};
  let settingsPanel = null;

  /* ---------------- 存储 ---------------- */

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : fallback;
    } catch (err) {
      console.warn('本地数据读取失败：', err);
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('本地数据写入失败：', err);
    }
  }

  function saveSettings() {
    saveJson(SETTINGS_KEY, state.settings);
  }

  /* ---------------- 初始化 ---------------- */

  function cacheDom() {
    const ids = [
      'prepareScreen', 'prompterScreen', 'scriptInput', 'charCount', 'btnClear', 'btnImportTxt',
      'btnSample', 'btnSaveScript', 'fileInput', 'btnStart', 'btnNew', 'btnResume', 'btnLibrary',
      'btnToggleSettings', 'settingsHost', 'countdown', 'countdownValue', 'btnHelp',
      'libraryBackdrop', 'btnCloseLibrary', 'scriptList', 'libraryEmpty',
      'viewport', 'prompterContent', 'countdownOverlay', 'hudTop', 'hudBottom', 'hudStatus',
      'btnExit', 'btnOpenSheet', 'btnToggle', 'btnSlower', 'btnFaster', 'sheetBackdrop',
      'btnCloseSheet', 'sheetHost', 'finishOverlay', 'btnReplay', 'btnBackPrepare', 'btnNextScript', 'helpBackdrop', 'btnCloseHelp'
    ];
    ids.forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function init() {
    cacheDom();
    buildSettingsPanel();
    restoreSettingsToUi();
    restoreDraft();
    bindEditorEvents();
    bindSettingsEvents();
    bindPrompterEvents();
    renderLibrary();
    updateResumeLabel();
    applyUrlParams();
    registerServiceWorker();
  }

  /* ---------------- 设置面板（准备台与抽屉共用） ---------------- */

  function buildSettingsPanel() {
    const template = document.getElementById('settingsPanelTemplate');
    settingsPanel = template.content.firstElementChild.cloneNode(true);
    mountSettingsPanel(dom.settingsHost);
  }

  function mountSettingsPanel(host) {
    if (!settingsPanel || !host) return;
    if (settingsPanel.parentElement === host) return;
    host.appendChild(settingsPanel);
  }

  function bindSettingsEvents() {
    bindRange(settingsPanel.querySelector('#fontSize'), 'fontSize');
    bindRange(settingsPanel.querySelector('#lineHeight'), 'lineHeight');
    bindRange(settingsPanel.querySelector('#margin'), 'margin');
    bindRange(settingsPanel.querySelector('#speed'), 'speed');

    settingsPanel.querySelector('#mirror').addEventListener('change', (event) => {
      state.settings.mirror = event.target.checked;
      saveSettings();
      applyPrompterStyles();
    });

    settingsPanel.querySelector('#keepAwake').addEventListener('change', (event) => {
      state.settings.keepAwake = event.target.checked;
      saveSettings();
      if (state.playing && state.settings.keepAwake) requestWakeLock();
    });

    settingsPanel.querySelector('#themePicker').addEventListener('click', (event) => {
      const chip = event.target.closest('.theme-chip');
      if (!chip) return;
      state.settings.theme = chip.dataset.theme;
      saveSettings();
      syncSettingsUi();
      applyPrompterStyles();
    });

    settingsPanel.querySelector('#speedMode').addEventListener('click', (event) => {
      const btn = event.target.closest('.mode-btn');
      if (!btn || btn.dataset.mode === state.settings.speedMode) return;
      switchSpeedMode(btn.dataset.mode);
    });
  }

  function bindRange(input, key) {
    input.addEventListener('input', () => {
      const raw = parseFloat(input.value);
      state.settings[key] = key === 'lineHeight' ? raw : Math.round(raw);
      saveSettings();
      syncSettingsUi();
      applyPrompterStyles();
    });
  }

  function switchSpeedMode(mode) {
    const currentPx = effectiveSpeed();
    state.settings.speedMode = mode;
    state.settings.speed = mode === 'px'
      ? clamp(Math.round(currentPx), SPEED_RANGE.px.min, SPEED_RANGE.px.max)
      : clamp(Math.round(pxToCpm(currentPx)), SPEED_RANGE.cpm.min, SPEED_RANGE.cpm.max);
    saveSettings();
    syncSettingsUi();
  }

  function restoreSettingsToUi() {
    const s = state.settings;
    settingsPanel.querySelector('#fontSize').value = s.fontSize;
    settingsPanel.querySelector('#lineHeight').value = s.lineHeight;
    settingsPanel.querySelector('#margin').value = s.margin;
    settingsPanel.querySelector('#mirror').checked = !!s.mirror;
    settingsPanel.querySelector('#keepAwake').checked = !!s.keepAwake;
    dom.countdown.value = s.countdown;
    dom.countdownValue.textContent = s.countdown;
    syncSettingsUi();
  }

  function syncSettingsUi() {
    const s = state.settings;
    const panel = settingsPanel;
    if (!panel) return;

    const fontSizeInput = panel.querySelector('#fontSize');
    const lineHeightInput = panel.querySelector('#lineHeight');
    const marginInput = panel.querySelector('#margin');
    const speedInput = panel.querySelector('#speed');

    if (document.activeElement !== fontSizeInput) fontSizeInput.value = s.fontSize;
    if (document.activeElement !== lineHeightInput) lineHeightInput.value = s.lineHeight;
    if (document.activeElement !== marginInput) marginInput.value = s.margin;

    const range = SPEED_RANGE[s.speedMode];
    speedInput.min = range.min;
    speedInput.max = range.max;
    speedInput.step = range.step;
    if (document.activeElement !== speedInput) speedInput.value = s.speed;

    panel.querySelector('#fontSizeValue').textContent = s.fontSize;
    panel.querySelector('#lineHeightValue').textContent = Number(s.lineHeight).toFixed(2);
    panel.querySelector('#marginValue').textContent = s.margin;
    panel.querySelector('#speedValue').textContent = s.speed;
    panel.querySelector('#speedCaption').innerHTML = (s.speedMode === 'cpm' ? '语速 ' : '速度 ') +
      '<b id="speedValue">' + s.speed + '</b> ' + range.unit;

    const hint = panel.querySelector('#speedHint');
    if (s.speedMode === 'px') {
      hint.textContent = '直接控制滚动快慢，不随字号变化。';
    } else {
      hint.textContent = '≈ ' + Math.round(effectiveSpeed()) + ' px/s（按中文全角估算，随字号联动）';
    }

    panel.querySelectorAll('.theme-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.theme === s.theme);
    });
    panel.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === s.speedMode);
    });
  }

  /* ---------------- 速度换算 ---------------- */

  function charsPerLine() {
    const s = state.settings;
    const vw = dom.viewport.clientWidth || window.innerWidth || 390;
    const lineWidth = Math.max(80, vw - (s.margin / 100) * vw * 2);
    return Math.max(3, Math.floor(lineWidth / s.fontSize));
  }

  function effectiveSpeed() {
    const s = state.settings;
    if (s.speedMode === 'px') return s.speed;
    const linesPerSec = (s.speed / 60) / charsPerLine();
    return linesPerSec * s.fontSize * s.lineHeight;
  }

  function pxToCpm(px) {
    const s = state.settings;
    const linesPerSec = px / (s.fontSize * s.lineHeight);
    return linesPerSec * charsPerLine() * 60;
  }

  /* ---------------- 准备台 ---------------- */

  function bindEditorEvents() {
    dom.scriptInput.addEventListener('input', () => {
      updateCharCount();
      saveJson(DRAFT_KEY, dom.scriptInput.value);
    });

    dom.btnClear.addEventListener('click', () => {
      if (dom.scriptInput.value && !confirm('确定清空当前脚本？')) return;
      dom.scriptInput.value = '';
      state.currentScriptId = '';
      localStorage.removeItem(CURRENT_ID_KEY);
      updateCharCount();
      saveJson(DRAFT_KEY, '');
    });

    dom.btnNew.addEventListener('click', () => {
      if (dom.scriptInput.value && !confirm('新建将清空当前脚本，确定继续？')) return;
      dom.scriptInput.value = '';
      state.currentScriptId = '';
      localStorage.removeItem(CURRENT_ID_KEY);
      updateCharCount();
      saveJson(DRAFT_KEY, '');
      dom.scriptInput.focus();
    });

    dom.btnResume.addEventListener('click', () => {
      if (!state.lastSession || !state.lastSession.text) return;
      dom.scriptInput.value = state.lastSession.text;
      updateCharCount();
      saveJson(DRAFT_KEY, state.lastSession.text);
      dom.scriptInput.focus();
    });

    dom.btnLibrary.addEventListener('click', () => openSheet(dom.libraryBackdrop));
    dom.btnCloseLibrary.addEventListener('click', () => closeSheet(dom.libraryBackdrop));
    dom.libraryBackdrop.addEventListener('click', (event) => {
      if (event.target === dom.libraryBackdrop) closeSheet(dom.libraryBackdrop);
    });

    dom.btnHelp.addEventListener('click', () => openSheet(dom.helpBackdrop));
    dom.btnCloseHelp.addEventListener('click', () => closeSheet(dom.helpBackdrop));

    dom.btnImportTxt.addEventListener('click', () => dom.fileInput.click());

    dom.fileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        dom.scriptInput.value = String(reader.result || '');
        updateCharCount();
        saveJson(DRAFT_KEY, dom.scriptInput.value);
      };
      reader.onerror = () => alert('文件读取失败');
      reader.readAsText(file, 'utf-8');
      event.target.value = '';
    });

    dom.btnSample.addEventListener('click', () => {
      dom.scriptInput.value = SAMPLE_TEXT;
      updateCharCount();
      saveJson(DRAFT_KEY, SAMPLE_TEXT);
    });

    dom.btnSaveScript.addEventListener('click', saveCurrentScript);

    dom.countdown.addEventListener('input', () => {
      state.settings.countdown = parseInt(dom.countdown.value, 10);
      dom.countdownValue.textContent = state.settings.countdown;
      saveSettings();
    });

    dom.btnToggleSettings.addEventListener('click', () => {
      const expanded = dom.btnToggleSettings.getAttribute('aria-expanded') === 'true';
      dom.btnToggleSettings.setAttribute('aria-expanded', String(!expanded));
      dom.settingsHost.classList.toggle('collapsed', expanded);
    });

    dom.btnStart.addEventListener('click', startPrompter);
  }

  function updateCharCount() {
    const text = dom.scriptInput.value;
    const chars = text.replace(/\s/g, '').length;
    dom.charCount.textContent = chars + ' 字';
  }

  function restoreDraft() {
    const draft = loadJson(DRAFT_KEY, '');
    if (typeof draft === 'string' && draft) {
      dom.scriptInput.value = draft;
    }
    updateCharCount();
  }

  function updateResumeLabel() {
    const btn = dom.btnResume;
    if (!state.lastSession || !state.lastSession.text) {
      btn.disabled = true;
      btn.textContent = '继续上次';
      return;
    }
    const time = new Date(state.lastSession.updatedAt).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    btn.innerHTML = '继续上次<span class="sub">' + escapeHtml(time) + '</span>';
    btn.disabled = false;
  }

  /* ---------------- 脚本库 ---------------- */

  function saveCurrentScript() {
    const text = dom.scriptInput.value.trim();
    if (!text) {
      alert('当前没有脚本内容');
      return;
    }
    const name = prompt('脚本名称', text.slice(0, 12)) || text.slice(0, 12);
    const item = {
      id: 's' + Date.now(),
      name: name.trim() || '未命名脚本',
      text: text,
      updatedAt: Date.now()
    };
    state.scripts.unshift(item);
    saveJson(SCRIPTS_KEY, state.scripts);
    setCurrentScript(item.id);
    renderLibrary();
  }

  function setCurrentScript(id) {
    state.currentScriptId = id || '';
    if (id) localStorage.setItem(CURRENT_ID_KEY, id);
    else localStorage.removeItem(CURRENT_ID_KEY);
  }

  function renderLibrary() {
    dom.libraryEmpty.hidden = state.scripts.length > 0;
    dom.scriptList.innerHTML = '';
    state.scripts.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'script-item';

      const main = document.createElement('button');
      main.className = 'name';
      main.innerHTML = '<div>' + escapeHtml(item.name) + '</div><div class="sub">' +
        new Date(item.updatedAt).toLocaleString('zh-CN') + '</div>';
      main.addEventListener('click', () => {
        dom.scriptInput.value = item.text;
        setCurrentScript(item.id);
        updateCharCount();
        saveJson(DRAFT_KEY, item.text);
        closeSheet(dom.libraryBackdrop);
      });

      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        state.scripts = state.scripts.filter((s) => s.id !== item.id);
        saveJson(SCRIPTS_KEY, state.scripts);
        if (state.currentScriptId === item.id) setCurrentScript('');
        renderLibrary();
      });

      li.appendChild(main);
      li.appendChild(del);
      dom.scriptList.appendChild(li);
    });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------------- 提词页 ---------------- */

  function bindPrompterEvents() {
    dom.btnExit.addEventListener('click', exitPrompter);
    dom.btnToggle.addEventListener('click', () => (state.playing ? pause() : play()));
    dom.btnSlower.addEventListener('click', () => adjustSpeed(-1));
    dom.btnFaster.addEventListener('click', () => adjustSpeed(1));

    dom.btnOpenSheet.addEventListener('click', () => {
      mountSettingsPanel(dom.sheetHost);
      syncSettingsUi();
      openSheet(dom.sheetBackdrop);
    });
    dom.btnCloseSheet.addEventListener('click', () => closeSheet(dom.sheetBackdrop));
    dom.sheetBackdrop.addEventListener('click', (event) => {
      if (event.target === dom.sheetBackdrop) closeSheet(dom.sheetBackdrop);
    });

    dom.btnReplay.addEventListener('click', () => {
      closeFinishOverlay();
      state.offset = 0;
      render();
      play();
    });
    dom.btnBackPrepare.addEventListener('click', () => {
      closeFinishOverlay();
      exitPrompter();
    });
    dom.btnNextScript.addEventListener('click', () => {
      const next = nextScript();
      closeFinishOverlay();
      if (!next) {
        exitPrompter();
        return;
      }
      dom.scriptInput.value = next.text;
      setCurrentScript(next.id);
      updateCharCount();
      saveJson(DRAFT_KEY, next.text);
      startPrompter();
    });

    dom.viewport.addEventListener('pointerdown', onPointerDown);
    dom.viewport.addEventListener('pointermove', onPointerMove);
    dom.viewport.addEventListener('pointerup', onPointerUp);
    dom.viewport.addEventListener('pointercancel', onPointerUp);

    document.addEventListener('keydown', (event) => {
      if (dom.prompterScreen.classList.contains('hidden')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        state.playing ? pause() : play();
      } else if (event.code === 'ArrowUp') {
        adjustSpeed(1);
      } else if (event.code === 'ArrowDown') {
        adjustSpeed(-1);
      } else if (event.code === 'Escape') {
        exitPrompter();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.playing && state.settings.keepAwake) {
        requestWakeLock();
      }
    });
  }

  function nextScript() {
    if (!state.scripts.length) return null;
    const index = state.scripts.findIndex((s) => s.id === state.currentScriptId);
    if (index === -1) return state.scripts[0];
    return state.scripts[index + 1] || null;
  }

  function startPrompter() {
    const text = dom.scriptInput.value.trim();
    if (!text) {
      alert('请先输入或导入脚本内容');
      return;
    }

    snapshotSession(text);
    buildContent(text);
    dom.prepareScreen.classList.add('hidden');
    dom.prompterScreen.classList.remove('hidden');
    mountSettingsPanel(dom.sheetHost);
    state.offset = 0;
    state.playing = false;
    applyPrompterStyles();
    measure();
    render();
    showHud();
    runCountdown();
  }

  function snapshotSession(text) {
    state.lastSession = { text: text, updatedAt: Date.now() };
    saveJson(LAST_KEY, state.lastSession);
    updateResumeLabel();
  }

  function buildContent(text) {
    dom.prompterContent.innerHTML = '';
    const lines = document.createElement('div');
    lines.className = 'prompter-lines';

    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        const spacer = document.createElement('p');
        spacer.className = 'spacer';
        lines.appendChild(spacer);
        return;
      }
      const p = document.createElement('p');
      p.textContent = line;
      lines.appendChild(p);
    });

    dom.prompterContent.appendChild(lines);
    applyPrompterStyles();
  }

  function applyPrompterStyles() {
    const s = state.settings;
    dom.prompterScreen.dataset.theme = s.theme;
    dom.prompterContent.style.fontSize = s.fontSize + 'px';
    dom.prompterContent.style.lineHeight = s.lineHeight;
    dom.prompterContent.style.setProperty('--tp-margin', s.margin + '%');

    const lines = dom.prompterContent.querySelector('.prompter-lines');
    if (lines) lines.classList.toggle('mirror', !!s.mirror);

    if (!dom.prompterScreen.classList.contains('hidden')) {
      measure();
      state.offset = clamp(state.offset, 0, state.maxOffset);
      render();
    }
    syncSettingsUi();
  }

  function measure() {
    const viewportHeight = dom.viewport.clientHeight || window.innerHeight;
    const contentHeight = dom.prompterContent.scrollHeight;
    state.maxOffset = Math.max(0, contentHeight - viewportHeight);
  }

  function render() {
    dom.prompterContent.style.transform = 'translate3d(0,' + (-state.offset) + 'px,0)';
    updateHighlight();
    updateProgress();
  }

  function updateHighlight() {
    const lines = dom.prompterContent.querySelectorAll('.prompter-lines p:not(.spacer)');
    if (!lines.length) return;

    // 段落 offsetParent 是 .prompter-lines（带 transform），需换算回内容容器坐标
    const wrap = dom.prompterContent.querySelector('.prompter-lines');
    const wrapTop = wrap ? wrap.offsetTop : 0;
    const target = state.offset + wrapTop;

    let active = null;
    let upcoming = null;
    lines.forEach((p) => {
      const top = wrapTop + p.offsetTop;
      const bottom = top + p.offsetHeight;
      if (!active && top <= target && bottom > target) active = p;
      if (!upcoming && top > target) upcoming = p;
    });
    if (!active) active = upcoming;

    lines.forEach((p) => p.classList.remove('active'));
    if (active) active.classList.add('active');
  }

  function updateProgress() {
    const percent = state.maxOffset > 0 ? Math.min(100, Math.round((state.offset / state.maxOffset) * 100)) : 0;
    dom.hudStatus.textContent = (state.playing ? '提词中' : '已暂停') + ' · ' + percent + '%';
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    state.lastTs = 0;
    dom.btnToggle.textContent = '暂停';
    state.rafId = requestAnimationFrame(tick);
    if (state.settings.keepAwake) requestWakeLock();
    showHud();
    updateProgress();
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    dom.btnToggle.textContent = '继续';
    showHud();
    updateProgress();
  }

  function tick(ts) {
    if (!state.playing) return;
    const delta = state.lastTs ? (ts - state.lastTs) / 1000 : 0;
    state.lastTs = ts;
    state.offset += effectiveSpeed() * delta;

    if (state.offset >= state.maxOffset) {
      state.offset = state.maxOffset;
      render();
      pause();
      showFinishOverlay();
      return;
    }
    render();
    state.rafId = requestAnimationFrame(tick);
  }

  function adjustSpeed(direction) {
    const s = state.settings;
    const range = SPEED_RANGE[s.speedMode];
    const step = s.speedMode === 'cpm' ? 20 : 10;
    s.speed = clamp(s.speed + direction * step, range.min, range.max);
    saveSettings();
    syncSettingsUi();
    showHud();
  }

  function runCountdown() {
    const total = Math.round(state.settings.countdown);
    if (total <= 0) {
      play();
      return;
    }
    let left = total;
    dom.countdownOverlay.hidden = false;
    dom.countdownOverlay.textContent = String(left);

    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        dom.countdownOverlay.hidden = true;
        play();
        return;
      }
      dom.countdownOverlay.textContent = String(left);
    }, 1000);
  }

  /* ---------------- 完成态 ---------------- */

  function showFinishOverlay() {
    const next = nextScript();
    dom.btnNextScript.disabled = !next;
    dom.finishOverlay.hidden = false;
  }

  function closeFinishOverlay() {
    dom.finishOverlay.hidden = true;
  }

  /* ---------------- 拖拽与 HUD ---------------- */

  function onPointerDown(event) {
    state.drag = {
      id: event.pointerId,
      startY: event.clientY,
      startOffset: state.offset,
      moved: false,
      wasPlaying: state.playing
    };
    dom.viewport.setPointerCapture(event.pointerId);
    if (state.playing) pause();
  }

  function onPointerMove(event) {
    if (!state.drag || event.pointerId !== state.drag.id) return;
    const dy = state.drag.startY - event.clientY;
    if (!state.drag.moved && Math.abs(dy) < 6) return;
    state.drag.moved = true;
    state.offset = clamp(state.drag.startOffset + dy, 0, state.maxOffset);
    render();
  }

  function onPointerUp(event) {
    if (!state.drag || event.pointerId !== state.drag.id) return;
    const wasTap = !state.drag.moved;
    const wasPlaying = state.drag.wasPlaying;
    state.drag = null;
    if (wasTap) {
      toggleHud();
    } else if (wasPlaying) {
      play();
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toggleHud() {
    const dim = dom.hudTop.classList.contains('dim');
    dom.hudTop.classList.toggle('dim', !dim);
    dom.hudBottom.classList.toggle('dim', !dim);
  }

  function showHud() {
    dom.hudTop.classList.remove('dim');
    dom.hudBottom.classList.remove('dim');
    if (state.hudTimer) clearTimeout(state.hudTimer);
    state.hudTimer = setTimeout(() => {
      if (state.playing) {
        dom.hudTop.classList.add('dim');
        dom.hudBottom.classList.add('dim');
      }
    }, 3000);
  }

  function exitPrompter() {
    pause();
    releaseWakeLock();
    closeFinishOverlay();
    closeSheet(dom.sheetBackdrop);
    mountSettingsPanel(dom.settingsHost);
    dom.prompterScreen.classList.add('hidden');
    dom.prepareScreen.classList.remove('hidden');
    snapshotSession(dom.scriptInput.value.trim());
  }

  /* ---------------- 抽屉 ---------------- */

  function openSheet(backdrop) {
    if (!backdrop) return;
    backdrop.hidden = false;
  }

  function closeSheet(backdrop) {
    if (!backdrop) return;
    backdrop.hidden = true;
  }

  /* ---------------- 常亮 ---------------- */

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
      console.warn('屏幕常亮申请失败：', err);
    }
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release().catch(() => {});
      state.wakeLock = null;
    }
  }

  /* ---------------- URL 参数 ---------------- */

  function applyUrlParams() {
    const params = new URLSearchParams(location.search);


    // 调试/演示参数：?panel=1 展开准备台设置面板，?sheet=1 展开提词抽屉，?finish=1 直接展示完成态
    if (params.get('panel') === '1') {
      dom.btnToggleSettings.setAttribute('aria-expanded', 'true');
      dom.settingsHost.classList.remove('collapsed');
    }

    const text = params.get('text');
    if (!text) return;

    dom.scriptInput.value = text;
    updateCharCount();
    saveJson(DRAFT_KEY, text);

    const theme = params.get('theme');
    if (theme && ['dark', 'light', 'yellow'].includes(theme)) {
      state.settings.theme = theme;
    }
    const speed = parseInt(params.get('speed'), 10);
    if (speed >= SPEED_RANGE.cpm.min && speed <= SPEED_RANGE.cpm.max) {
      state.settings.speed = speed;
    }
    const fontSize = parseInt(params.get('fs'), 10);
    if (fontSize >= 20 && fontSize <= 96) {
      state.settings.fontSize = fontSize;
    }
    const margin = parseInt(params.get('margin'), 10);
    if (margin >= 0 && margin <= 18) {
      state.settings.margin = margin;
    }
    const countdown = parseInt(params.get('cd'), 10);
    if (countdown >= 0 && countdown <= 10) {
      state.settings.countdown = countdown;
    }
    if (params.get('mirror') === '1') {
      state.settings.mirror = true;
    }
    saveSettings();
    restoreSettingsToUi();
    applyPrompterStyles();

    if (params.get('auto') === '1') startPrompter();
    if (params.get('finish') === '1') showFinishOverlay();

    // 调试/演示用：?sheet=1 展开提词设置抽屉
    if (params.get('sheet') === '1') {
      mountSettingsPanel(dom.sheetHost);
      syncSettingsUi();
      openSheet(dom.sheetBackdrop);
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service Worker 注册失败：', err);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();