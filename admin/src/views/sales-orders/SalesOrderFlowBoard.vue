<template>
  <div
    class="order-flow-board"
    :class="{ 'order-flow-board--compact': compact }"
    v-loading="loading"
  >
    <div class="order-flow-board__header">
      <div class="order-flow-board__heading">
        <span class="order-flow-board__title">流程概况</span>
        <span v-if="!compact" class="order-flow-board__hint">{{ boardHint }}</span>
      </div>
      <div class="order-flow-board__header-actions">
        <el-checkbox
          v-if="showDateToggle"
          :model-value="respectDate"
          size="small"
          class="order-flow-board__date-toggle"
          @change="(v) => $emit('update:respectDate', v)"
        >
          统计随上方日期范围
        </el-checkbox>
        <slot name="header-actions" />
      </div>
    </div>
    <div class="order-flow-board__chips">
      <button
        type="button"
        class="flow-chip flow-chip--all"
        :class="{ 'flow-chip--active': !activeBucket }"
        @click="$emit('select', '')"
      >
        <span class="flow-chip__icon flow-chip__icon--all" aria-hidden="true">
          <el-icon><Grid /></el-icon>
        </span>
        <span class="flow-chip__label">全部</span>
        <strong class="flow-chip__count">{{ totalCount }}</strong>
      </button>
      <button
        v-for="b in buckets"
        :key="b.key"
        type="button"
        class="flow-chip"
        :class="[
          `flow-chip--${b.tone}`,
          { 'flow-chip--active': activeBucket === b.key }
        ]"
        @click="$emit('select', b.key)"
      >
        <span class="flow-chip__icon" aria-hidden="true">
          <el-icon><component :is="b.icon" /></el-icon>
        </span>
        <span class="flow-chip__label">{{ b.label }}</span>
        <span class="flow-chip__counts">
          <strong class="flow-chip__count">{{ flowSummary[b.key] ?? 0 }}</strong>
          <span
            v-if="slaOverdueCount(b.key) > 0"
            class="flow-chip__sla"
            :title="slaOverdueTitle(b.key)"
          >
            超{{ slaOverdueCount(b.key) }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<script>
import {
  Box,
  CircleClose,
  Grid,
  Promotion,
  Van,
  View,
  Wallet
} from '@element-plus/icons-vue';
import { SALES_ORDER_FLOW_BUCKETS } from '../../utils/salesStatusDisplay';

const ICON_MAP = {
  Promotion,
  Wallet,
  View,
  Box,
  Van,
  CircleClose
};

export default {
  name: 'SalesOrderFlowBoard',
  components: { Grid },
  props: {
    flowSummary: {
      type: Object,
      default: () => ({})
    },
    activeBucket: {
      type: String,
      default: ''
    },
    respectDate: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    },
    compact: {
      type: Boolean,
      default: false
    },
    showDateToggle: {
      type: Boolean,
      default: true
    },
    slaSummary: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['select', 'update:respectDate'],
  computed: {
    slaBucketKeyMap() {
      return {
        pending_finance: 'overdue_finance',
        pending_qc: 'overdue_qc',
        pending_ship: 'overdue_ship',
        shipped_open: 'overdue_complete'
      };
    },
    slaThresholdHours() {
      return this.slaSummary?.thresholds_hours || {};
    },
    totalSlaOverdue() {
      const s = this.slaSummary || {};
      return (
        (Number(s.overdue_finance) || 0) +
        (Number(s.overdue_qc) || 0) +
        (Number(s.overdue_ship) || 0) +
        (Number(s.overdue_complete) || 0)
      );
    },
    boardHint() {
      if (this.totalSlaOverdue > 0) {
        return `点击卡片筛选；共 ${this.totalSlaOverdue} 笔超过 SLA 阈值`;
      }
      return '点击卡片筛选对应阶段';
    },
    buckets() {
      return SALES_ORDER_FLOW_BUCKETS.map((b) => ({
        ...b,
        icon: ICON_MAP[b.icon] || Promotion
      }));
    },
    totalCount() {
      return this.buckets.reduce(
        (sum, b) => sum + (Number(this.flowSummary[b.key]) || 0),
        0
      );
    }
  },
  methods: {
    slaOverdueCount(bucketKey) {
      const slaKey = this.slaBucketKeyMap[bucketKey];
      if (!slaKey) return 0;
      return Number(this.slaSummary?.[slaKey]) || 0;
    },
    slaOverdueTitle(bucketKey) {
      const count = this.slaOverdueCount(bucketKey);
      if (!count) return '';
      const hoursMap = {
        pending_finance: this.slaThresholdHours.finance,
        pending_qc: this.slaThresholdHours.qc,
        pending_ship: this.slaThresholdHours.ship,
        shipped_open: this.slaThresholdHours.complete
      };
      const h = hoursMap[bucketKey];
      const threshold = Number.isFinite(Number(h)) ? `${h} 小时` : '设定时长';
      return `${count} 笔在该阶段停留超过 ${threshold}`;
    }
  }
};
</script>

<style scoped>
.order-flow-board {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.order-flow-board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.order-flow-board__heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.order-flow-board__title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  letter-spacing: 0.02em;
}

.order-flow-board__hint {
  font-size: 12px;
  color: #94a3b8;
}

.order-flow-board__header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
}

