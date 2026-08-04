// ============================================================
// 数据清洗记录管理工具 — 核心逻辑
// ============================================================

const STORAGE_KEY = 'dataCleanRecords';
let records = [];           // 所有记录
let sortField = 'createdAt';// 排序字段
let sortAsc = false;        // 默认按日期降序（最新的在前）
let charts = {};            // Chart 实例缓存

// ============================================================
// 数据存储层 (localStorage)
// ============================================================

function loadRecords() {
  const data = localStorage.getItem(STORAGE_KEY);
  records = data ? JSON.parse(data) : [];
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ============================================================
// 工具函数
// ============================================================

/** 生成唯一 ID */
function genId() {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/** 格式化大数字（千分位） */
function formatNum(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-US');
}

/** 格式化日期时间为 YYYY-MM-DD HH:mm */
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 格式化日期（仅日期） */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

/** HTML 转义，防止 XSS */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 根据重复率返回 CSS 类名 */
function getDupRateClass(rate) {
  if (rate >= 20) return 'dup-rate-high';
  if (rate >= 10) return 'dup-rate-mid';
  return 'dup-rate-low';
}

/** 计算重复数量和重复率 */
function calcDupStats(before, after) {
  const b = Number(before);
  const a = Number(after);
  if (!b || b <= 0 || isNaN(b) || isNaN(a)) return { dupCount: '', dupRate: '' };
  const dupCount = b - a;
  const dupRate = ((dupCount / b) * 100).toFixed(2);
  return { dupCount, dupRate };
}

// ============================================================
// Tab 切换
// ============================================================

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.classList.toggle('active', sec.id === 'tab-' + tabName);
  });
  if (tabName === 'stats') renderStats();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ============================================================
// 记录列表渲染
// ============================================================

function getFilteredRecords() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const status = document.getElementById('filterStatus').value;
  const operator = document.getElementById('filterOperator').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  return records.filter(r => {
    // 搜索
    if (search) {
      const haystack = [
        r.taskName, r.beforeTable, r.afterTable,
        (r.beforeSources || []).join(' '),
        r.ossTable, r.dataRange, r.remark, r.operator
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    // 状态
    if (status && r.status !== status) return false;
    // 处理人
    if (operator && r.operator !== operator) return false;
    // 日期范围
    if (dateFrom || dateTo) {
      const recDate = r.createdAt ? formatDate(r.createdAt) : '';
      if (dateFrom && recDate < dateFrom) return false;
      if (dateTo && recDate > dateTo) return false;
    }
    return true;
  }).sort((a, b) => {
    let va = a[sortField] || '';
    let vb = b[sortField] || '';
    // 数值字段
    if (sortField === 'beforeCount' || sortField === 'afterCount') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });
}

function renderTable() {
  const filtered = getFilteredRecords();
  const tbody = document.getElementById('recordTableBody');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('recordTable');

  document.getElementById('recordCount').textContent = `${records.length} 条记录`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    table.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  table.style.display = '';
  emptyState.style.display = 'none';

  tbody.innerHTML = filtered.map(r => {
    const { dupCount, dupRate } = calcDupStats(r.beforeCount, r.afterCount);
    const sourceCount = (r.beforeSources || []).filter(s => s.trim()).length;
    const partitionCount = (r.partitions || []).length;
    const dupRateDisplay = dupRate !== '' ? `${dupRate}%` : '-';
    const dupRateClass = getDupRateClass(Number(dupRate));

    return `
      <tr ondblclick="viewDetail('${r.id}')">
        <td><strong>${esc(r.taskName)}</strong></td>
        <td>${formatDate(r.createdAt)}</td>
        <td>${esc(r.operator || '-')}</td>
        <td>
          <span class="table-flow">
            ${esc(r.beforeTable || '-')}
            <span class="arrow">→</span>
            ${esc(r.afterTable || '-')}
          </span>
        </td>
        <td class="num-col">${r.beforeCount ? formatNum(r.beforeCount) : '-'}</td>
        <td class="num-col">${r.afterCount ? formatNum(r.afterCount) : '-'}</td>
        <td class="num-col"><span class="${dupRateClass}">${dupRateDisplay}</span></td>
        <td class="num-col">${sourceCount || '-'}</td>
        <td class="num-col">
          <button class="partition-count-btn ${partitionCount === 0 ? 'zero' : ''}" onclick="openPartitionManager('${r.id}')" title="管理分区">
            ${partitionCount > 0 ? '📊 ' + partitionCount : '—'}
          </button>
        </td>
        <td>${esc(r.dataRange || '-')}</td>
        <td>${esc(r.ossTable || '-')}</td>
        <td><span class="status-badge status-${r.status || '进行中'}">${esc(r.status || '进行中')}</span></td>
        <td class="action-col">
          <button class="row-btn" title="查看详情" onclick="viewDetail('${r.id}')">👁</button>
          <button class="row-btn" title="编辑" onclick="editRecord('${r.id}')">✏️</button>
          <button class="row-btn" title="复制新建" onclick="copyNew('${r.id}')">📋</button>
          <button class="row-btn delete" title="删除" onclick="deleteRecord('${r.id}')">🗑</button>
        </td>
      </tr>
    `;
  }).join('');
}

/** 清除所有筛选 */
function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterOperator').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  renderTable();
}

