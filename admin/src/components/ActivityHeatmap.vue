<template>
  <div class="activity-heatmap" :class="{ 'is-empty': isEmpty }">
    <div class="heatmap-scroll">
      <div class="heatmap-layout">
        <div class="heatmap-day-col" aria-hidden="true">
          <div class="heatmap-month-spacer" />
          <div class="heatmap-day-labels">
            <span />
            <span>一</span>
            <span />
            <span>三</span>
            <span />
            <span>五</span>
            <span />
          </div>
        </div>
        <div class="heatmap-main" :style="heatmapStyle">
          <div class="heatmap-months" aria-hidden="true">
            <span
              v-for="(m, idx) in monthLabels"
              :key="'m-' + idx"
              class="heatmap-month"
              :style="{ gridColumn: m.colStart }"
            >
              {{ m.label }}
            </span>
          </div>
          <div
            class="heatmap-grid"
            role="img"
            :aria-label="ariaLabel"
            :style="{ aspectRatio: `${weekCount || 1} / 7` }"
          >
            <div
              v-for="cell in cells"
              :key="cell.date"
              class="heatmap-cell"
              :class="`heatmap-cell--l${cell.level}`"
              :data-date="cell.date"
              :title="cell.hidden ? undefined : cell.tooltip"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="heatmap-footer">
      <span class="heatmap-stat">
        过去一年共 <strong>{{ total }}</strong> {{ unitLabel }}
      </span>
      <div class="heatmap-legend" aria-hidden="true">
        <span class="heatmap-legend-label">少</span>
        <span
          v-for="lv in 5"
          :key="lv"
          class="heatmap-legend-swatch"
          :class="`heatmap-legend-swatch--l${lv - 1}`"
        />
        <span class="heatmap-legend-label">多</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  days: { type: Array, default: () => [] },
  max: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  type: { type: String, default: 'operations' },
  title: { type: String, default: '' }
});

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function parseCalendarDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function calendarWeekdayMon0(ymd) {
  const d = parseCalendarDate(ymd);
  return (d.getDay() + 6) % 7;
}