.order-flow-board__date-toggle {
  --el-checkbox-font-size: 12px;
  color: #64748b;
}

.order-flow-board__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.flow-chip {
  display: flex;
  flex: 1 1 120px;
  min-width: 108px;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--flow-chip-border, #e2e8f0);
  border-radius: 10px;
  background: var(--flow-chip-bg, #f8fafc);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
  font: inherit;
  color: inherit;
}

.flow-chip:hover {
  border-color: var(--flow-chip-accent, #64748b);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.flow-chip:focus-visible {
  outline: 2px solid var(--flow-chip-accent, #64748b);
  outline-offset: 2px;
}

.flow-chip--active {
  border-color: var(--flow-chip-accent, #64748b);
  background: var(--flow-chip-bg-active, #e2e8f0);
  box-shadow:
    0 0 0 1px var(--flow-chip-accent, #64748b),
    0 2px 10px rgba(15, 23, 42, 0.08);
}

.flow-chip__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex-shrink: 0;
  color: var(--flow-chip-accent, #64748b);
  background: color-mix(in srgb, var(--flow-chip-accent, #64748b) 12%, white);
  font-size: 14px;
}

.flow-chip__icon--all {
  color: #475569;
  background: #e2e8f0;
}

.flow-chip__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.flow-chip--active .flow-chip__label {
  color: #334155;
  font-weight: 500;
}

.flow-chip__counts {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.flow-chip__count {
  flex-shrink: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  color: var(--flow-chip-accent, #334155);
  font-variant-numeric: tabular-nums;
}

.flow-chip__sla {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 999px;
  color: #b91c1c;
  background: #fee2e2;
  border: 1px solid #fecaca;
  font-variant-numeric: tabular-nums;
}

.flow-chip--active .flow-chip__sla {
  color: #991b1b;
  background: #fecaca;
}

.flow-chip--all {
  --flow-chip-accent: #475569;
  --flow-chip-bg: #f8fafc;
  --flow-chip-border: #e2e8f0;
  --flow-chip-bg-active: #e2e8f0;
}

.flow-chip--slate {
  --flow-chip-accent: #64748b;
  --flow-chip-bg: #f8fafc;
  --flow-chip-border: #e2e8f0;
  --flow-chip-bg-active: #e2e8f0;
}

.flow-chip--amber {
  --flow-chip-accent: #d97706;
  --flow-chip-bg: #fffbeb;
  --flow-chip-border: #fde68a;
  --flow-chip-bg-active: #fef3c7;
}

.flow-chip--orange {
  --flow-chip-accent: #ea580c;
  --flow-chip-bg: #fff7ed;
  --flow-chip-border: #fed7aa;
  --flow-chip-bg-active: #ffedd5;
}

.flow-chip--emerald {
  --flow-chip-accent: #059669;
  --flow-chip-bg: #ecfdf5;
  --flow-chip-border: #a7f3d0;
  --flow-chip-bg-active: #d1fae5;
}

.flow-chip--sky {
  --flow-chip-accent: #0284c7;
  --flow-chip-bg: #f0f9ff;
  --flow-chip-border: #bae6fd;
  --flow-chip-bg-active: #e0f2fe;
}

.flow-chip--rose {
  --flow-chip-accent: #e11d48;
  --flow-chip-bg: #fff1f2;
  --flow-chip-border: #fecdd3;
  --flow-chip-bg-active: #ffe4e6;
}

.order-flow-board--compact .order-flow-board__header {
  margin-bottom: 2px;
}

.order-flow-board--compact .order-flow-board__title {
  font-size: 12px;
}

.order-flow-board--compact .flow-chip {
  padding: 7px 6px;
  border-radius: 8px;
  gap: 4px;
}

.order-flow-board--compact .flow-chip__icon {
  width: 22px;
  height: 22px;
  font-size: 12px;
  border-radius: 6px;
}

.order-flow-board--compact .flow-chip__label {
  font-size: 11px;
}

.order-flow-board--compact .flow-chip__count {
  font-size: 14px;
}

@media (max-width: 992px) {
  .order-flow-board__chips {
    gap: 6px;
  }

  .flow-chip {
    padding: 7px 6px;
    gap: 4px;
  }

  .flow-chip__icon {
    width: 22px;
    height: 22px;
    font-size: 12px;
  }

  .flow-chip__label {
    font-size: 11px;
  }

  .flow-chip__count {
    font-size: 14px;
  }
}
</style>
