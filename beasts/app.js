/* 评论成精 — 界面层 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SAMPLE = [
    '难道就我觉得这期不行？',
    '其实吧，本质上这是常识了，但凡看过原片',
    'UP主我爱你啊啊啊啊老婆！！',
    '前排出售瓜子饮料',
    '前排出售瓜子饮料',
    '您可真棒呢，呵呵',
    '笑死我了！！！破防了',
    '根据相关文献记载，这个现象的成因主要有三点，数据统计见附件1.2.3.4.5',
    '@全体成员 楼下说得对，楼上说的不对，来对线啊？？',
    '这个剪辑也太拉了，我上我也行',
    '为什么没人提这个细节？难道只有我注意到了？',
    '三连了，UP主加油！',
    '哈哈哈哈哈哈哈哈哈哈',
    '路过看看'
  ].join('\n');

  const state = { result: null, units: {}, timer: null, playing: false };

  /* ---------- 卡片 ---------- */
  function cardEl(u) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.color = u.color;
    el.dataset.uid = u.uid;
    el.innerHTML = `
      <div class="card-top">
        <span class="card-emoji">${u.emoji}</span>
        <span class="card-name" style="color:${u.color}">${esc(u.displayName)}</span>
        <span class="card-role">${esc(u.name)} · ${esc(u.role)}</span>
      </div>
      <div class="bar"><i style="width:100%"></i></div>
      <div class="card-snippet" title="${esc(u.snippet)}">「${esc(u.snippet)}」</div>
      <div class="card-tags">${(u.tags || []).map(t => `<span class="tag" style="color:${u.color}">${esc(t)}</span>`).join('')}</div>
    `;
    return el;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function renderTeam(containerId, units) {
    const box = $(containerId);
    box.innerHTML = '';
    units.forEach((u) => {
      const el = cardEl(u);
      box.appendChild(el);
      state.units[u.uid] = { unit: u, el, bar: el.querySelector('.bar'), fill: el.querySelector('.bar > i') };
    });
  }

  function applySnapshot(snap) {
    if (!snap) return;
    for (const uid in snap) {
      const rec = state.units[uid];
      if (!rec) continue;
      const [hp, alive] = snap[uid];
      const pct = Math.max(0, Math.min(100, (hp / rec.unit.maxHp) * 100));
      rec.fill.style.width = pct + '%';
      rec.bar.classList.toggle('low', pct <= 34);
      rec.el.classList.toggle('ko', !alive);
    }
  }

  function flash(uid) {
    const rec = state.units[uid];
    if (!rec) return;
    rec.el.classList.remove('hit');
    void rec.el.offsetWidth;
    rec.el.classList.add('hit');
  }

  /* ---------- 日志 ---------- */
  function logLine(entry) {
    const p = document.createElement('p');
    const cls = 't-' + (entry.type || 'hit');
    const round = entry.round ? `<span class="round">R${entry.round}</span> ` : '';
    p.className = cls;
    p.innerHTML = round + esc(entry.text);
    return p;
  }

  /* ---------- 主流程 ---------- */
  function fight() {
    const raw = $('input').value.trim();
    if (!raw) {
      $('hint').textContent = '先丢点评论进来 —— 或者点「用示例评论区」';
      $('input').focus();
      return;
    }
    const parsed = CB.parseComments(raw);
    if (!parsed.length) {
      $('hint').textContent = '没解析出评论，一行一条试试';
      return;
    }
    const mine = CB.pickLineup(parsed, 5);
    const foe = CB.balanceFoe(CB.synthesizeFoe(raw, 5), mine);
    const result = CB.runBattle(mine, foe);

    state.result = result;
    state.units = {};
    $('arena').classList.remove('hidden');
    $('banner').className = 'banner';
    $('banner').textContent = '';

    renderTeam('cards-me', result.mine);
    renderTeam('cards-foe', result.foe);

    $('hint').textContent = `解析到 ${parsed.length} 条评论，${mine.length} 只出战`;
    play();
    $('arena').scrollIntoView({ block: 'start' });
  }

  function play() {
    const result = state.result;
    if (!result) return;
    stop();
    state.playing = true;

    const logBox = $('log');
    logBox.innerHTML = '';
    $('banner').className = 'banner';
    $('banner').textContent = '';

    // 重置血条
    for (const uid in state.units) {
      const rec = state.units[uid];
      rec.fill.style.width = '100%';
      rec.bar.classList.remove('low');
      rec.el.classList.remove('ko');
    }

    const speed = Number($('speed').value) || 2;
    const gap = { 1: 420, 2: 190, 3: 70 }[speed] || 190;
    let i = 0;

    const step = () => {
      if (i >= result.log.length) {
        state.playing = false;
        if (/[?&]debug/.test(location.search)) {
          const dbg = Object.keys(state.units).map(k => {
            const r = state.units[k];
            return k + ':' + Math.round(r.unit.hp) + '/' + r.unit.maxHp + '/' + r.fill.style.width + '/' + r.el.className;
          }).join(' ; ');
          document.title = 'DBG ' + dbg;
        }
        if (/[?&]share/.test(location.search)) previewShare();
        const b = $('banner');
        b.className = 'banner ' + (result.winner === 'me' ? 'win' : result.winner === 'foe' ? 'lose' : 'draw');
        b.textContent = result.winner === 'me' ? '我方评论区胜出' :
                        result.winner === 'foe' ? '隔壁评论区骑脸了' : '打平，评论区被折叠';
        return;
      }
      const entry = result.log[i++];
      logBox.appendChild(logLine(entry));
      logBox.scrollTop = logBox.scrollHeight;
      applySnapshot(entry.hp);

      for (const uid in state.units) {
        if (entry.text.indexOf(state.units[uid].unit.displayName) === 0) flash(uid);
      }
      state.timer = setTimeout(step, gap);
    };
    step();
  }

  function stop() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.playing = false;
  }

  /* ---------- 战力榜长图 ---------- */
  function buildShareCanvas() {
    const result = state.result;
    if (!result) return;
    const W = 1080, H = 1620;
    const c = $('shareCanvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#120c1e');
    grad.addColorStop(0.55, '#0a0810');
    grad.addColorStop(1, '#180d1a');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    // 光斑
    const blob = (x, y, r, color) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    blob(180, 120, 420, 'rgba(251,114,153,0.30)');
    blob(900, 260, 380, 'rgba(86,225,255,0.18)');

    // 标题
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = '800 74px "Microsoft YaHei", "PingFang SC", sans-serif';
    g.fillText('评论成精', 72, 140);
    g.fillStyle = 'rgba(251,114,153,0.95)';
    g.font = '700 26px ui-monospace, monospace';
    g.fillText('COMMENT BEASTS · 战力榜', 76, 186);

    // 比分
    g.fillStyle = 'rgba(236,232,245,0.85)';
    g.font = '600 30px "Microsoft YaHei", sans-serif';
    const mineAlive = result.mine.filter(u => u.alive).length;
    const foeAlive = result.foe.filter(u => u.alive).length;
    g.fillText(`我方存活 ${mineAlive}/${result.mine.length}　·　隔壁存活 ${foeAlive}/${result.foe.length}　·　${result.rounds} 回合`, 76, 240);

    const verdict = result.winner === 'me' ? '我方评论区胜出' : result.winner === 'foe' ? '隔壁评论区骑脸' : '打平，评论区被折叠';
    g.fillStyle = result.winner === 'me' ? '#56e1ff' : result.winner === 'foe' ? '#ff6b6b' : '#ffd166';
    g.font = '800 44px "Microsoft YaHei", sans-serif';
    g.fillText(verdict, 76, 306);

    // 排行榜
    const top = result.ranking.slice(0, 6);
    let y = 392;
    g.font = '600 26px "Microsoft YaHei", sans-serif';
    g.fillStyle = 'rgba(157,148,184,0.95)';
    g.fillText('全场输出榜', 76, y - 34);

    top.forEach((u, idx) => {
      g.fillStyle = 'rgba(255,255,255,0.045)';
      roundRect(g, 72, y, W - 144, 116, 22);
      g.fill();

      g.fillStyle = idx === 0 ? '#fb7299' : idx === 1 ? '#56e1ff' : 'rgba(157,148,184,0.85)';
      g.font = '800 40px ui-monospace, monospace';
      g.fillText(String(idx + 1).padStart(2, '0'), 104, y + 72);

      g.font = '800 36px "Microsoft YaHei", sans-serif';
      g.fillStyle = u.color || '#fff';
      g.fillText(u.emoji + ' ' + u.name, 186, y + 50);

      g.font = '400 24px "Microsoft YaHei", sans-serif';
      g.fillStyle = 'rgba(157,148,184,0.95)';
      const snip = u.snippet.length > 22 ? u.snippet.slice(0, 22) + '…' : u.snippet;
      g.fillText('「' + snip + '」', 186, y + 88);

      g.textAlign = 'right';
      g.font = '800 34px ui-monospace, monospace';
      g.fillStyle = '#ffffff';
      g.fillText(u.dealt + ' dmg', W - 104, y + 62);
      g.textAlign = 'left';

      y += 132;
    });

    // 页脚
    g.fillStyle = 'rgba(251,114,153,0.9)';
    g.font = '600 26px ui-monospace, monospace';
    g.fillText('tox832.github.io/beasts', 76, H - 96);
    g.fillStyle = 'rgba(157,148,184,0.8)';
    g.font = '400 24px "Microsoft YaHei", sans-serif';
    g.fillText('把评论区当食材 · 纯本地判定 · 不上传任何内容', 76, H - 54);

    return c;
  }

  function saveShare() {
    const c = buildShareCanvas();
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = c.toDataURL('image/png');
    a.download = '评论成精战力榜-' + stamp + '.png';
    a.click();
  }

  function previewShare() {
    const c = buildShareCanvas();
    const img = document.createElement('img');
    img.src = c.toDataURL('image/png');
    img.className = 'share-preview';
    img.alt = '评论成精战力榜';
    document.body.insertBefore(img, document.body.firstChild);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('btn-fight').addEventListener('click', fight);
    $('btn-sample').addEventListener('click', () => { $('input').value = SAMPLE; $('hint').textContent = '示例已就位，点开战'; });
    $('btn-clear').addEventListener('click', () => { $('input').value = ''; $('hint').textContent = '取战力最高的 5 条上场'; });
    $('btn-replay').addEventListener('click', play);
    $('btn-save').addEventListener('click', saveShare);
    $('speed').addEventListener('input', () => { if (state.result) play(); });
    $('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) fight();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    if (/[?&]demo/.test(location.search)) {
      $('input').value = SAMPLE;
      $('speed').value = '3';
      setTimeout(fight, 60);
    }
  });
})();