/** 固定档位 + 相对峰值，避免「有数据但全浅色/全灰」 */
function countLevel(count, max) {
  const c = Number(count) || 0;
  if (c <= 0) return 0;
  if (c === 1) return 1;
  if (c === 2) return 2;
  if (c <= 4) return 3;
  const m = Math.max(4, Number(max) || 4);
  const ratio = c / m;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function formatTooltipDate(ymd) {
  const d = parseCalendarDate(ymd);
  const w = WEEKDAY_LABELS[d.getDay()];
  return `${ymd} ${w}`;
}

const unitLabel = computed(() => {
  if (props.type === 'reports') return '份报告';
  if (props.type === 'sales_orders') return '笔订单';
  return '次操作';
});

const ariaLabel = computed(() => {
  const t = props.title || '活动热力图';
  return `${t}，过去一年共 ${props.total} ${unitLabel.value}`;
});

const gridMeta = computed(() => {
  const list = Array.isArray(props.days) ? props.days : [];
  if (!list.length) return { cells: [], weekCount: 0, monthLabels: [] };

  const first = list[0].date;
  const pad = calendarWeekdayMon0(first);
  const padded = [];
  for (let i = 0; i < pad; i += 1) {
    padded.push({ date: `_pad-${i}`, count: 0, pad: true });
  }
  for (const item of list) {
    padded.push({
      date: item.date,
      count: Number(item.count) || 0,
      pad: false
    });
  }
  while (padded.length % 7 !== 0) {
    padded.push({ date: `_tail-${padded.length}`, count: 0, pad: true });
  }

  const weekCount = padded.length / 7;
  const max = Number(props.max) || 0;

  const cells = padded.map((item) => {
    if (item.pad) {
      return {
        date: item.date,
        count: 0,
        level: 0,
        tooltip: '',
        hidden: true
      };
    }
    const count = item.count;
    return {
      date: item.date,
      count,
      level: countLevel(count, max),
      tooltip: `${formatTooltipDate(item.date)}：${count} ${unitLabel.value}`,
      hidden: false
    };
  });

  const monthLabels = [];
  const seen = new Set();
  for (let w = 0; w < weekCount; w += 1) {
    for (let r = 0; r < 7; r += 1) {
      const cell = cells[w * 7 + r];
      if (!cell || cell.hidden) continue;
      const d = parseCalendarDate(cell.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (seen.has(key)) continue;
      if (d.getDate() <= 7 || w === 0) {
        seen.add(key);
        monthLabels.push({
          colStart: w + 1,
          label: `${d.getMonth() + 1}月`
        });
      }
      break;
    }
  }

  return { cells, weekCount, monthLabels };
});

const cells = computed(() => gridMeta.value.cells);
const weekCount = computed(() => gridMeta.value.weekCount);
const monthLabels = computed(() => gridMeta.value.monthLabels);

const heatmapStyle = computed(() => ({
  '--week-count': String(weekCount.value || 1)
}));

const isEmpty = computed(() => Number(props.total) <= 0);
</script>

<style scoped>
.activity-heatmap {
  width: 100%;
}

.heatmap-scroll {
  width: 100%;
  padding-bottom: 4px;
}

.heatmap-layout {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: stretch;
}

.heatmap-day-col {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 14px;
}

.heatmap-month-spacer {
  flex: 0 0 22px;
  margin-bottom: 4px;
}

.heatmap-day-labels {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  gap: 3px;
  flex: 1;
  min-height: 0;
  font-size: 10px;
  color: #64748b;
  line-height: 1;
}

.heatmap-day-labels span {
  display: flex;
  align-items: center;
}

.heatmap-main {
  flex: 1;
  min-width: 0;
  width: 100%;
}

.heatmap-months {
  display: grid;
  grid-template-columns: repeat(var(--week-count), minmax(0, 1fr));
  gap: 3px;
  height: 18px;
  margin-bottom: 4px;
  font-size: 10px;
  color: #64748b;
  width: 100%;
}

.heatmap-month {
  white-space: nowrap;
}

.heatmap-grid {
  display: grid;
  width: 100%;
  grid-auto-flow: column;
  grid-template-columns: repeat(var(--week-count), minmax(0, 1fr));
  grid-template-rows: repeat(7, minmax(0, 1fr));
  gap: 3px;
}

.heatmap-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 2px;
  background: #ebedf0;
  cursor: default;
  transition: transform 0.1s, outline 0.1s;
}

.heatmap-cell[data-date^='_'] {
  visibility: hidden;
  pointer-events: none;
}

.heatmap-cell:not([data-date^='_']):hover {
  transform: scale(1.2);
  outline: 1px solid rgba(15, 23, 42, 0.2);
  z-index: 1;
}

/* GitHub 风格绿色系 */
.heatmap-cell--l0,
.heatmap-legend-swatch--l0 {
  background: #ebedf0;
}
.heatmap-cell--l1,
.heatmap-legend-swatch--l1 {
  background: #9be9a8;
}
.heatmap-cell--l2,
.heatmap-legend-swatch--l2 {
  background: #40c463;
}
.heatmap-cell--l3,
.heatmap-legend-swatch--l3 {
  background: #30a14e;
}
.heatmap-cell--l4,
.heatmap-legend-swatch--l4 {
  background: #216e39;
}


.heatmap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
}

.heatmap-stat strong {
  color: #0f172a;
  font-weight: 800;
}

.heatmap-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.heatmap-legend-label {
  font-size: 11px;
  color: #94a3b8;
}

.heatmap-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  display: inline-block;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .heatmap-scroll {
    overflow-x: auto;
  }

  .heatmap-main {
    min-width: 520px;
  }

  .heatmap-grid {
    aspect-ratio: auto;
    grid-template-columns: repeat(var(--week-count), 10px);
    grid-template-rows: repeat(7, 10px);
  }

  .heatmap-months {
    grid-template-columns: repeat(var(--week-count), 10px);
  }

  .heatmap-cell {
    width: 10px;
    height: 10px;
    aspect-ratio: auto;
  }
}
</style>
