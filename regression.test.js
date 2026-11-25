/**
 * 地铁通勤测算 — 回归测试
 *
 * 跑法：  node regression.test.js
 * 输出：  逐项 PASS/FAIL，有任何 FAIL 时进程退出码为 1
 *
 * 目的：把历次 codex 验证过的算例固化成可复跑的断言，
 *       任何人（含 AI）改完代码后跑一次即可知道有没有引入回归。
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'page.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

/* ---------- 加载被测代码 ---------- */
function loadScript(id) {
  const re = new RegExp('<script\\s+id="' + id + '"[^>]*>([\\s\\S]*?)<\\/script>');
  const m = html.match(re);
  if (!m) throw new Error('找不到 script#' + id);
  return m[1];
}

const calcCtx = { console };
vm.createContext(calcCtx);
vm.runInContext(loadScript('calculator'), calcCtx);
const MetroCore = calcCtx.MetroCore;

const extraCtx = { console, MetroCore };
vm.createContext(extraCtx);
vm.runInContext(loadScript('shareExtra'), extraCtx);
const RiskCore = extraCtx.RiskCore;

const metro = JSON.parse(loadScript('metroData'));
const net = MetroCore.createNetwork(metro);

/* ---------- 断言框架 ---------- */
let pass = 0, fail = 0;
const failures = [];

/* eq 仅做比较，不计数（计数统一由 report 负责） */
function eq(label, actual, expected, tol) {
  tol = tol === undefined ? 0.05 : tol;
  return typeof expected === 'number'
    ? Math.abs(actual - expected) <= tol
    : actual === expected;
}

function section(title) {
  console.log('\n' + '─'.repeat(70));
  console.log(title);
  console.log('─'.repeat(70));
}