/** 排序 */
function sortBy(field) {
  if (sortField === field) {
    sortAsc = !sortAsc;
  } else {
    sortField = field;
    sortAsc = false;
  }
  renderTable();
}

// ============================================================
// 表单：新建/编辑
// ============================================================

function openFormTab() {
  resetForm();
  switchTab('form');
}

function resetForm() {
  document.getElementById('recordForm').reset();
  document.getElementById('recordId').value = '';
  document.getElementById('createdAtDisplay').value = '';
  document.getElementById('dupCount').value = '';
  document.getElementById('dupRate').value = '';
  document.getElementById('beforeCountHint').textContent = '';
  document.getElementById('afterCountHint').textContent = '';
  // 重置源表为一个空行
  document.getElementById('sourcesContainer').innerHTML = '';
  addSourceField('');
}

/** 添加源表输入行 */
function addSourceField(value = '') {
  const container = document.getElementById('sourcesContainer');
  const row = document.createElement('div');
  row.className = 'source-row';
  row.innerHTML = `
    <input type="text" class="source-input" placeholder="源表名，如 glm_data.cdl.cdl_facebook_posts_di" list="tableNamesList" value="${esc(value)}">
    <button type="button" class="source-remove" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}

/** 实时计算重复数量和重复率 */
function calcDup() {
  const before = document.getElementById('beforeCount').value;
  const after = document.getElementById('afterCount').value;

  // 显示格式化的数字提示
  document.getElementById('beforeCountHint').textContent = before ? `≈ ${formatNum(before)}` : '';
  document.getElementById('afterCountHint').textContent = after ? `≈ ${formatNum(after)}` : '';

  const { dupCount, dupRate } = calcDupStats(before, after);
  document.getElementById('dupCount').value = dupCount !== '' ? formatNum(dupCount) : '';
  document.getElementById('dupRate').value = dupRate !== '' ? `${dupRate}%` : '';
}

/** 保存记录 */
function saveRecord(event) {
  event.preventDefault();

  const id = document.getElementById('recordId').value;
  const isNew = !id;

  // 收集源表
  const sources = [];
  document.querySelectorAll('.source-input').forEach(input => {
    if (input.value.trim()) sources.push(input.value.trim());
  });

  const before = document.getElementById('beforeCount').value;
  const after = document.getElementById('afterCount').value;
  const { dupCount, dupRate } = calcDupStats(before, after);

  const record = {
    id: id || genId(),
    taskName: document.getElementById('taskName').value.trim(),
    createdAt: id ? (records.find(r => r.id === id)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    operator: document.getElementById('operator').value.trim(),
    status: document.getElementById('status').value,
    beforeTable: document.getElementById('beforeTable').value.trim(),
    beforeCount: before,
    beforeSources: sources,
    afterTable: document.getElementById('afterTable').value.trim(),
    afterCount: after,
    dedupRules: document.getElementById('dedupRules').value.trim(),
    dupCount: dupCount,
    dupRate: dupRate,
    dataRange: document.getElementById('dataRange').value.trim(),
    ossTable: document.getElementById('ossTable').value.trim(),
    sqlScript: document.getElementById('sqlScript').value.trim(),
    duration: document.getElementById('duration').value.trim(),
    remark: document.getElementById('remark').value.trim(),
  };

  if (isNew) {
    records.push(record);
  } else {
    const idx = records.findIndex(r => r.id === id);
    if (idx >= 0) {
      // 编辑时保留原有分区数据
      record.partitions = records[idx].partitions || [];
      records[idx] = record;
    }
  }

  saveRecords();
  refreshAll();
  switchTab('list');
  showToast(isNew ? '✅ 记录已添加' : '✅ 记录已更新');
}

/** 编辑记录 */
function editRecord(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;

  document.getElementById('recordId').value = r.id;
  document.getElementById('taskName').value = r.taskName || '';
  document.getElementById('createdAtDisplay').value = formatDateTime(r.createdAt);
  document.getElementById('operator').value = r.operator || '';
  document.getElementById('status').value = r.status || '进行中';
  document.getElementById('beforeTable').value = r.beforeTable || '';
  document.getElementById('beforeCount').value = r.beforeCount || '';
  document.getElementById('afterTable').value = r.afterTable || '';
  document.getElementById('afterCount').value = r.afterCount || '';
  document.getElementById('dedupRules').value = r.dedupRules || '';
  document.getElementById('dataRange').value = r.dataRange || '';
  document.getElementById('ossTable').value = r.ossTable || '';
  document.getElementById('sqlScript').value = r.sqlScript || '';
  document.getElementById('duration').value = r.duration || '';
  document.getElementById('remark').value = r.remark || '';

  // 源表
  document.getElementById('sourcesContainer').innerHTML = '';
  if (r.beforeSources && r.beforeSources.length > 0) {
    r.beforeSources.forEach(s => addSourceField(s));
  } else {
    addSourceField('');
  }

  calcDup();
  switchTab('form');
}

/** 复制新建 */
function copyNew(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;

  // 预填字段，但清空 id
  document.getElementById('recordId').value = '';
  document.getElementById('taskName').value = r.taskName ? r.taskName + ' (副本)' : '';
  document.getElementById('createdAtDisplay').value = '';
  document.getElementById('operator').value = r.operator || '';
  document.getElementById('status').value = '进行中';
  document.getElementById('beforeTable').value = r.beforeTable || '';
  document.getElementById('beforeCount').value = r.beforeCount || '';
  document.getElementById('afterTable').value = r.afterTable || '';
  document.getElementById('afterCount').value = r.afterCount || '';
  document.getElementById('dedupRules').value = r.dedupRules || '';
  document.getElementById('dataRange').value = r.dataRange || '';
  document.getElementById('ossTable').value = r.ossTable || '';
  document.getElementById('sqlScript').value = r.sqlScript || '';
  document.getElementById('duration').value = r.duration || '';
  document.getElementById('remark').value = r.remark || '';

  document.getElementById('sourcesContainer').innerHTML = '';
  if (r.beforeSources && r.beforeSources.length > 0) {
    r.beforeSources.forEach(s => addSourceField(s));
  } else {
    addSourceField('');
  }

  calcDup();
  switchTab('form');
  showToast('📋 已复制记录，修改后保存即可');
}

/** 删除记录 */
function deleteRecord(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  showConfirm(`确认删除「${r.taskName}」吗？此操作不可撤销。`, () => {
    records = records.filter(x => x.id !== id);
    saveRecords();
    refreshAll();
    showToast('🗑 已删除');
  });
}

// ============================================================
// 记录详情
// ============================================================

function viewDetail(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const { dupCount, dupRate } = calcDupStats(r.beforeCount, r.afterCount);
  const sources = (r.beforeSources || []).filter(s => s.trim());

  document.getElementById('detailTitle').textContent = r.taskName;
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-section">
      <h3>📌 基本信息</h3>
      <div class="detail-row"><span class="label">任务名称</span><span class="value">${esc(r.taskName)}</span></div>
      <div class="detail-row"><span class="label">创建时间</span><span class="value">${formatDateTime(r.createdAt)}</span></div>
      <div class="detail-row"><span class="label">处理人</span><span class="value">${esc(r.operator || '-')}</span></div>
      <div class="detail-row"><span class="label">状态</span><span class="value"><span class="status-badge status-${r.status || '进行中'}">${esc(r.status || '进行中')}</span></span></div>
    </div>
    <div class="detail-section">
      <h3>🔀 去重信息</h3>
      <div class="detail-row"><span class="label">去重前表名</span><span class="value">${esc(r.beforeTable || '-')}</span></div>
      <div class="detail-row"><span class="label">去重前数量</span><span class="value">${r.beforeCount ? formatNum(r.beforeCount) : '-'}</span></div>
      <div class="detail-row"><span class="label">去重后表名</span><span class="value">${esc(r.afterTable || '-')}</span></div>
      <div class="detail-row"><span class="label">去重后数量</span><span class="value">${r.afterCount ? formatNum(r.afterCount) : '-'}</span></div>
      <div class="detail-row"><span class="label">去重规则</span><span class="value">${esc(r.dedupRules || '-')}</span></div>
      <div class="detail-row"><span class="label">重复数量</span><span class="value">${dupCount !== '' ? formatNum(dupCount) : '-'}</span></div>
      <div class="detail-row"><span class="label">重复率</span><span class="value"><span class="${getDupRateClass(Number(dupRate))}">${dupRate !== '' ? dupRate + '%' : '-'}</span></span></div>
    </div>
    <div class="detail-section">
      <h3>📦 数据来源 (${sources.length})</h3>
      ${sources.length > 0 ? sources.map((s, i) => `<div class="detail-row"><span class="label">源表 ${i+1}</span><span class="value">${esc(s)}</span></div>`).join('') : '<div class="detail-row"><span class="label">-</span><span class="value">无</span></div>'}
      <div class="detail-row"><span class="label">数据范围</span><span class="value">${esc(r.dataRange || '-')}</span></div>
    </div>
    <div class="detail-section">
      <h3>☁️ OSS 信息</h3>
      <div class="detail-row"><span class="label">OSS 表/路径</span><span class="value">${esc(r.ossTable || '-')}</span></div>
    </div>
    ${renderPartitionInDetail(r)}
    <div class="detail-section">
      <h3>📝 附加信息</h3>
      <div class="detail-row"><span class="label">耗时</span><span class="value">${r.duration ? r.duration + ' 分钟' : '-'}</span></div>
      <div class="detail-row"><span class="label">备注</span><span class="value">${esc(r.remark || '-')}</span></div>
    </div>
    ${r.sqlScript ? `
    <div class="detail-section">
      <h3>💾 SQL 脚本</h3>
      <div class="detail-sql">${esc(r.sqlScript)}</div>
    </div>
    ` : ''}
  `;
  document.getElementById('detailModal').style.display = 'flex';
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
}

