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
      record.partitionColumns = records[idx].partitionColumns || [];
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
// 分区详情管理（多阶段去重列）
// ============================================================

let currentPartitionRecordId = null;
let partitionSortField = 'partition';
let partitionSortAsc = true;
let selectedPartitionIndexes = new Set();

// ---- 数据存取 & 迁移 ----

/** 获取记录的分区数组 */
function getPartitions(recordId) {
  const r = records.find(x => x.id === recordId);
  if (!r) return [];
  if (!r.partitions) r.partitions = [];
  return r.partitions;
}

/** 获取记录的列定义 */
function getPartitionColumns(recordId) {
  const r = records.find(x => x.id === recordId);
  if (!r) return [];
  if (!r.partitionColumns) r.partitionColumns = [];
  return r.partitionColumns;
}

/** 旧格式迁移：{ partition, beforeCount, afterCount } → 新多列格式 */
function migratePartitions(record) {
  if (record.partitionColumns && record.partitionColumns.length > 0) return; // 已迁移
  if (!record.partitions || record.partitions.length === 0) {
    record.partitionColumns = [];
    return;
  }
  // 检测旧格式
  const first = record.partitions[0];
  if (first && first.values) return; // 已是新格式

  // 迁移：创建两列
  const col1 = 'col_' + Date.now() + '_1';
  const col2 = 'col_' + Date.now() + '_2';
  record.partitionColumns = [
    { id: col1, name: '去重前', rule: '', inputTable: '', outputTable: '' },
    { id: col2, name: '去重后', rule: '', inputTable: '', outputTable: '' },
  ];
  record.partitions = record.partitions.map(p => ({
    partition: p.partition,
    values: { [col1]: p.beforeCount || '', [col2]: p.afterCount || '' },
  }));
}

/** 生成列 ID */
function genColId() {
  return 'col_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/** 多阶段去重率计算
 *  返回: { totalRate, stages: [{from, to, rate, drop}] }
 *  totalRate = 第一列→最后一列的总去重率
 *  stages = 每相邻列之间的阶段去重率
 */
function calcMultiStageRates(values, columns) {
  if (!columns || columns.length < 2) return { totalRate: '', stages: [] };
  const counts = columns.map(c => Number(values[c.id]) || 0);
  const first = counts[0];
  const last = counts[counts.length - 1];

  const stages = [];
  for (let i = 1; i < counts.length; i++) {
    const prev = counts[i - 1];
    const curr = counts[i];
    if (prev > 0) {
      const drop = prev - curr;
      const rate = ((drop / prev) * 100).toFixed(2);
      stages.push({ from: columns[i-1].name, to: columns[i].name, rate, drop });
    } else {
      stages.push({ from: columns[i-1].name, to: columns[i].name, rate: '', drop: '' });
    }
  }

  const totalRate = first > 0 ? (((first - last) / first) * 100).toFixed(2) : '';
  return { totalRate, stages };
}

// ---- 打开/关闭分区管理 ----

function openPartitionManager(recordId) {
  currentPartitionRecordId = recordId;
  const r = records.find(x => x.id === recordId);
  if (r) migratePartitions(r);
  document.getElementById('partitionModalTitle').textContent = r ? r.taskName : '';
  switchPartitionMode('list');
  partitionSortField = 'partition';
  partitionSortAsc = true;
  selectedPartitionIndexes.clear();
  cancelBatchDelete();
  document.getElementById('partitionSearch').value = '';
  updatePasteColumnOptions();
  renderPartitionTable();
  document.getElementById('partitionModal').style.display = 'flex';
}

function closePartitionManager() {
  document.getElementById('partitionModal').style.display = 'none';
  currentPartitionRecordId = null;
  refreshAll();
}

function switchPartitionMode(mode) {
  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(mode === 'list' ? '列表' : '粘贴'));
  });
  document.getElementById('partitionListMode').classList.toggle('active', mode === 'list');
  document.getElementById('partitionPasteMode').classList.toggle('active', mode === 'paste');
  if (mode === 'paste') updatePasteColumnOptions();
}

// ---- 列管理 CRUD ----

/** 打开列管理面板 */
function openColumnManager() {
  renderColumnManager();
  document.getElementById('columnManagerModal').style.display = 'flex';
}

function closeColumnManager() {
  document.getElementById('columnManagerModal').style.display = 'none';
}