function report(label, actual, expected) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= 0.05
    : actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  ${actual}${ok ? '' : '（期望 ' + expected + '）'}`);
  if (ok) pass++; else { fail++; failures.push({ label, actual, expected }); }
  return ok;
}

/* ================= 1. 基准算例（9 组） ================= */
section('1. 基准算例（数字必须完全一致）');

const BASELINE = [
  { name: '6元/23天46次/无公交', inp: { newFare: 6, oldFare: 4, workDays: 23, busPerDay: 0, busFare: 2, fixedRoutes: [] },
    payg: 257.4, pass45: 216.0 },
  { name: '6元/18天36次', inp: { newFare: 6, oldFare: 4, workDays: 18, busPerDay: 0, busFare: 2, fixedRoutes: [] },
    pass35: 196.0 },
  { name: '4元/23天', inp: { newFare: 4, oldFare: 3, workDays: 23, busPerDay: 0, busFare: 2, fixedRoutes: [] },
    payg: 174.8 },
  { name: '5元/23天', inp: { newFare: 5, oldFare: 4, workDays: 23, busPerDay: 0, busFare: 2, fixedRoutes: [] },
    pass45: 215.0 },
  { name: '主6×46+固定4×4', inp: { newFare: 6, oldFare: 4, workDays: 23, busPerDay: 0, busFare: 2,
      fixedRoutes: [{ newFare: 4, oldFare: 3, count: 4, times: 4 }] },
    payg: 271.8, pass45: 232.0 },
  { name: '主6×46+A(4×4)+B(3×2)', inp: { newFare: 6, oldFare: 4, workDays: 23, busPerDay: 0, busFare: 2,
      fixedRoutes: [{ newFare: 4, oldFare: 3, count: 4, times: 4 }, { newFare: 3, oldFare: 3, count: 2, times: 2 }] },
    payg: 277.2, pass45: 238.0 },
  { name: '洲海路22天', inp: { newFare: 6, oldFare: 4, workDays: 22, busPerDay: 0, busFare: 2, fixedRoutes: [] },
    payg: 246.6, pass45: 210.0, diffPayg: 81.0, saving: 36.6 },
  { name: '惠南19天+花桥4次', inp: { newFare: 9, oldFare: 7, workDays: 19, busPerDay: 0, busFare: 2,
      fixedRoutes: [{ newFare: 11, oldFare: 8, count: 4, times: 4 }] },
    oldCost: 275.2, payg: 356.4, diffPayg: 81.2, saving: 146.4 },
  { name: '6元/23天/2次公交@2元', inp: { newFare: 6, oldFare: 4, workDays: 23, busPerDay: 2, busFare: 2, fixedRoutes: [] },
    payg: 306.0, metro: 237.0, bus: 69.0 },
  { name: '6元/23天/1次公交@2元', inp: { newFare: 6, oldFare: 4, workDays: 23, busPerDay: 1, busFare: 2, fixedRoutes: [] },
    payg: 283.0, metro: 237.0, bus: 46.0 },
];

for (const c of BASELINE) {
  const r = MetroCore.calculate(c.inp);
  const p45 = r.passes.find(p => p.n === 45);
  const p35 = r.passes.find(p => p.n === 35);
  let ok = true;
  if (c.payg !== undefined) ok = report(`${c.name} · 刷码`, r.payg.total.toFixed(1), c.payg) && ok;
  if (c.pass45 !== undefined) ok = report(`${c.name} · 45票`, p45.total.toFixed(1), c.pass45) && ok;
  if (c.pass35 !== undefined) ok = report(`${c.name} · 35票`, p35.total.toFixed(1), c.pass35) && ok;
  if (c.oldCost !== undefined) ok = report(`${c.name} · oldCost`, r.oldCost.toFixed(1), c.oldCost) && ok;
  if (c.diffPayg !== undefined) ok = report(`${c.name} · diffPayg`, r.diffPayg.toFixed(1), c.diffPayg) && ok;
  if (c.saving !== undefined) ok = report(`${c.name} · saving`, r.saving.toFixed(1), c.saving) && ok;
  if (c.metro !== undefined) ok = report(`${c.name} · 地铁`, r.payg.metro.toFixed(1), c.metro) && ok;
  if (c.bus !== undefined) ok = report(`${c.name} · 公交`, r.payg.bus.toFixed(1), c.bus) && ok;
}

/* ================= 2. 判据C（少坐N次会亏） ================= */
section('2. 判据C · 少坐N次抗波动性');

function critC(inp) {
  const r = MetroCore.calculate(inp);
  const w = RiskCore.evaluate(inp, r);
  return w.find(x => x.includes('少坐')) || null;
}

{
  // 6元/17天(34次) → 少坐1次多花2.8元
  const m = critC({ newFare: 6, oldFare: 4, workDays: 17, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('6元/17天 应报"少坐 1 次"', m && /少坐 1 次/.test(m) ? 'ok' : String(m), 'ok');
  report('6元/17天 金额应为2.8', m && /2\.8/.test(m) ? 'ok' : String(m), 'ok');

  // 6元/19天(38次) → 不应有警告
  const m2 = critC({ newFare: 6, oldFare: 4, workDays: 19, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('6元/19天 → 应无警告', m2 === null ? 'ok' : m2, 'ok');

  // 主6元×1天 + 固定6元×33次(35次) → 少坐2次多花2.8元
  const m3 = critC({ newFare: 6, oldFare: 4, workDays: 1, busPerDay: 0, busFare: 2,
    fixedRoutes: [{ newFare: 6, oldFare: 4, count: 33, times: 33 }] });
  report('主1天+固定33次 应报"少坐 2 次"', m3 && /少坐 2 次/.test(m3) ? 'ok' : String(m3), 'ok');

  // 免费公交不应误报（第2轮修的问题）
  const m4 = critC({ newFare: 4, oldFare: 3, workDays: 3, busPerDay: 2, busFare: 0,
    fixedRoutes: [{ newFare: 6, oldFare: 5, count: 33, times: 33 }] });
  report('免费公交不应误报判据C', m4 === null ? 'ok' : m4, 'ok');
}

/* ================= 3. 公交成本（busCost） ================= */
section('3. 公交成本 · 逐笔计算与下限保护');

for (const [bf, expectBus] of [[0, 0], [0.5, 11.5], [1, 23], [2, 69]]) {
  const r = MetroCore.calculate({ newFare: 6, oldFare: 4, workDays: 23, busPerDay: 2, busFare: bf, fixedRoutes: [] });
  report(`busFare=${bf} · 公交成本`, r.payg.bus.toFixed(1), expectBus);
}
{
  const bc = MetroCore.busCost(23, 2, 0.5, 1);
  report('busCost(23,2,0.5,1)', bc.toFixed(1), 11.5);
  const bc0 = MetroCore.busCost(23, 2, 0, 1);
  report('busCost 不应为负', bc0 >= 0 ? 'ok' : bc0, 'ok');
}

/* ================= 4. 里程分档（浮点边界） ================= */
section('4. 里程分档 · 浮点边界');

{
  // 26.00km 旧规则应为 5 元（曾经因浮点算成 6 元）
  const km = MetroCore.distance(net, '宝安公路', '高桥西');
  report('宝安公路→高桥西 里程', km, 26);
  report('  旧票价应为5元', MetroCore.fareOld(km), 5);
  const km2 = MetroCore.distance(net, '新闸路', '复兴岛');
  report('新闸路→复兴岛 里程', km2, 12);
  report('  新票价应为5元', MetroCore.fareNew(km2), 5);
}
{
  // 分界值加浮点噪声后不应跳档
  const bounds = [[6, '旧6km'], [16, '旧16km'], [26, '旧26km'], [36, '旧36km'],
                  [4, '新4km'], [8, '新8km'], [12, '新12km'], [16, '新16km'],
                  [23, '新23km'], [30, '新30km'], [40, '新40km'], [50, '新50km']];
  let allOk = true;
  for (const [v, label] of bounds) {
    const noisy = v + 1e-14;
    if (MetroCore.fareOld(v) !== MetroCore.fareOld(noisy) ||
        MetroCore.fareNew(v) !== MetroCore.fareNew(noisy)) {
      allOk = false;
      failures.push({ label: '分档抗浮点噪声 ' + label, actual: '跳档', expected: '稳定' });
    }
  }
  report('12 个分界值抗浮点噪声', allOk ? 'ok' : 'FAIL', 'ok');
}

/* ================= 5. 满额门槛（浮点） ================= */
section('5. 满额门槛 · 浮点容差');

{
  // 3.6元×26次：25次正好90元，第26次应打折
  const r = MetroCore.calculate({ newFare: 3.6, oldFare: 3, workDays: 13, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('3.6元/13天(26次) 应93.2', r.payg.total.toFixed(1), 93.2);
}

/* ================= 6. 文案逻辑（纯函数模拟） ================= */
section('6. 文案逻辑 · 零值与平价');

{
  // Canvas 符号规则
  function canvasStr(label, num) {
    const isZero = Math.abs(parseFloat(String(num || '0').replace(/[^\d.\-]/g, ''))) < 0.05;
    const isGood = /少花/.test(label);
    const isExpense = /支出/.test(label);
    if (isZero && !isExpense) return '基本持平';
    let s = String(num || '0').replace(/^-/, '').replace(/^\+/, '');
    if (!isGood && !isExpense) s = '+' + s;
    return s;
  }
  report('Canvas · 支出无符号', canvasStr('我每月支出', '8.0'), '8.0');
  report('Canvas · 多花带+号', canvasStr('我每月要多花', '81.0'), '+81.0');
  report('Canvas · 少花无符号', canvasStr('我每月少花', '20.0'), '20.0');
  report('Canvas · 零差显示持平', canvasStr('我每月要多花', '0.0'), '基本持平');
}

{
  // 方案表平价
  function deltaStr(d) {
    if (Math.abs(d) < 0.05) return '持平';
    return (d < 0 ? '省 ' : '贵 ') + (Math.round(Math.abs(d) * 10) / 10).toFixed(1);
  }
  report('方案表 · 平价显示持平', deltaStr(0), '持平');
  report('方案表 · 省钱', deltaStr(-36.6), '省 36.6');
  report('方案表 · 更贵', deltaStr(12.3), '贵 12.3');
}

{
  // 涨跌徽标
  function badge(oldF, newF) {
    if (!(oldF > 0)) return '无旧票价';
    const p = Math.round((newF / oldF - 1) * 100);
    if (p > 0) return '涨 ' + p + '%';
    if (p < 0) return '降 ' + Math.abs(p) + '%';
    return (Math.abs(newF - oldF) < 0.005 ? '票价不变' : '票价基本持平');
  }
  report('徽标 · 旧价缺失', badge(0, 4), '无旧票价');
  report('徽标 · 票价相同', badge(4, 4), '票价不变');
  report('徽标 · 涨价', badge(4, 6), '涨 50%');
  report('徽标 · 降价', badge(6, 4), '降 33%');
  report('徽标 · 微涨', badge(8, 8.03), '票价基本持平');
}

/* ================= 7. 代码完整性 ================= */
section('7. 代码完整性');

{
  const ob = (html.match(/{/g) || []).length;
  const cb = (html.match(/}/g) || []).length;
  report('花括号平衡', ob === cb ? 'ok' : `${ob}/${cb}`, 'ok');

  const scripts = [];
  const re = /<script(?:\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push({ id: m[1] || '', code: m[2] });
  let syntaxOk = 0, syntaxFail = 0;
  for (const s of scripts) {
    if (s.id === 'metroData') { try { JSON.parse(s.code); syntaxOk++; } catch (e) { syntaxFail++; } continue; }
    try { new Function(s.code); syntaxOk++; } catch (e) { syntaxFail++; failures.push({ label: 'script#' + s.id, actual: e.message, expected: '语法正确' }); }
  }
  report('JS 语法', syntaxFail === 0 ? 'ok' : `${syntaxFail} 段失败`, 'ok');

  const extSrc = (html.match(/<script src/g) || []).length;
  const extLink = (html.match(/<link/g) || []).length;
  report('外部依赖应为0', extSrc === 0 && extLink === 0 ? 'ok' : `src=${extSrc} link=${extLink}`, 'ok');

  report('站点数据完整', metro.names.length === 413 ? 'ok' : metro.names.length, 'ok');
}

/* ================= 8. 旧价缺失处理（第6轮修复） ================= */
section('8. 旧价缺失 · 不应输出涨跌金额');

{
  const r = MetroCore.calculate({ newFare: 4, oldFare: 0, workDays: 1, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('oldFare=0 → oldFareMissing 应为 true', r.oldFareMissing === true ? 'ok' : String(r.oldFareMissing), 'ok');
  report('oldFare=0 → 实际支出应为8.0', r.payg.total.toFixed(1), 8.0);
  // 旧价正常时不应误标
  const r2 = MetroCore.calculate({ newFare: 4, oldFare: 3, workDays: 1, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('oldFare=3 → oldFareMissing 应为 false', r2.oldFareMissing === false ? 'ok' : String(r2.oldFareMissing), 'ok');
}

/* ================= 9. 平价与浮点噪声（第6轮修复） ================= */
section('9. 平价判定 · 浮点噪声不应被当成差额');

{
  // 5元/24天：刷码与45票完全相等
  const r = MetroCore.calculate({ newFare: 5, oldFare: 4, workDays: 24, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  const gap = r.bestPass.total - r.payg.total;
  report('5元/24天 刷码与最优票应持平', Math.abs(gap) < 0.05 ? 'ok' : gap.toFixed(6), 'ok');

  // 莘庄→外环路 20天 + 花桥→书院 10次：差值仅 5.68e-14
  const km1 = MetroCore.distance(net, '莘庄', '外环路');
  const km2 = MetroCore.distance(net, '花桥', '书院');
  const r2 = MetroCore.calculate({
    newFare: MetroCore.fareNew(km1), oldFare: MetroCore.fareOld(km1), workDays: 20, busPerDay: 1, busFare: 2,
    fixedRoutes: [{ newFare: MetroCore.fareNew(km2), oldFare: MetroCore.fareOld(km2), count: 10, times: 10 }]
  });
  const d = r2.bestPass.total - r2.payg.total;
  report('浮点噪声不应触发"刷码更省"', !(r2.bestPass.total > r2.payg.total + 0.05) ? 'ok' : d.toExponential(3), 'ok');
}

/* ================= 10. 旧价缺失的渲染层屏蔽（第6轮补充） ================= */
section('10. 旧价缺失 · 渲染层各处都不应输出无效对比');

{
  const r = MetroCore.calculate({ newFare: 4, oldFare: 0, workDays: 1, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('oldFare=0 → oldCostAll 为0（渲染层应显示—）', r.oldCostAll, 0);

  const r2 = MetroCore.calculate({ newFare: 6, oldFare: 0, workDays: 23, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('oldFare=0 → oldFareMissing 阻止 diffBest 输出', r2.oldFareMissing === true ? 'ok' : 'FAIL', 'ok');

  // 正常旧价时这些字段必须正常
  const r3 = MetroCore.calculate({ newFare: 6, oldFare: 4, workDays: 22, busPerDay: 0, busFare: 2, fixedRoutes: [] });
  report('oldFare=4 → oldCostAll 正常', r3.oldCostAll.toFixed(1), 165.6);
  report('oldFare=4 → diffBest 正常', r3.diffBest.toFixed(1), 44.4);

  // 源码层面确认三处已加 oldMissing 分支
  report('费用参照用 oldMissing 屏蔽', html.includes("oldMissing?'—':money(result.oldCostAll)") ? 'ok' : 'FAIL', 'ok');
  report('单程对比用三元屏蔽0', html.includes("(input.oldFare>0)?input.oldFare:'—'") ? 'ok' : 'FAIL', 'ok');
  report('推荐语有 oldMissing 分支', html.includes('if(oldMissing){') ? 'ok' : 'FAIL', 'ok');
}

/* ================= 汇总 ================= */
console.log('\n' + '='.repeat(70));
console.log(`结果：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  console.log('\n失败清单：');
  failures.forEach(f => console.log(`  · ${f.label}  →  实际 ${f.actual}，期望 ${f.expected}`));
  console.log('='.repeat(70));
  process.exit(1);
} else {
  console.log('全部通过 ✅');
  console.log('='.repeat(70));
}