// ============================================================
// 统计报表
// ============================================================

function renderStats() {
  const validRecords = records.filter(r => r.beforeCount || r.afterCount);

  // 概览卡片
  document.getElementById('statTotalTasks').textContent = records.length;
  const totalBefore = validRecords.reduce((s, r) => s + (Number(r.beforeCount) || 0), 0);
  const totalAfter = validRecords.reduce((s, r) => s + (Number(r.afterCount) || 0), 0);
  document.getElementById('statTotalBefore').textContent = formatNum(totalBefore);
  document.getElementById('statTotalAfter').textContent = formatNum(totalAfter);

  const rates = validRecords
    .map(r => Number(calcDupStats(r.beforeCount, r.afterCount).dupRate))
    .filter(r => !isNaN(r));
  const avgRate = rates.length > 0 ? (rates.reduce((s, r) => s + r, 0) / rates.length).toFixed(2) : 0;
  document.getElementById('statAvgDupRate').textContent = avgRate + '%';

  // 图表
  renderTrendChart(validRecords);
  renderDupRateChart(validRecords);
  renderSourcesChart();
}

function renderTrendChart(validRecords) {
  const ctx = document.getElementById('chartTrend');
  if (charts.trend) charts.trend.destroy();

  // 按日期排序
  const sorted = [...validRecords].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const labels = sorted.map(r => formatDate(r.createdAt));
  const beforeData = sorted.map(r => Number(r.beforeCount) || 0);
  const afterData = sorted.map(r => Number(r.afterCount) || 0);

  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '去重前', data: beforeData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3 },
        { label: '去重后', data: afterData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v >= 1e6 ? (v/1e6).toFixed(0)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v } }
      }
    }
  });
}