/** 渲染列管理列表 */
function renderColumnManager() {
  const columns = getPartitionColumns(currentPartitionRecordId);
  const tbody = document.getElementById('columnManagerBody');

  if (columns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:20px;">暂无列，点击下方添加</td></tr>';
    return;
  }

  tbody.innerHTML = columns.map((col, i) => `
    <tr>
      <td><strong>${esc(col.name)}</strong></td>
      <td>${esc(col.rule || '-')}</td>
      <td class="table-flow">${esc(col.inputTable || '-')} <span class="arrow">→</span> ${esc(col.outputTable || '-')}</td>
      <td class="action-col">
        <button class="row-btn" title="上移" onclick="moveColumn(${i}, -1)" ${i === 0 ? 'disabled' : ''}>⬆</button>
        <button class="row-btn" title="下移" onclick="moveColumn(${i}, 1)" ${i === columns.length - 1 ? 'disabled' : ''}>⬇</button>
        <button class="row-btn" title="编辑" onclick="openColumnEditor(${i})">✏️</button>
        <button class="row-btn delete" title="删除" onclick="deleteColumn(${i})">🗑</button>
      </td>
    </tr>
  `).join('');
}

/** 打开列编辑器 */
function openColumnEditor(index = -1) {
  const columns = getPartitionColumns(currentPartitionRecordId);
  document.getElementById('columnEditIndex').value = index;
  if (index >= 0 && columns[index]) {
    document.getElementById('columnEditorTitle').textContent = '编辑列';
    document.getElementById('columnName').value = columns[index].name || '';
    document.getElementById('columnRule').value = columns[index].rule || '';
    document.getElementById('columnInputTable').value = columns[index].inputTable || '';
    document.getElementById('columnOutputTable').value = columns[index].outputTable || '';
  } else {
    document.getElementById('columnEditorTitle').textContent = '添加列';
    document.getElementById('columnName').value = '';
    document.getElementById('columnRule').value = '';
    document.getElementById('columnInputTable').value = '';
    document.getElementById('columnOutputTable').value = '';
  }
  document.getElementById('columnEditorModal').style.display = 'flex';
}

function closeColumnEditor() {
  document.getElementById('columnEditorModal').style.display = 'none';
}

/** 保存列 */
function saveColumnFromEditor() {
  const name = document.getElementById('columnName').value.trim();
  if (!name) { showToast('⚠️ 请输入列名'); return; }

  const index = Number(document.getElementById('columnEditIndex').value);
  const columns = getPartitionColumns(currentPartitionRecordId);
  const colData = {
    id: index >= 0 ? columns[index].id : genColId(),
    name: name,
    rule: document.getElementById('columnRule').value.trim(),
    inputTable: document.getElementById('columnInputTable').value.trim(),
    outputTable: document.getElementById('columnOutputTable').value.trim(),
  };

  if (index >= 0) {
    columns[index] = colData;
  } else {
    columns.push(colData);
    // 给所有已有分区添加这个列的空值
    const partitions = getPartitions(currentPartitionRecordId);
    partitions.forEach(p => {
      if (!p.values) p.values = {};
      p.values[colData.id] = '';
    });
  }

  saveRecords();
  closeColumnEditor();
  renderColumnManager();
  updatePasteColumnOptions();
  renderPartitionTable();
  showToast(index >= 0 ? '✅ 列已更新' : '✅ 列已添加');
}

/** 删除列 */
function deleteColumn(index) {
  const columns = getPartitionColumns(currentPartitionRecordId);
  const col = columns[index];
  if (!col) return;
  if (columns.length <= 1) { showToast('⚠️ 至少保留一列'); return; }

  showConfirmInPartition(`确认删除列「${col.name}」？该列的所有分区数据将丢失。`, () => {
    // 删除列定义
    columns.splice(index, 1);
    // 删除所有分区中该列的值
    const partitions = getPartitions(currentPartitionRecordId);
    partitions.forEach(p => {
      if (p.values) delete p.values[col.id];
    });
    saveRecords();
    renderColumnManager();
    updatePasteColumnOptions();
    renderPartitionTable();
    showToast('🗑 列已删除');
  });
}

/** 移动列顺序 */
function moveColumn(index, direction) {
  const columns = getPartitionColumns(currentPartitionRecordId);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= columns.length) return;
  [columns[index], columns[newIndex]] = [columns[newIndex], columns[index]];
  saveRecords();
  renderColumnManager();
  renderPartitionTable();
}

// ---- 分区表格渲染（动态列） ----

