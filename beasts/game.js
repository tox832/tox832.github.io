/* 评论成精 Comment Beasts — 把 B 站评论区变成一场回合制群架
 * 纯前端、零后端、可离线跑。规则引擎本地判定，不依赖任何 API。
 */
(function (global) {
  'use strict';

  /* ---------------- 妖怪原型表 ---------------- */
  const ARCH = {
    koujo: {
      id: 'koujo', name: '杠精', emoji: '🔥', color: '#ff6b6b', role: '物理输出',
      base: { hp: 108, atk: 23, def: 8, spd: 12, crit: 0.25 },
      skill: '反手一句"难道不是？"，无视对方 30% 防御'
    },
    tian: {
      id: 'tian', name: '舔狗', emoji: '🐶', color: '#ffd166', role: '坦克奶妈',
      base: { hp: 186, atk: 12, def: 15, spd: 6, crit: 0.08 },
      skill: '给全队续一口，回复 12% 最大生命'
    },
    dong: {
      id: 'dong', name: '懂王', emoji: '🧐', color: '#8ecae6', role: '增益',
      base: { hp: 128, atk: 16, def: 10, spd: 9, crit: 0.12 },
      skill: '"其实吧，本质上…"，全队攻击 +18%'
    },
    fudu: {
      id: 'fudu', name: '复读机', emoji: '🔁', color: '#b8b8ff', role: '诡异',
      base: { hp: 142, atk: 15, def: 12, spd: 10, crit: 0.1 },
      skill: '复读上一击，按原伤害再打一次'
    },
    yinyang: {
      id: 'yinyang', name: '阴阳人', emoji: '🌚', color: '#9b5de5', role: '持续伤害',
      base: { hp: 120, atk: 18, def: 9, spd: 11, crit: 0.15 },
      skill: '"您可真棒呢"，附加中毒 3 回合'
    },
    qingxu: {
      id: 'qingxu', name: '情绪炸弹', emoji: '💥', color: '#f15bb5', role: '暴击',
      base: { hp: 96, atk: 27, def: 6, spd: 14, crit: 0.4 },
      skill: '绷不住了，本回合伤害 ×1.6'
    },
    kepu: {
      id: 'kepu', name: '科普怪', emoji: '📚', color: '#80ed99', role: '肉盾',
      base: { hp: 214, atk: 11, def: 18, spd: 5, crit: 0.05 },
      skill: '贴三千字长文，替队友挡一次伤害'
    },
    yinzhan: {
      id: 'yinzhan', name: '引战王', emoji: '⚔️', color: '#ff8700', role: '溅射',
      base: { hp: 152, atk: 20, def: 11, spd: 8, crit: 0.18 },
      skill: '@全体成员，40% 伤害溅射到第二个目标'
    },
    luren: {
      id: 'luren', name: '路人', emoji: '🙂', color: '#adb5bd', role: '均衡',
      base: { hp: 150, atk: 16, def: 12, spd: 10, crit: 0.1 },
      skill: '路过，顺手点了个赞'
    }
  };

  /* ---------------- 特征词表 ---------------- */
  const KW = {
    dong: /(其实|事实上|本质上|严格来说|准确地说|纠正一下|科普|常识|显然|但凡|逻辑上|从专业角度)/,
    koujo: /(难道|凭什么|不是吧|你确定|笑了|反了吧|谁告诉|有本事|来啊|不服)/,
    tian: /(可爱|老婆|老公|呜呜|喜欢|爱了|抱走|awsl|萌|好耶|亲亲|贴贴)/,
    yinyang: /(呵呵|微笑|真棒|有意思|您可真|行吧|懂的都懂|高情商|好厉害哦|您开心就好)/,
    qingxu: /(笑死|泪目|破防|血压|绷不住|救命|啊啊啊|破大防|寄|逆天)/,
    yinzhan: /(@|楼下|楼上|回复|打起来|撕|战|不服来辨|对线)/,
    insult: /(傻[逼比bB]|蠢|弱智|废物|辣鸡|垃圾|什么玩意|喷子|嘴臭)/,
    kepu: /(文献|记载|数据|统计|引用|详见|补充一下|原理|机制|科普一下)/
  };

  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;

  /* ---------------- 工具 ---------------- */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function rngFrom(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17; s >>>= 0;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function bigrams(s) {
    const out = new Set();
    const t = s.replace(/[\s\p{P}]/gu, '');
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    a.forEach(v => { if (b.has(v)) inter++; });
    return inter / (a.size + b.size - inter);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------------- 单条评论 → 妖怪属性 ---------------- */
  function analyze(text, prevText) {
    const t = String(text || '').trim();
    const len = t.length;
    const q = (t.match(/[?？]/g) || []).length;
    const ex = (t.match(/[!！]/g) || []).length;
    const emojiCount = (t.match(EMOJI) || []).length;
    const digits = (t.match(/\d/g) || []).length;
    const ellipsis = (t.match(/\.{3,}|。{3,}|…/g) || []).length;
    const repeatRun = /(.)\1{3,}/.test(t);
    const hasLink = /https?:\/\/|b23\.tv|BV[0-9A-Za-z]{10}/.test(t);

    const hits = [];
    let score = { koujo: 0, tian: 0, dong: 0, fudu: 0, yinyang: 0, qingxu: 0, kepu: 0, yinzhan: 0, luren: 0 };

    if (KW.dong.test(t)) { score.dong += 2; hits.push('讲道理'); }
    if (KW.koujo.test(t)) { score.koujo += 2; hits.push('抬杠'); }
    if (/(老婆|老公|awsl|贴贴|爱了|抱走|亲亲|好耶)/i.test(t)) { score.tian += 4.0; hits.push('发情'); }
    else if (KW.tian.test(t) || /(加油|冲冲冲|三连|支持)/.test(t)) { score.tian += 2.2; hits.push('发情'); }
    if (KW.yinyang.test(t)) { score.yinyang += 2; hits.push('阴阳'); }
    if (KW.qingxu.test(t)) { score.qingxu += 2; hits.push('破防'); }
    if (KW.yinzhan.test(t)) { score.yinzhan += 2; hits.push('引战'); }

    if (KW.insult.test(t)) { score.koujo += 1.2; score.yinzhan += 1.2; hits.push('嘴脏'); }
    if (KW.kepu.test(t)) { score.kepu += 2.5; hits.push('论文体'); }
    if (len > 80 || digits >= 5) { score.kepu += 3; hits.push('论文体'); }
    else if (len > 45) { score.kepu += 1.2; }
    if (emojiCount >= 3) { score.qingxu += 1.5; score.tian += 1; }
    if (ex >= 2) { score.qingxu += 1.5; }
    if (q >= 2) { score.koujo += 1.2; score.yinzhan += 0.8; }
    if (ellipsis >= 2) { score.yinyang += 1; }
    if (repeatRun) { score.fudu += 2; hits.push('复读'); }
    if (hasLink) { score.yinzhan += 1; score.dong += 1; }

    if (prevText) {
      const sim = jaccard(bigrams(t), bigrams(prevText));
      if (sim >= 0.72) { score.fudu += 4; hits.push('复读机'); }
      else if (sim >= 0.45) { score.fudu += 1; }
    }
    if (len <= 4) { score.luren += 2; }
    if (len < 2) { score.luren += 3; }

    let best = 'luren', bestV = -1;
    for (const k in score) {
      if (score[k] > bestV) { bestV = score[k]; best = k; }
    }
    if (bestV < 1.5) best = 'luren';

    // 属性：原型基线 + 文本特征微调 + 稳定随机扰动
    const a = ARCH[best];
    const seed = hash(t);
    const r = rngFrom(seed);
    const jitter = v => 1 + (r() * 0.18 - 0.09);
    const hpBonus = clamp(len * 1.6 + emojiCount * 2 + digits * 0.8, 0, 90);
    const atkBonus = clamp((ex + q) * 1.6 + (KW.insult.test(t) ? 6 : 0) + ellipsis * 2, 0, 26);
    const defBonus = clamp(len > 60 ? 8 : len > 25 ? 3 : 0, 0, 10);

    return {
      arch: a.id,
      name: a.name,
      emoji: a.emoji,
      color: a.color,
      role: a.role,
      skill: a.skill,
      snippet: t.length > 26 ? t.slice(0, 26) + '…' : t,
      raw: t,
      tags: hits.slice(0, 3),
      stats: {
        hp: Math.round((a.base.hp + hpBonus) * jitter(1)),
        atk: Math.round((a.base.atk + atkBonus) * jitter(1)),
        def: Math.round((a.base.def + defBonus) * jitter(1)),
        spd: Math.round(a.base.spd + (emojiCount ? 1 : 0) * (r() > 0.5 ? 1 : 0)),
        crit: clamp(a.base.crit + (r() * 0.08 - 0.04), 0.03, 0.6)
      }
    };
  }

  /* ---------------- 文本 → 队伍 ---------------- */
  function parseComments(text, limit) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(s => s.replace(/^\s*[-*\d.、)\]]+\s*/, '').trim())
      .filter(s => s.length > 0 && s.length < 400);
    const units = [];
    let prev = null;
    for (const line of lines) {
      units.push(analyze(line, prev));
      prev = line;
      if (limit && units.length >= limit) break;
    }
    return units;
  }

  /* ---------------- 对手合成 ---------------- */
  const FOE_NAMES = ['隔壁键盘侠', '三连路人', '只看不说话', '封面党', '考古学家', '白嫖怪', '第一个到', '夜班观众', '弹幕护法', '进度条战士', '已读不回', '云玩家'];
  const FOE_LINES = {
    koujo: ['难道就我觉得不行？', '这也叫好？', '不是，你们真觉得行？'],
    tian: ['UP主我爱你啊啊啊', '老婆！！', '呜呜呜太好了'],
    dong: ['其实吧，本质上不是这样', '严格来说，这是常识', '从专业角度讲…'],
    fudu: ['前排出售瓜子饮料', '前排出售瓜子饮料', '前排出售瓜子饮料'],
    yinyang: ['您可真棒呢', '呵呵，真好', '懂了，您开心就好'],
    qingxu: ['破防了破防了救命', '笑死我了啊啊啊啊', '绷不住了！！'],
    kepu: ['根据相关文献记载，这个现象的成因主要有三点…', '补充一下资料：详见附件'],
    yinzhan: ['@全体成员 来对线', '楼下说得对，楼上说的不对', '打起来打起来'],
    luren: ['路过看看', '打卡', '沙发']
  };

  function synthesizeFoe(seedText, size) {
    const r = rngFrom(hash(String(seedText) + '|foe') || 7);
    const keys = Object.keys(ARCH);
    const units = [];
    for (let i = 0; i < (size || 5); i++) {
      const id = keys[Math.floor(r() * keys.length)];
      const line = FOE_LINES[id][Math.floor(r() * FOE_LINES[id].length)];
      const u = analyze(line);
      u.arch = id; u.name = ARCH[id].name; u.emoji = ARCH[id].emoji;
      u.color = ARCH[id].color; u.role = ARCH[id].role; u.skill = ARCH[id].skill;
      u.displayName = FOE_NAMES[(i * 3 + Math.floor(r() * 11)) % FOE_NAMES.length].slice(0, 6);
      units.push(u);
    }
    return units;
  }

  /* ---------------- 强度匹配：让隔壁评论区别太菜 ---------------- */
  function balanceFoe(foeProfiles, mineProfiles) {
    const mineSum = mineProfiles.reduce((a, p) => a + power(p), 0) || 1;
    const foeSum = foeProfiles.reduce((a, p) => a + power(p), 0) || 1;
    const k = Math.max(0.82, Math.min(1.35, mineSum / foeSum));
    return foeProfiles.map(p => {
      const q = JSON.parse(JSON.stringify(p));
      q.stats.hp = Math.round(q.stats.hp * k);
      q.stats.atk = Math.round(q.stats.atk * (0.6 + k * 0.4));
      q.stats.def = Math.round(q.stats.def * (0.7 + k * 0.3));
      return q;
    });
  }

  /* ---------------- 组队 ---------------- */
  function buildTeam(profiles, side) {
    return profiles.map((p, i) => ({
      uid: side + '-' + i,
      side,
      displayName: p.displayName || (p.name + ' #' + (i + 1)),
      arch: p.arch,
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      role: p.role,
      skill: p.skill,
      snippet: p.snippet,
      tags: p.tags || [],
      maxHp: p.stats.hp,
      hp: p.stats.hp,
      atk: p.stats.atk,
      def: p.stats.def,
      spd: p.stats.spd,
      crit: p.stats.crit,
      buff: 0,
      poison: 0,
      shield: 0,
      alive: true,
      dealt: 0,
      taken: 0
    }));
  }

  function pickTarget(enemies, rand) {
    const alive = enemies.filter(u => u.alive);
    if (!alive.length) return null;
    const sorted = alive.slice().sort((a, b) => a.hp - b.hp);
    return rand() < 0.72 ? sorted[0] : sorted[Math.floor(rand() * sorted.length)];
  }

  function damageOf(att, def, rand) {
    const base = att.atk * (1 + att.buff) - def.def * 0.5;
    const isCrit = rand() < att.crit;
    const dmg = Math.max(1, Math.round(base * (0.9 + rand() * 0.25) * (isCrit ? 1.8 : 1)));
    return { dmg, isCrit };
  }

  function applyDamage(target, dmg, log, round, sourceName, kind) {
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed; dmg -= absorbed;
      log.push({ round, type: 'shield', text: target.displayName + ' 用长文挡下了 ' + absorbed + ' 点伤害' });
    }
    if (dmg <= 0) return;
    target.hp -= dmg;
    target.taken += dmg;
    if (target.hp <= 0) {
      target.hp = 0; target.alive = false;
      log.push({ round, type: 'ko', text: target.displayName + '（' + target.name + '）被打到退出了评论区' });
    }
  }

  /* ---------------- 战斗主循环 ---------------- */
  function runBattle(myProfiles, foeProfiles) {
    const mine = buildTeam(myProfiles, 'me');
    const foe = buildTeam(foeProfiles, 'foe');
    const seed = hash(myProfiles.map(p => p.raw).join('|') + '::' + foeProfiles.map(p => p.raw).join('|'));
    const rand = rngFrom(seed);

    const logEntries = [];
    const snapshot = () => {
      const m = {};
      mine.concat(foe).forEach(u => { m[u.uid] = [u.hp, u.alive ? 1 : 0]; });
      return m;
    };
    const log = { push: (e) => { e.hp = snapshot(); logEntries.push(e); } };

    let lastHit = {};
    let round = 0;
    log.push({ round: 0, type: 'sys', text: '两边评论区撞上了，' + mine.length + ' 只妖怪 vs ' + foe.length + ' 只妖怪' });

    while (round < 40 && mine.some(u => u.alive) && foe.some(u => u.alive)) {
      round++;
      const order = mine.concat(foe).filter(u => u.alive).sort((a, b) => b.spd - a.spd);
      if (round > 30) { mine.concat(foe).forEach(u => { if (u.alive) u.hp = Math.max(1, u.hp - Math.round(u.maxHp * 0.06)); }); }
      for (const u of order) {
        if (!u.alive) continue;
        const enemies = u.side === 'me' ? foe : mine;
        const allies = u.side === 'me' ? mine : foe;
        if (!enemies.some(e => e.alive)) break;

        // 中毒结算
        if (u.poison > 0) {
          const pd = Math.max(1, Math.round(u.maxHp * 0.05));
          u.hp = Math.max(0, u.hp - pd); u.poison--;
          log.push({ round, type: 'poison', text: u.displayName + ' 被阴阳语气到 (中毒 -' + pd + ')' });
          if (u.hp <= 0) { u.alive = false; log.push({ round, type: 'ko', text: u.displayName + ' 掉线了' }); continue; }
        }

        const target = pickTarget(enemies, rand);
        if (!target) break;

        switch (u.arch) {
          case 'koujo': {
            const eff = { atk: u.atk, buff: u.buff, def: u.def, crit: u.crit };
            const fake = Object.assign(Object.create(u), eff);
            const shielded = target.def * 0.3;
            const oldDef = target.def; target.def = target.def - shielded;
            const res = damageOf(u, target, rand);
            target.def = oldDef;
            target.hp -= res.dmg; target.taken += res.dmg; u.dealt += res.dmg;
            log.push({ round, type: res.isCrit ? 'crit' : 'hit', text: u.displayName + ' 一句"难道不是？" 打掉 ' + res.dmg + (res.isCrit ? '（暴击）' : '') });
            if (target.hp <= 0) { target.alive = false; log.push({ round, type: 'ko', text: target.displayName + '（' + target.name + '）被打到退出了评论区' }); }
            lastHit[u.side] = res.dmg;
            break;
          }
          case 'tian': {
            const heal = Math.round(u.maxHp * 0.12);
            let healed = 0;
            allies.filter(a => a.alive).forEach(a => {
              const before = a.hp; a.hp = Math.min(a.maxHp, a.hp + heal); healed += a.hp - before;
            });
            log.push({ round, type: 'heal', text: u.displayName + ' 疯狂打 call，全队回复 ' + heal + '（实际 ' + healed + '）' });
            break;
          }
          case 'dong': {
            allies.filter(a => a.alive).forEach(a => { a.buff = Math.min(0.6, a.buff + 0.18); });
            log.push({ round, type: 'buff', text: u.displayName + ' 说了句"其实吧"，全队攻击 +18%' });
            break;
          }
          case 'fudu': {
            const dmg = lastHit[u.side] || Math.round(u.atk * 0.8);
            applyDamage(target, dmg, log, round, u.displayName, 'fudu');
            u.dealt += dmg;
            log.push({ round, type: 'hit', text: u.displayName + ' 复读！原样再来 ' + dmg + ' 点' });
            break;
          }
          case 'yinyang': {
            const res = damageOf(u, target, rand);
            applyDamage(target, res.dmg, log, round, u.displayName, 'hit');
            u.dealt += res.dmg;
            target.poison += 3;
            log.push({ round, type: res.isCrit ? 'crit' : 'hit', text: u.displayName + ' 阴阳一句"您可真棒"，' + res.dmg + ' 伤害 + 中毒 3 回合' });
            lastHit[u.side] = res.dmg;
            break;
          }
          case 'qingxu': {
            const res = damageOf({ atk: u.atk * 1.4, buff: u.buff, crit: u.crit }, target, rand);
            applyDamage(target, res.dmg, log, round, u.displayName, 'hit');
            u.dealt += res.dmg;
            log.push({ round, type: res.isCrit ? 'crit' : 'hit', text: u.displayName + ' 彻底绷不住，轰出 ' + res.dmg });
            lastHit[u.side] = res.dmg;
            break;
          }
          case 'kepu': {
            const res = damageOf(u, target, rand);
            applyDamage(target, res.dmg, log, round, u.displayName, 'hit');
            u.dealt += res.dmg;
            const ally = allies.filter(a => a.alive && a !== u)[0];
            if (ally) { ally.shield += 12; }
            log.push({ round, type: 'hit', text: u.displayName + ' 甩出三千字长文，' + res.dmg + ' 伤害，并为队友挂上盾' });
            lastHit[u.side] = res.dmg;
            break;
          }
          case 'yinzhan': {
            const res = damageOf(u, target, rand);
            applyDamage(target, res.dmg, log, round, u.displayName, 'hit');
            u.dealt += res.dmg;
            const second = enemies.filter(e => e.alive && e !== target)[0];
            let splash = 0;
            if (second) {
              splash = Math.round(res.dmg * 0.4);
              applyDamage(second, splash, log, round, u.displayName, 'splash');
              u.dealt += splash;
            }
            log.push({ round, type: 'hit', text: u.displayName + ' @全体成员：' + res.dmg + ' 伤害' + (splash ? '，溅射 ' + splash : '') });
            lastHit[u.side] = res.dmg;
            break;
          }
          default: {
            const res = damageOf(u, target, rand);
            applyDamage(target, res.dmg, log, round, u.displayName, 'hit');
            u.dealt += res.dmg;
            log.push({ round, type: res.isCrit ? 'crit' : 'hit', text: u.displayName + ' 随手一击 ' + res.dmg + (res.isCrit ? '（暴击）' : '') });
            lastHit[u.side] = res.dmg;
          }
        }
      }
    }

    const mineLeft = mine.filter(u => u.alive).length;
    const foeLeft = foe.filter(u => u.alive).length;
    let winner = 'draw';
    if (mineLeft > 0 && foeLeft === 0) winner = 'me';
    else if (foeLeft > 0 && mineLeft === 0) winner = 'foe';
    else {
      const rate = mine.reduce((s, u) => s + u.hp / u.maxHp, 0) - foe.reduce((s, u) => s + u.hp / u.maxHp, 0);
      winner = rate > 0.05 ? 'me' : rate < -0.05 ? 'foe' : 'draw';
    }
    log.push({ round, type: 'end', text: winner === 'me' ? '我方评论区赢了' : winner === 'foe' ? '对面评论区骑脸了' : '两边打平，评论区被折叠' });

    const ranking = mine.concat(foe)
      .map(u => ({ ...u }))
      .sort((a, b) => b.dealt - a.dealt)
      .slice(0, 8);

    return { mine, foe, log: logEntries, winner, rounds: round, ranking };
  }

  /* ---------------- 选出最强 5 只上场 ---------------- */
  function power(p) {
    const s = p.stats;
    return s.hp * 0.35 + s.atk * 2.4 + s.def * 1.2 + s.spd;
  }
  function pickLineup(profiles, size) {
    const n = size || 5;
    return profiles.slice().sort((a, b) => power(b) - power(a)).slice(0, n);
  }

  /* ---------------- 导出 ---------------- */
  const api = { ARCH, analyze, parseComments, synthesizeFoe, balanceFoe, runBattle, pickLineup, power, hash, jaccard, bigrams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CB = api;
})(typeof window !== 'undefined' ? window : globalThis);