function renderDupRateChart(validRecords) {
  const ctx = document.getElementById('chartDupRate');
  if (charts.dupRate) charts.dupRate.destroy();

  const recent = [...validRecords].slice(-15);  // 最近15条
  const labels = recent.map(r => r.taskName ? (r.taskName.length > 12 ? r.taskName.slice(0,12)+'…' : r.taskName) : '-');
  const data = recent.map(r => Number(calcDupStats(r.beforeCount, r.afterCount).dupRate) || 0);
  const colors = data.map(d => d >= 20 ? '#ef4444' : d >= 10 ? '#f59e0b' : '#22c55e');

  charts.dupRate = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: '重复率(%)', data, backgroundColor: colors }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, title: { display: true, text: '重复率 %' } } }
    }
  });
}

function renderSourcesChart() {
  const ctx = document.getElementById('chartSources');
  if (charts.sources) charts.sources.destroy();

  // 统计每个源表出现次数
  const sourceCount = {};
  records.forEach(r => {
    (r.beforeSources || []).forEach(s => {
      if (s.trim()) {
        const short = s.split('.').pop(); // 取最后一段作为显示
        sourceCount[short] = (sourceCount[short] || 0) + 1;
      }
    });
  });

  const sorted = Object.entries(sourceCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sorted.length === 0) return;

  charts.sources = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{ data: sorted.map(s => s[1]), backgroundColor: generateColors(sorted.length) }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } }
    }
  });
}