function renderPartitionTable() {
  if (!currentPartitionRecordId) return;
  const r = records.find(x => x.id === currentPartitionRecordId);
  if (r) migratePartitions(r);
  const columns = getPartitionColumns(currentPartitionRecordId);
  const partitions = getPartitions(currentPartitionRecordId);
  const search = document.getElementById('partitionSearch').value.toLowerCase().trim();

  // 动态生成表头
  const thead = document.getElementById('partitionTableHead');
  const hasColumns = columns.length > 0;
  const showTotalRate = columns.length >= 2;

  thead.innerHTML = `<tr>
    <th class="checkbox-col"><input type="checkbox" id="partitionSelectAll" onchange="toggleSelectAll(this)"></th>
    <th onclick="sortPartitions('partition')" class="sortable">分区名 ↕</th>
    ${columns.map(c => `<th onclick="sortPartitions('${c.id}')" class="sortable num-col">${esc(c.name)} ↕</th>`).join('')}
    ${showTotalRate ? '<th class="num-col">总去重率</th>' : ''}
    <th class="action-col">操作</th>
  </tr>`;

  // 筛选
  const filtered = search
    ? partitions.filter(p => (p.partition || '').toLowerCase().includes(search))
    : [...partitions];

  // 排序
  filtered.sort((a, b) => {
    let va, vb;
    if (partitionSortField === 'partition') {
      va = a.partition || ''; vb = b.partition || '';
    } else {
      va = Number((a.values || {})[partitionSortField]) || 0;
      vb = Number((b.values || {})[partitionSortField]) || 0;
    }
    if (va < vb) return partitionSortAsc ? -1 : 1;
    if (va > vb) return partitionSortAsc ? 1 : -1;
    return 0;
  });

  // 汇总
  renderPartitionSummary(partitions, columns);

  // 表格体
  const tbody = document.getElementById('partitionTableBody');
  const emptyEl = document.getElementById('partitionEmpty');
  const tableEl = document.querySelector('.partition-table');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    emptyEl.querySelector('p').textContent = hasColumns ? '暂无分区数据，点击「新增分区」或切换到「粘贴导入」' : '请先点击「⚙ 管理列」添加去重阶段列';
    updateSelectionUI();
    return;
  }
  tableEl.style.display = '';
  emptyEl.style.display = 'none';

  tbody.innerHTML = filtered.map(p => {
    const realIndex = partitions.indexOf(p);
    const isChecked = selectedPartitionIndexes.has(realIndex);
    const values = p.values || {};
    const { totalRate } = calcMultiStageRates(values, columns);
    const totalRateDisplay = totalRate !== '' ? `${totalRate}%` : '-';
    return `
      <tr class="${isChecked ? 'selected-row' : ''}">
        <td class="checkbox-col"><input type="checkbox" data-index="${realIndex}" ${isChecked ? 'checked' : ''} onchange="toggleSelectPartition(${realIndex}, this.checked)"></td>
        <td class="partition-name">${esc(p.partition || '-')}</td>
        ${columns.map(c => `<td class="num-col">${values[c.id] ? formatNum(values[c.id]) : '-'}</td>`).join('')}
        ${showTotalRate ? `<td class="num-col"><span class="${getDupRateClass(Number(totalRate))}">${totalRateDisplay}</span></td>` : ''}
        <td class="action-col">
          <button class="row-btn" title="编辑" onclick="openPartitionEditor(${realIndex})">✏️</button>
          <button class="row-btn delete" title="删除" onclick="deletePartition(${realIndex})">🗑</button>
        </td>
      </tr>
    `;
  }).join('');

  // 全选框状态
  const selectAllCheckbox = document.getElementById('partitionSelectAll');
  if (selectAllCheckbox) {
    const allSelected = partitions.length > 0 && partitions.every((_, i) => selectedPartitionIndexes.has(i));
    selectAllCheckbox.checked = allSelected;
  }
  updateSelectionUI();
}

/** 渲染分区汇总 */
function renderPartitionSummary(partitions, columns) {
  const summary = document.getElementById('partitionSummary');
  if (columns.length === 0) {
    summary.innerHTML = '<div class="sum-item"><span class="sum-label">尚未定义列，请点击「⚙ 管理列」</span></div>';
    return;
  }

  // 每列的汇总
  const colSums = columns.map(c => {
    const total = partitions.reduce((s, p) => s + (Number((p.values || {})[c.id]) || 0), 0);
    return `<div class="sum-item"><span class="sum-label">${esc(c.name)}：</span><span class="sum-value">${formatNum(total)}</span></div>`;
  }).join('');

  // 总去重率
  let rateHtml = '';
  if (columns.length >= 2) {
    const firstCol = columns[0];
    const lastCol = columns[columns.length - 1];
    const totalFirst = partitions.reduce((s, p) => s + (Number((p.values || {})[firstCol.id]) || 0), 0);
    const totalLast = partitions.reduce((s, p) => s + (Number((p.values || {})[lastCol.id]) || 0), 0);
    const avgRate = totalFirst > 0 ? (((totalFirst - totalLast) / totalFirst) * 100).toFixed(2) : '0';
    rateHtml = `<div class="sum-item"><span class="sum-label">平均总去重率：</span><span class="sum-value ${getDupRateClass(Number(avgRate))}">${avgRate}%</span></div>`;
  }

  summary.innerHTML = `
    <div class="sum-item"><span class="sum-label">分区数：</span><span class="sum-value">${partitions.length}</span></div>
    ${colSums}
    ${rateHtml}
  `;
}

function sortPartitions(field) {
  if (partitionSortField === field) {
    partitionSortAsc = !partitionSortAsc;
  } else {
    partitionSortField = field;
    partitionSortAsc = (field === 'partition');
  }
  renderPartitionTable();
}

// ---- 选择 & 批量删除 ----

function toggleSelectPartition(index, checked) {
  if (checked) { selectedPartitionIndexes.add(index); } else { selectedPartitionIndexes.delete(index); }
  const row = document.querySelector(`input[data-index="${index}"]`)?.closest('tr');
  if (row) row.classList.toggle('selected-row', checked);
  updateSelectionUI();
  const selectAllCheckbox = document.getElementById('partitionSelectAll');
  const partitions = getPartitions(currentPartitionRecordId);
  const allSelected = partitions.length > 0 && partitions.every((_, i) => selectedPartitionIndexes.has(i));
  if (selectAllCheckbox) selectAllCheckbox.checked = allSelected;
}

function toggleSelectAll(checkbox) {
  const partitions = getPartitions(currentPartitionRecordId);
  const search = document.getElementById('partitionSearch').value.toLowerCase().trim();
  if (checkbox.checked) {
    partitions.forEach((p, i) => {
      if (!search || (p.partition || '').toLowerCase().includes(search)) selectedPartitionIndexes.add(i);
    });
  } else {
    partitions.forEach((p, i) => {
      if (!search || (p.partition || '').toLowerCase().includes(search)) selectedPartitionIndexes.delete(i);
    });
  }
  renderPartitionTable();
}

function updateSelectionUI() {
  const count = selectedPartitionIndexes.size;
  document.getElementById('partitionSelectedCount').style.display = count > 0 ? 'inline-block' : 'none';
  document.getElementById('partitionSelectedCount').textContent = `已选 ${count} 项`;
  document.getElementById('batchDeleteBtn').style.display = count > 0 ? 'inline-flex' : 'none';
  document.getElementById('clearSelectionBtn').style.display = count > 0 ? 'inline-flex' : 'none';
}

function clearPartitionSelection() {
  selectedPartitionIndexes.clear();
  cancelBatchDelete();
  renderPartitionTable();
}