function generateColors(n) {
  const palette = ['#4f46e5','#06b6d4','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1'];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

// ============================================================
// 导入导出
// ============================================================

function exportCSV() {
  if (records.length === 0) { showToast('⚠️ 没有可导出的记录'); return; }

  const headers = ['任务名称','创建时间','处理人','状态','去重前表名','去重前数量','去重后表名','去重后数量','去重规则','重复数量','重复率','数据来源(分号分隔)','数据范围','OSS表','耗时(分钟)','SQL脚本','备注'];

  const rows = records.map(r => {
    const { dupCount, dupRate } = calcDupStats(r.beforeCount, r.afterCount);
    return [
      r.taskName, formatDateTime(r.createdAt), r.operator, r.status,
      r.beforeTable, r.beforeCount, r.afterTable, r.afterCount,
      r.dedupRules, dupCount, dupRate,
      (r.beforeSources || []).join('; '),
      r.dataRange, r.ossTable, r.duration, r.sqlScript, r.remark
    ].map(v => {
      const s = String(v === null || v === undefined ? '' : v);
      // CSV 转义：含逗号、引号、换行的用双引号包裹
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',');
  });

  // 添加 BOM 以支持 Excel 正确识别 UTF-8
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  downloadFile(csv, `数据清洗记录_${formatDate(new Date().toISOString())}.csv`, 'text/csv;charset=utf-8');
  showToast(`📥 已导出 ${records.length} 条记录`);
}

function exportExcel() {
  if (records.length === 0) { showToast('⚠️ 没有可导出的记录'); return; }

  const headers = ['任务名称','创建时间','处理人','状态','去重前表名','去重前数量','去重后表名','去重后数量','去重规则','重复数量','重复率','数据来源','数据范围','OSS表','耗时(分钟)','SQL脚本','备注'];

  const rows = records.map(r => {
    const { dupCount, dupRate } = calcDupStats(r.beforeCount, r.afterCount);
    return `<tr>
      <td>${esc(r.taskName)}</td><td>${formatDateTime(r.createdAt)}</td><td>${esc(r.operator||'')}</td><td>${esc(r.status||'')}</td>
      <td>${esc(r.beforeTable||'')}</td><td>${r.beforeCount||''}</td><td>${esc(r.afterTable||'')}</td><td>${r.afterCount||''}</td>
      <td>${esc(r.dedupRules||'')}</td><td>${dupCount}</td><td>${dupRate}%</td>
      <td>${esc((r.beforeSources||[]).join('; '))}</td><td>${esc(r.dataRange||'')}</td><td>${esc(r.ossTable||'')}</td>
      <td>${esc(r.duration||'')}</td><td>${esc(r.sqlScript||'')}</td><td>${esc(r.remark||'')}</td>
    </tr>`;
  }).join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body><table border="1"><tr>${headers.map(h => `<th style="background:#4f46e5;color:white;">${h}</th>`).join('')}</tr>${rows}</table></body></html>`;

  downloadFile(html, `数据清洗记录_${formatDate(new Date().toISOString())}.xls`, 'application/vnd.ms-excel');
  showToast(`📊 已导出 ${records.length} 条记录到 Excel`);
}

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result.replace(/^\uFEFF/, ''); // 去掉 BOM
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { showToast('⚠️ CSV 文件为空'); return; }

      const headers = parseCSVLine(lines[0]);
      let imported = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 5) continue;

        const get = (name) => {
          const idx = headers.indexOf(name);
          return idx >= 0 ? (cols[idx] || '').trim() : '';
        };

        const before = get('去重前数量');
        const after = get('去重后数量');
        const { dupCount, dupRate } = calcDupStats(before, after);

        const record = {
          id: genId(),
          taskName: get('任务名称'),
          createdAt: get('创建时间') ? new Date(get('创建时间')).toISOString() : new Date().toISOString(),
          operator: get('处理人'),
          status: get('状态') || '进行中',
          beforeTable: get('去重前表名'),
          beforeCount: before,
          beforeSources: get('数据来源(分号分隔)') ? get('数据来源(分号分隔)').split(/[;；]/).map(s => s.trim()).filter(Boolean) : (get('数据来源') ? get('数据来源').split(/[;；]/).map(s => s.trim()).filter(Boolean) : []),
          afterTable: get('去重后表名'),
          afterCount: after,
          dedupRules: get('去重规则'),
          dupCount, dupRate,
          dataRange: get('数据范围'),
          ossTable: get('OSS表'),
          sqlScript: get('SQL脚本'),
          duration: get('耗时(分钟)'),
          remark: get('备注'),
        };
        records.push(record);
        imported++;
      }

      saveRecords();
      refreshAll();
      showToast(`✅ 成功导入 ${imported} 条记录`);
    } catch (err) {
      showToast('❌ 导入失败：' + err.message);
    }
    event.target.value = ''; // 重置 input 以便重复导入同一文件
  };
  reader.readAsText(file, 'UTF-8');
}

/** 解析 CSV 一行（处理引号包裹的情况） */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** 下载文件 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// 弹窗 & 提示
// ============================================================

let confirmCallback = null;

function showConfirm(message, onConfirm) {
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  document.getElementById('confirmModal').style.display = 'flex';
}

document.getElementById('confirmYesBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCallback = null;
}

/** 轻量 Toast 提示 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: white; padding: 12px 24px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 2000; font-size: 14px;
    animation: fadeIn 0.2s; max-width: 80%; text-align: center;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ============================================================
// 自动补全（处理人、表名）
// ============================================================

function updateDatalists() {
  // 处理人
  const operators = [...new Set(records.map(r => r.operator).filter(Boolean))];
  document.getElementById('operatorList').innerHTML = operators.map(o => `<option value="${esc(o)}">`).join('');

  // 处理人筛选下拉
  const filterOp = document.getElementById('filterOperator');
  const currentOp = filterOp.value;
  filterOp.innerHTML = '<option value="">全部处理人</option>' + operators.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  filterOp.value = currentOp;

  // 表名（去重前、去重后、源表）
  const tableNames = new Set();
  records.forEach(r => {
    if (r.beforeTable) tableNames.add(r.beforeTable);
    if (r.afterTable) tableNames.add(r.afterTable);
    (r.beforeSources || []).forEach(s => { if (s.trim()) tableNames.add(s.trim()); });
  });
  document.getElementById('tableNamesList').innerHTML = [...tableNames].sort().map(t => `<option value="${esc(t)}">`).join('');
}

// ============================================================
// 刷新所有视图
// ============================================================

function refreshAll() {
  renderTable();
  updateDatalists();
}

// ============================================================
// 分区详情管理
// ============================================================

let currentPartitionRecordId = null;  // 当前正在管理分区的记录 ID
let partitionSortField = 'partition';
let partitionSortAsc = true;

/** 获取当前记录的分区数组（保证返回数组） */
function getPartitions(recordId) {
  const r = records.find(x => x.id === recordId);
  if (!r) return [];
  if (!r.partitions) r.partitions = [];
  return r.partitions;
}

/** 打开分区管理弹窗 */
function openPartitionManager(recordId) {
  currentPartitionRecordId = recordId;
  const r = records.find(x => x.id === recordId);
  document.getElementById('partitionModalTitle').textContent = r ? r.taskName : '';
  switchPartitionMode('list');
  partitionSortField = 'partition';
  partitionSortAsc = true;
  document.getElementById('partitionSearch').value = '';
  renderPartitionTable();
  document.getElementById('partitionModal').style.display = 'flex';
}

function closePartitionManager() {
  document.getElementById('partitionModal').style.display = 'none';
  currentPartitionRecordId = null;
  refreshAll();
}

/** 分区弹窗内 Tab 切换 */
function switchPartitionMode(mode) {
  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(mode === 'list' ? '列表' : '粘贴'));
  });
  document.getElementById('partitionListMode').classList.toggle('active', mode === 'list');
  document.getElementById('partitionPasteMode').classList.toggle('active', mode === 'paste');
}

/** 渲染分区表格 + 汇总 */
function renderPartitionTable() {
  if (!currentPartitionRecordId) return;
  const partitions = getPartitions(currentPartitionRecordId);
  const search = document.getElementById('partitionSearch').value.toLowerCase().trim();

  // 带重复率的完整数据
  const enriched = partitions.map((p, i) => {
    const { dupCount, dupRate } = calcDupStats(p.beforeCount, p.afterCount);
    return { ...p, _index: i, dupCount, dupRate: Number(dupRate) || 0, dupRateStr: dupRate };
  });

  // 筛选
  const filtered = search
    ? enriched.filter(p => (p.partition || '').toLowerCase().includes(search))
    : enriched;

  // 排序
  filtered.sort((a, b) => {
    let va = a[partitionSortField];
    let vb = b[partitionSortField];
    if (partitionSortField === 'beforeCount' || partitionSortField === 'afterCount' || partitionSortField === 'dupRate') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    }
    if (va < vb) return partitionSortAsc ? -1 : 1;
    if (va > vb) return partitionSortAsc ? 1 : -1;
    return 0;
  });

  // 汇总
  const totalBefore = enriched.reduce((s, p) => s + (Number(p.beforeCount) || 0), 0);
  const totalAfter = enriched.reduce((s, p) => s + (Number(p.afterCount) || 0), 0);
  const avgRate = totalBefore > 0 ? (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(2) : '0';
  document.getElementById('partitionSummary').innerHTML = `
    <div class="sum-item"><span class="sum-label">分区数：</span><span class="sum-value">${enriched.length}</span></div>
    <div class="sum-item"><span class="sum-label">总去重前：</span><span class="sum-value">${formatNum(totalBefore)}</span></div>
    <div class="sum-item"><span class="sum-label">总去重后：</span><span class="sum-value">${formatNum(totalAfter)}</span></div>
    <div class="sum-item"><span class="sum-label">平均重复率：</span><span class="sum-value ${getDupRateClass(Number(avgRate))}">${avgRate}%</span></div>
  `;

  // 表格
  const tbody = document.getElementById('partitionTableBody');
  const emptyEl = document.getElementById('partitionEmpty');
  const tableEl = document.querySelector('.partition-table');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  tableEl.style.display = '';
  emptyEl.style.display = 'none';

  tbody.innerHTML = filtered.map(p => {
    const dupCountDisplay = p.dupCount !== '' ? formatNum(p.dupCount) : '-';
    const dupRateDisplay = p.dupRateStr !== '' ? `${p.dupRateStr}%` : '-';
    return `
      <tr>
        <td class="partition-name">${esc(p.partition || '-')}</td>
        <td class="num-col">${p.beforeCount ? formatNum(p.beforeCount) : '-'}</td>
        <td class="num-col">${p.afterCount ? formatNum(p.afterCount) : '-'}</td>
        <td class="num-col">${dupCountDisplay}</td>
        <td class="num-col"><span class="${getDupRateClass(p.dupRate)}">${dupRateDisplay}</span></td>
        <td class="action-col">
          <button class="row-btn" title="编辑" onclick="openPartitionEditor(${p._index})">✏️</button>
          <button class="row-btn delete" title="删除" onclick="deletePartition(${p._index})">🗑</button>
        </td>
      </tr>
    `;
  }).join('');
}

/** 分区排序 */
function sortPartitions(field) {
  if (partitionSortField === field) {
    partitionSortAsc = !partitionSortAsc;
  } else {
    partitionSortField = field;
    // 分区名(字符串)默认升序，数值字段默认降序（大的在前）
    partitionSortAsc = (field === 'partition');
  }
  renderPartitionTable();
}

// ============================================================
// 单条分区增删改
// ============================================================

/** 打开单条分区编辑弹窗 */
function openPartitionEditor(index = -1) {
  document.getElementById('partitionEditIndex').value = index;
  if (index >= 0) {
    const partitions = getPartitions(currentPartitionRecordId);
    const p = partitions[index];
    if (!p) return;
    document.getElementById('partitionEditorTitle').textContent = '编辑分区';
    document.getElementById('partitionName').value = p.partition || '';
    document.getElementById('partitionBefore').value = p.beforeCount || '';
    document.getElementById('partitionAfter').value = p.afterCount || '';
  } else {
    document.getElementById('partitionEditorTitle').textContent = '新增分区';
    document.getElementById('partitionName').value = '';
    document.getElementById('partitionBefore').value = '';
    document.getElementById('partitionAfter').value = '';
  }
  document.getElementById('partitionBeforeHint').textContent = '';
  document.getElementById('partitionAfterHint').textContent = '';
  document.getElementById('partitionDupCount').value = '';
  document.getElementById('partitionDupRate').value = '';
  calcPartitionDup();
  document.getElementById('partitionEditorModal').style.display = 'flex';
}

function closePartitionEditor() {
  document.getElementById('partitionEditorModal').style.display = 'none';
}

/** 计算单条分区重复率（编辑弹窗内实时计算） */
function calcPartitionDup() {
  const before = document.getElementById('partitionBefore').value;
  const after = document.getElementById('partitionAfter').value;
  document.getElementById('partitionBeforeHint').textContent = before ? `≈ ${formatNum(before)}` : '';
  document.getElementById('partitionAfterHint').textContent = after ? `≈ ${formatNum(after)}` : '';
  const { dupCount, dupRate } = calcDupStats(before, after);
  document.getElementById('partitionDupCount').value = dupCount !== '' ? formatNum(dupCount) : '';
  document.getElementById('partitionDupRate').value = dupRate !== '' ? `${dupRate}%` : '';
}

/** 保存单条分区 */
function savePartitionFromEditor() {
  const name = document.getElementById('partitionName').value.trim();
  if (!name) { showToast('⚠️ 请输入分区名'); return; }

  const index = Number(document.getElementById('partitionEditIndex').value);
  const partitions = getPartitions(currentPartitionRecordId);

  const partitionData = {
    partition: name,
    beforeCount: document.getElementById('partitionBefore').value.trim(),
    afterCount: document.getElementById('partitionAfter').value.trim(),
  };

  if (index >= 0 && index < partitions.length) {
    partitions[index] = partitionData;
  } else {
    partitions.push(partitionData);
  }

  saveRecords();
  closePartitionEditor();
  renderPartitionTable();
  showToast(index >= 0 ? '✅ 分区已更新' : '✅ 分区已添加');
}

/** 删除单条分区 */
function deletePartition(index) {
  const partitions = getPartitions(currentPartitionRecordId);
  const p = partitions[index];
  if (!p) return;
  showConfirm(`确认删除分区「${p.partition}」吗？`, () => {
    partitions.splice(index, 1);
    saveRecords();
    renderPartitionTable();
    showToast('🗑 已删除');
  });
}

// ============================================================
// 粘贴导入
// ============================================================

/**
 * 解析粘贴的文本，智能识别格式
 * 支持列数：2列（分区+数量，before=after）、3列（分区+前+后）
 * 自动识别分隔符：Tab / 逗号 / 多空格
 * 自动跳过表头行
 */
function parseAndImportPartitions() {
  const text = document.getElementById('partitionPasteArea').value.trim();
  if (!text) { showToast('⚠️ 请先粘贴数据'); return; }

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) { showToast('⚠️ 没有有效数据'); return; }

  // 识别分隔符：检查第一行
  const firstLine = lines[0];
  let delimiter;
  if (firstLine.includes('\t')) {
    delimiter = 'tab';
  } else if (firstLine.includes(',')) {
    delimiter = 'comma';
  } else {
    delimiter = 'space';  // 多空格
  }

  const parsed = [];
  let skippedHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let cols;
    if (delimiter === 'tab') {
      cols = line.split('\t');
    } else if (delimiter === 'comma') {
      cols = line.split(',');
    } else {
      cols = line.split(/\s+/);
    }
    cols = cols.map(c => c.trim()).filter(c => c !== '');

    if (cols.length < 2) continue;

    // 检测并跳过表头（第二或第三列不是数字）
    if (i === 0 && isNaN(Number(cols[1]))) {
      skippedHeader = true;
      continue;
    }

    const partition = cols[0];
    const beforeCount = cols[1];
    // 如果有第三列用第三列作为 afterCount，否则 after = before
    const afterCount = cols.length >= 3 ? cols[2] : cols[1];

    parsed.push({ partition, beforeCount, afterCount });
  }

  if (parsed.length === 0) {
    showToast('⚠️ 未能解析出有效数据，请检查格式');
    return;
  }

  const importMode = document.getElementById('pasteImportMode').value;
  const partitions = getPartitions(currentPartitionRecordId);

  if (importMode === 'replace') {
    partitions.length = 0;  // 清空
  }

  parsed.forEach(p => partitions.push(p));
  saveRecords();

  // 切回列表模式查看结果
  switchPartitionMode('list');
  renderPartitionTable();
  document.getElementById('partitionPasteArea').value = '';

  const headerNote = skippedHeader ? '（已跳过表头）' : '';
  showToast(`✅ 成功导入 ${parsed.length} 个分区${headerNote}`);
}

// ============================================================
// 导出分区 Excel
// ============================================================

function exportPartitionExcel() {
  if (!currentPartitionRecordId) return;
  const partitions = getPartitions(currentPartitionRecordId);
  if (partitions.length === 0) { showToast('⚠️ 没有分区数据可导出'); return; }

  const r = records.find(x => x.id === currentPartitionRecordId);
  const taskName = r ? r.taskName : '记录';

  const headers = ['分区名', '去重前数量', '去重后数量', '重复数量', '重复率(%)'];

  const rows = partitions.map(p => {
    const { dupCount, dupRate } = calcDupStats(p.beforeCount, p.afterCount);
    return `<tr>
      <td>${esc(p.partition || '')}</td>
      <td>${esc(p.beforeCount || '')}</td>
      <td>${esc(p.afterCount || '')}</td>
      <td>${dupCount}</td>
      <td>${dupRate}</td>
    </tr>`;
  }).join('');

  // 汇总行
  const totalBefore = partitions.reduce((s, p) => s + (Number(p.beforeCount) || 0), 0);
  const totalAfter = partitions.reduce((s, p) => s + (Number(p.afterCount) || 0), 0);
  const { dupCount: totalDup, dupRate: avgRate } = calcDupStats(totalBefore, totalAfter);
  const summaryRow = `<tr style="font-weight:bold;background:#e0e7ff;">
    <td>汇总</td><td>${totalBefore}</td><td>${totalAfter}</td><td>${totalDup}</td><td>${avgRate}</td>
  </tr>`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body>
      <h3>${esc(taskName)} — 分区明细</h3>
      <table border="1">
        <tr>${headers.map(h => `<th style="background:#4f46e5;color:white;">${h}</th>`).join('')}</tr>
        ${rows}${summaryRow}
      </table>
    </body>
  </html>`;

  const filename = `${taskName}_分区明细_${formatDate(new Date().toISOString())}.xls`;
  downloadFile(html, filename, 'application/vnd.ms-excel');
  showToast(`📊 已导出 ${partitions.length} 个分区`);
}

// ============================================================
// 详情页展示分区
// ============================================================

function renderPartitionInDetail(record) {
  const partitions = record.partitions || [];
  if (partitions.length === 0) return '';  // 没有分区数据不显示该区块

  const totalBefore = partitions.reduce((s, p) => s + (Number(p.beforeCount) || 0), 0);
  const totalAfter = partitions.reduce((s, p) => s + (Number(p.afterCount) || 0), 0);
  const { dupRate: avgRate } = calcDupStats(totalBefore, totalAfter);

  const rows = partitions.map(p => {
    const { dupCount, dupRate } = calcDupStats(p.beforeCount, p.afterCount);
    return `<tr>
      <td class="partition-name">${esc(p.partition || '-')}</td>
      <td class="num-col">${p.beforeCount ? formatNum(p.beforeCount) : '-'}</td>
      <td class="num-col">${p.afterCount ? formatNum(p.afterCount) : '-'}</td>
      <td class="num-col">${dupCount !== '' ? formatNum(dupCount) : '-'}</td>
      <td class="num-col"><span class="${getDupRateClass(Number(dupRate))}">${dupRate !== '' ? dupRate + '%' : '-'}</span></td>
    </tr>`;
  }).join('');

  return `
    <div class="detail-section detail-partition-section">
      <h3>
        📊 分区明细 (${partitions.length})
        <button class="btn btn-sm btn-secondary export-btn" onclick="exportSingleRecordPartitions('${record.id}')">📊 导出Excel</button>
      </h3>
      <table class="detail-partition-table">
        <thead><tr>
          <th>分区名</th>
          <th class="num-col">去重前</th>
          <th class="num-col">去重后</th>
          <th class="num-col">重复数量</th>
          <th class="num-col">重复率</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="detail-partition-summary">
        <span>分区数：<strong>${partitions.length}</strong></span>
        <span>总去重前：<strong>${formatNum(totalBefore)}</strong></span>
        <span>总去重后：<strong>${formatNum(totalAfter)}</strong></span>
        <span>平均重复率：<strong class="${getDupRateClass(Number(avgRate))}">${avgRate}%</strong></span>
      </div>
    </div>
  `;
}

/** 从详情页导出单条记录的分区（临时切换 currentPartitionRecordId） */
function exportSingleRecordPartitions(recordId) {
  const savedId = currentPartitionRecordId;
  currentPartitionRecordId = recordId;
  exportPartitionExcel();
  currentPartitionRecordId = savedId;
}

// ============================================================
// 事件绑定 & 初始化
// ============================================================
// 筛选实时响应
['searchInput', 'filterStatus', 'filterOperator', 'filterDateFrom', 'filterDateTo'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderTable);
  document.getElementById(id).addEventListener('change', renderTable);
});