function showBatchDeleteConfirm() {
  const count = selectedPartitionIndexes.size;
  if (count === 0) return;
  const bar = document.getElementById('batchDeleteConfirmBar');
  document.getElementById('batchDeleteMessage').textContent = `⚠️ 确认删除选中的 ${count} 个分区？此操作不可撤销。`;
  bar.style.display = 'flex';
  bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelBatchDelete() {
  const bar = document.getElementById('batchDeleteConfirmBar');
  if (bar) bar.style.display = 'none';
}

function executeBatchDelete() {
  const partitions = getPartitions(currentPartitionRecordId);
  const sortedIndexes = [...selectedPartitionIndexes].sort((a, b) => b - a);
  sortedIndexes.forEach(i => partitions.splice(i, 1));
  saveRecords();
  selectedPartitionIndexes.clear();
  cancelBatchDelete();
  renderPartitionTable();
  showToast(`🗑 已删除 ${sortedIndexes.length} 个分区`);
}

/** 分区弹窗内的内联确认（不弹遮罩） */
function showConfirmInPartition(message, onConfirm) {
  const bar = document.getElementById('batchDeleteConfirmBar');
  document.getElementById('batchDeleteMessage').textContent = message;
  bar.style.display = 'flex';
  bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // 临时替换确认按钮的行为
  const oldBtn = document.getElementById('inlineConfirmExecuteBtn');
  if (oldBtn) {
    const newBtn = oldBtn.cloneNode(true);
    newBtn.id = 'inlineConfirmExecuteBtn';
    newBtn.onclick = () => { onConfirm(); cancelBatchDelete(); };
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  }
}

// ---- 单条分区增删改（动态字段） ----

function openPartitionEditor(index = -1) {
  const columns = getPartitionColumns(currentPartitionRecordId);
  if (columns.length === 0) {
    showToast('⚠️ 请先在「⚙ 管理列」中添加列');
    openColumnManager();
    return;
  }

  document.getElementById('partitionEditIndex').value = index;

  // 动态生成字段
  const fieldsContainer = document.getElementById('partitionEditorFields');
  if (index >= 0) {
    const partitions = getPartitions(currentPartitionRecordId);
    const p = partitions[index];
    document.getElementById('partitionEditorTitle').textContent = '编辑分区';
    document.getElementById('partitionName').value = p.partition || '';
    fieldsContainer.innerHTML = columns.map(c => `
      <div class="form-group num-input-group">
        <label>${esc(c.name)}</label>
        <input type="number" class="partition-col-input" data-colid="${c.id}" value="${esc((p.values || {})[c.id] || '')}" placeholder="数量">
      </div>
    `).join('');
  } else {
    document.getElementById('partitionEditorTitle').textContent = '新增分区';
    document.getElementById('partitionName').value = '';
    fieldsContainer.innerHTML = columns.map(c => `
      <div class="form-group num-input-group">
        <label>${esc(c.name)}</label>
        <input type="number" class="partition-col-input" data-colid="${c.id}" value="" placeholder="数量">
      </div>
    `).join('');
  }
  document.getElementById('partitionEditorModal').style.display = 'flex';
}

function closePartitionEditor() {
  document.getElementById('partitionEditorModal').style.display = 'none';
}

function savePartitionFromEditor() {
  const name = document.getElementById('partitionName').value.trim();
  if (!name) { showToast('⚠️ 请输入分区名'); return; }

  const index = Number(document.getElementById('partitionEditIndex').value);
  const partitions = getPartitions(currentPartitionRecordId);
  const columns = getPartitionColumns(currentPartitionRecordId);

  // 收集动态字段
  const values = {};
  document.querySelectorAll('.partition-col-input').forEach(input => {
    values[input.dataset.colid] = input.value.trim();
  });

  const partitionData = { partition: name, values };

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

function deletePartition(index) {
  const partitions = getPartitions(currentPartitionRecordId);
  const p = partitions[index];
  if (!p) return;
  selectedPartitionIndexes.clear();
  selectedPartitionIndexes.add(index);
  cancelBatchDelete();
  const bar = document.getElementById('batchDeleteConfirmBar');
  document.getElementById('batchDeleteMessage').textContent = `⚠️ 确认删除分区「${p.partition}」？此操作不可撤销。`;
  bar.style.display = 'flex';
  bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- 粘贴导入（动态目标列） ----

let currentPasteType = 'target'; // target | multi

function switchPasteType(type) {
  currentPasteType = type;
  document.querySelectorAll('.ptype-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pastetype === type);
  });
  const desc = document.getElementById('pasteTypeDesc');
  const targetSelector = document.getElementById('pasteTargetColumnWrap');
  if (type === 'target') {
    desc.innerHTML = '👆 选择一个<strong>目标列</strong>，粘贴的数据会写入该列（按分区名合并）。可多次粘贴到不同列。';
    targetSelector.style.display = 'inline-flex';
  } else {
    desc.innerHTML = '🔀 每行包含<strong>多列数量</strong>，按列顺序自动匹配到各阶段列。适合一次性粘贴完整数据。';
    targetSelector.style.display = 'none';
  }
  updatePasteColumnOptions();
}

/** 更新粘贴目标列下拉选项 */
function updatePasteColumnOptions() {
  const columns = getPartitionColumns(currentPartitionRecordId);
  const select = document.getElementById('pasteTargetColumn');
  if (!select) return;
  select.innerHTML = columns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

function cleanNumber(str) {
  if (!str) return '';
  let s = str.replace(/(\d),(?=\d{3})/g, '$1');
  const match = s.match(/[\d,]+(\.\d+)?/);
  return match ? match[0].replace(/,/g, '') : '';
}

function isNumericLike(str) {
  if (!str) return false;
  const cleaned = str.replace(/,/g, '').trim();
  return /^\d+(\.\d+)?$/.test(cleaned);
}

function parseAndImportPartitions() {
  const text = document.getElementById('partitionPasteArea').value.trim();
  if (!text) { showToast('⚠️ 请先粘贴数据'); return; }

  const columns = getPartitionColumns(currentPartitionRecordId);
  if (columns.length === 0) { showToast('⚠️ 请先在「⚙ 管理列」中添加列'); return; }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  if (lines.length === 0) { showToast('⚠️ 没有有效数据'); return; }

  const firstLine = lines[0];
  const isHorizontal = checkHorizontalFormat(firstLine);
  let parsed = [];
  let skippedHeader = false;

  if (isHorizontal) {
    const result = parseHorizontalFormat(lines);
    parsed = result.parsed;
    skippedHeader = result.skippedHeader;
  } else {
    parsed = parseVerticalFormat(lines);
  }

  if (parsed.length === 0) { showToast('⚠️ 未能解析出有效数据'); return; }

  const importMode = document.getElementById('pasteImportMode').value;
  const partitions = getPartitions(currentPartitionRecordId);
  let stats = { imported: 0, merged: 0, newAdded: 0 };

  if (currentPasteType === 'target') {
    // 贴入到指定列
    const targetColId = document.getElementById('pasteTargetColumn').value;
    if (!targetColId) { showToast('⚠️ 请选择目标列'); return; }

    if (importMode === 'replace') {
      partitions.length = 0;
      parsed.forEach(p => {
        partitions.push({ partition: p.partition, values: { [targetColId]: p.beforeCount } });
        stats.imported++;
      });
    } else {
      const partMap = {};
      partitions.forEach((p, i) => { if (p.partition) partMap[p.partition] = i; });

      parsed.forEach(p => {
        if (partMap.hasOwnProperty(p.partition)) {
          const existing = partitions[partMap[p.partition]];
          if (!existing.values) existing.values = {};
          existing.values[targetColId] = p.beforeCount;
          stats.merged++;
        } else {
          const newPart = { partition: p.partition, values: {} };
          columns.forEach(c => { newPart.values[c.id] = ''; });
          newPart.values[targetColId] = p.beforeCount;
          partitions.push(newPart);
          partMap[p.partition] = partitions.length - 1;
          stats.newAdded++;
        }
        stats.imported++;
      });
    }
  } else {
    // 多列模式：按顺序匹配
    if (importMode === 'replace') {
      partitions.length = 0;
      parsed.forEach(p => {
        const values = {};
        columns.forEach((c, ci) => {
          if (ci === 0) values[c.id] = p.beforeCount;
          else if (ci === 1) values[c.id] = p.afterCount;
        });
        partitions.push({ partition: p.partition, values });
        stats.imported++;
      });
    } else {
      const partMap = {};
      partitions.forEach((p, i) => { if (p.partition) partMap[p.partition] = i; });

      parsed.forEach(p => {
        let existing;
        if (partMap.hasOwnProperty(p.partition)) {
          existing = partitions[partMap[p.partition]];
          stats.merged++;
        } else {
          existing = { partition: p.partition, values: {} };
          columns.forEach(c => { existing.values[c.id] = ''; });
          partitions.push(existing);
          partMap[p.partition] = partitions.length - 1;
          stats.newAdded++;
        }
        if (!existing.values) existing.values = {};
        columns.forEach((c, ci) => {
          if (ci === 0 && p.beforeCount) existing.values[c.id] = p.beforeCount;
          if (ci === 1 && p.afterCount) existing.values[c.id] = p.afterCount;
        });
        stats.imported++;
      });
    }
  }

  saveRecords();
  renderPartitionTable();
  document.getElementById('partitionPasteArea').value = '';

  const headerNote = skippedHeader ? '（已跳过表头）' : '';
  let msg = importMode === 'replace'
    ? `✅ 覆盖导入 ${stats.imported} 个分区${headerNote}`
    : `✅ 导入完成：合并 ${stats.merged} 个，新增 ${stats.newAdded} 个${headerNote}`;
  showToast(msg);
}

function checkHorizontalFormat(line) {
  if (line.includes('\t')) {
    const cols = line.split('\t').filter(c => c.trim());
    return cols.length >= 2;
  }
  if (line.includes(',') && isNumericLike(line.split(',')[1])) {
    const cols = line.split(',');
    if (cols.length >= 2 && isNumericLike(cols[1])) return true;
    if (cols.length >= 3 && isNumericLike(cols[2])) return true;
    return false;
  }
  if (/\s{2,}/.test(line) || (/=/.test(line) && /\s/.test(line))) {
    const cols = line.split(/\s+/).filter(c => c);
    return cols.length >= 2;
  }
  return false;
}

function parseHorizontalFormat(lines) {
  const parsed = [];
  let skippedHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let cols;
    if (line.includes('\t')) { cols = line.split('\t'); }
    else if (line.includes(',') && isNumericLike(line.split(',')[1])) { cols = line.split(','); }
    else { cols = line.split(/\s+/); }
    cols = cols.map(c => c.trim()).filter(c => c !== '');
    if (cols.length < 2) continue;
    if (i === 0 && !isNumericLike(cols[1])) { skippedHeader = true; continue; }
    const partition = cols[0];
    const beforeCount = cleanNumber(cols[1]);
    let afterCount = beforeCount;
    if (cols.length >= 3 && isNumericLike(cols[2])) afterCount = cleanNumber(cols[2]);
    parsed.push({ partition, beforeCount, afterCount });
  }
  return { parsed, skippedHeader };
}

function parseVerticalFormat(lines) {
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\w+=.+/.test(line)) {
      const partition = line.trim();
      let count = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^\w+=.+/.test(lines[j])) break;
        if (isNumericLike(lines[j])) { count = cleanNumber(lines[j]); break; }
      }
      if (count) parsed.push({ partition, beforeCount: count, afterCount: count });
    }
  }
  return parsed;
}

// ---- 导出分区 Excel（动态列 + 阶段去重率） ----

function exportPartitionExcel() {
  if (!currentPartitionRecordId) return;
  const r = records.find(x => x.id === currentPartitionRecordId);
  if (r) migratePartitions(r);
  const columns = getPartitionColumns(currentPartitionRecordId);
  const partitions = getPartitions(currentPartitionRecordId);
  if (partitions.length === 0) { showToast('⚠️ 没有分区数据可导出'); return; }

  const taskName = r ? r.taskName : '记录';
  const showTotalRate = columns.length >= 2;

  // 表头
  let headers = ['分区名', ...columns.map(c => c.name)];
  if (showTotalRate) headers.push('总去重率(%)');
  // 阶段间去重率列
  if (columns.length >= 2) {
    for (let i = 1; i < columns.length; i++) {
      headers.push(`${columns[i-1].name}→${columns[i].name}去重率(%)`);
    }
  }

  // 数据行
  const rows = partitions.map(p => {
    const values = p.values || {};
    const { totalRate, stages } = calcMultiStageRates(values, columns);
    let cells = [p.partition || ''];
    columns.forEach(c => cells.push(values[c.id] || ''));
    if (showTotalRate) cells.push(totalRate);
    if (columns.length >= 2) stages.forEach(s => cells.push(s.rate));
    return '<tr>' + cells.map(c => `<td>${esc(String(c))}</td>`).join('') + '</tr>';
  }).join('');

  // 汇总行
  const sums = [];
  sums.push('汇总');
  columns.forEach(c => {
    sums.push(partitions.reduce((s, p) => s + (Number((p.values || {})[c.id]) || 0), 0));
  });
  if (showTotalRate) {
    const firstCol = columns[0], lastCol = columns[columns.length - 1];
    const tF = partitions.reduce((s, p) => s + (Number((p.values || {})[firstCol.id]) || 0), 0);
    const tL = partitions.reduce((s, p) => s + (Number((p.values || {})[lastCol.id]) || 0), 0);
    sums.push(tF > 0 ? ((tF - tL) / tF * 100).toFixed(2) : '');
  }
  if (columns.length >= 2) {
    for (let i = 1; i < columns.length; i++) {
      const prevSum = partitions.reduce((s, p) => s + (Number((p.values || {})[columns[i-1].id]) || 0), 0);
      const currSum = partitions.reduce((s, p) => s + (Number((p.values || {})[columns[i].id]) || 0), 0);
      sums.push(prevSum > 0 ? ((prevSum - currSum) / prevSum * 100).toFixed(2) : '');
    }
  }
  const summaryRow = `<tr style="font-weight:bold;background:#e0e7ff;">${sums.map(s => `<td>${esc(String(s))}</td>`).join('')}</tr>`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head><body>
    <h3>${esc(taskName)} — 分区明细</h3>
    <table border="1"><tr>${headers.map(h => `<th style="background:#4f46e5;color:white;">${esc(h)}</th>`).join('')}</tr>${rows}${summaryRow}</table>
    </body></html>`;

  downloadFile(html, `${taskName}_分区明细_${formatDate(new Date().toISOString())}.xls`, 'application/vnd.ms-excel');
  showToast(`📊 已导出 ${partitions.length} 个分区`);
}

// ---- 详情页展示分区（动态列） ----

function renderPartitionInDetail(record) {
  migratePartitions(record);
  const partitions = record.partitions || [];
  const columns = record.partitionColumns || [];
  if (partitions.length === 0) return '';

  const showTotalRate = columns.length >= 2;
  let headers = ['分区名'];
  if (columns.length > 0) {
    headers.push(...columns.map(c => c.name));
  } else {
    headers.push('去重前', '去重后');
  }
  if (showTotalRate) headers.push('总去重率');

  const rows = partitions.map(p => {
    const values = p.values || {};
    const { totalRate } = calcMultiStageRates(values, columns);
    let cells = [`<td class="partition-name">${esc(p.partition || '-')}</td>`];
    if (columns.length > 0) {
      columns.forEach(c => {
        cells.push(`<td class="num-col">${values[c.id] ? formatNum(values[c.id]) : '-'}</td>`);
      });
    }
    if (showTotalRate) {
      cells.push(`<td class="num-col"><span class="${getDupRateClass(Number(totalRate))}">${totalRate !== '' ? totalRate + '%' : '-'}</span></td>`);
    }
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  // 汇总
  let sumCells = ['<strong>汇总</strong>'];
  if (columns.length > 0) {
    columns.forEach(c => {
      const total = partitions.reduce((s, p) => s + (Number((p.values || {})[c.id]) || 0), 0);
      sumCells.push(`<strong>${formatNum(total)}</strong>`);
    });
  }
  if (showTotalRate) {
    const firstCol = columns[0], lastCol = columns[columns.length - 1];
    const tF = partitions.reduce((s, p) => s + (Number((p.values || {})[firstCol.id]) || 0), 0);
    const tL = partitions.reduce((s, p) => s + (Number((p.values || {})[lastCol.id]) || 0), 0);
    const avgRate = tF > 0 ? ((tF - tL) / tF * 100).toFixed(2) : '0';
    sumCells.push(`<strong class="${getDupRateClass(Number(avgRate))}">${avgRate}%</strong>`);
  }

  return `
    <div class="detail-section detail-partition-section">
      <h3>
        📊 分区明细 (${partitions.length})
        <button class="btn btn-sm btn-secondary export-btn" onclick="exportSingleRecordPartitions('${record.id}')">📊 导出Excel</button>
      </h3>
      <div style="overflow-x:auto;">
      <table class="detail-partition-table">
        <thead><tr>${headers.map(h => `<th class="${h !== '分区名' ? 'num-col' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows}
          <tr style="border-top:2px solid var(--border);">${sumCells.map((c, i) => `<td class="${i !== 0 ? 'num-col' : ''}">${c}</td>`).join('')}</tr>
        </tbody>
      </table>
      </div>
    </div>
  `;
}

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
    partitionColumns: [
      { id: "col_raw", name: "原始数量", rule: "", inputTable: "merged_incremental", outputTable: "" },
      { id: "col_row", name: "行去重后", rule: "url, content", inputTable: "merged_incremental", outputTable: "merged_row_dedup" },
      { id: "col_exact", name: "精确去重后", rule: "content_hash", inputTable: "merged_row_dedup", outputTable: "merged_exact_dedup" },
      { id: "col_mh", name: "MinHash去重后", rule: "minhash(sim=0.8)", inputTable: "merged_exact_dedup", outputTable: "merged_mh_dedup" },
    ],
    partitions: [
      { partition: "di=20260519", values: { col_raw: "12000000", col_row: "11000000", col_exact: "9800000", col_mh: "8500000" } },
      { partition: "di=20260601", values: { col_raw: "15000000", col_row: "13800000", col_exact: "13000000", col_mh: "11200000" } },
      { partition: "di=20260709", values: { col_raw: "23000000", col_row: "21000000", col_exact: "19200000", col_mh: "16500000" } },
    ],
  });
  saveRecords();
  refreshAll();
}