// 点击弹窗遮罩关闭
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      // 关闭分区管理时刷新列表
      if (overlay.id === 'partitionModal') {
        currentPartitionRecordId = null;
        refreshAll();
      }
    }
  });
});

// ESC 关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }
});

// 初始化
loadRecords();
refreshAll();

// 如果是首次使用，添加一条示例记录帮助用户了解
if (records.length === 0) {
  records.push({
    id: genId(),
    taskName: '示例：6月增量数据去重（可删除）',
    createdAt: new Date().toISOString(),
    operator: '示例',
    status: '已完成',
    beforeTable: 'merged_incremental',
    beforeCount: '50000000',
    beforeSources: [
      'glm_data.cdl.cdl_facebook_posts_di',
      'glm_data.cdl.cdl_zhihu_question_answer_di',
      'glm_data.cdl.cdl_csdn_details_di',
    ],
    afterTable: 'merged_incremental_dedup',
    afterCount: '42000000',
    dedupRules: 'url, content',
    dataRange: "di='20260519' ~ '20260709'",
    ossTable: 'oss://glm-data/dedup/merged_202607/',
    sqlScript: 'DROP TABLE IF EXISTS merged_incremental_dedup;\nCREATE TABLE merged_incremental_dedup AS\nSELECT * FROM (\n  SELECT *, ROW_NUMBER() OVER(PARTITION BY url, content ORDER BY row_id) as rn\n  FROM merged_incremental\n) t WHERE rn = 1;',
    duration: '45',
    remark: '这是一条示例记录，展示各字段效果，可随时删除。',
    partitions: [
      { partition: "di=20260519", beforeCount: "12000000", afterCount: "9800000" },
      { partition: "di=20260601", beforeCount: "15000000", afterCount: "13000000" },
      { partition: "di=20260709", beforeCount: "23000000", afterCount: "19200000" },
    ],
  });
  saveRecords();
  refreshAll();
}
