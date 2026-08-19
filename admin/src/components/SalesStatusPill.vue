<template>
  <el-tooltip
    placement="top"
    :show-after="280"
    :disabled="!tooltipEnabled"
    popper-class="sales-status-tip-popper"
  >
    <template #content>
      <div class="sales-status-tip">
        <div class="sales-status-tip__row">
          <span class="sales-status-tip__k">审核状态</span>
          <span class="sales-status-tip__v">{{ meta.label }}</span>
        </div>
        <div v-if="meta.rejectReason" class="sales-status-tip__row sales-status-tip__row--reject">
          <span class="sales-status-tip__k">驳回原因</span>
          <span class="sales-status-tip__v">{{ meta.rejectReason }}</span>
        </div>
        <div v-if="meta.shipperName" class="sales-status-tip__row">
          <span class="sales-status-tip__k">发货人</span>
          <span class="sales-status-tip__v">{{ meta.shipperName }}</span>
        </div>
        <div v-if="clickable" class="sales-status-tip__hint">点击查看审批记录</div>
      </div>
    </template>
    <div
      class="sales-status-wrap"
      :class="[
        wrapModifierClass,
        clickable ? 'sales-status-wrap--clickable' : '',
        hasRejectBlock ? 'sales-status-wrap--rejected' : ''
      ]"
    >
      <!-- 驳回：状态 + 原因合并为一块 -->
      <button
        v-if="hasRejectBlock"
        type="button"
        class="sales-status-reject"
        :class="rejectBlockClass"
        :tabindex="clickable ? 0 : -1"
        @click="onPillClick"
      >
        <div class="sales-status-reject__head">
          <el-icon class="sales-status-reject__icon">
            <component :is="meta.icon" />
          </el-icon>
          <span class="sales-status-reject__label">{{ meta.label }}</span>
        </div>
        <div class="sales-status-reject__reason">
          {{ meta.rejectReason }}
        </div>
      </button>

      <template v-else>
        <el-button
          class="sales-status-pill"
          :class="pillModifierClass"
          :type="meta.type"
          size="small"
          plain
          :tabindex="clickable ? 0 : -1"
          @click="onPillClick"
        >
          <el-icon class="sales-status-pill__icon">
            <component :is="meta.icon" />
          </el-icon>
          <span class="sales-status-pill__text">{{ meta.label }}</span>
        </el-button>
        <div v-if="meta.shipperName" class="sales-status-meta">
          {{ meta.shipperName }}
        </div>
      </template>
    </div>
  </el-tooltip>
</template>

<script>
import { orderStatusDisplay, contractStatusDisplay, invoiceStatusDisplay } from '../utils/salesStatusDisplay';

export default {
  name: 'SalesStatusPill',
  props: {
    /** `order` | `contract` | `invoice` */
    kind: {
      type: String,
      required: true,
      validator: (v) => v === 'order' || v === 'contract' || v === 'invoice'
    },
    orderRow: {
      type: Object,
      default: null
    },
    status: {
      type: String,
      default: ''
    },
    /** 合同驳回：`last_reject_comment` 或详情中解析的审核意见 */
    rejectReason: {
      type: String,
      default: ''
    },
    /** 为 true 时可点击（例如打开审批流程），并向父组件抛出 click */
    clickable: {
      type: Boolean,
      default: false
    }
  },
  emits: ['click'],
  computed: {
    meta() {
      if (this.kind === 'order') return orderStatusDisplay(this.orderRow || {});
      if (this.kind === 'invoice') return invoiceStatusDisplay(this.status);
      return contractStatusDisplay(this.status, this.rejectReason);
    },
    hasRejectBlock() {
      return !!String(this.meta.rejectReason || '').trim();
    },
    tooltipEnabled() {
      return !!String(this.meta.label || '').trim();
    },
    wrapModifierClass() {
      if (this.kind === 'order') return 'sales-status-wrap--order';
      if (this.kind === 'contract' || this.kind === 'invoice') return 'sales-status-wrap--contract';
      return '';
    },
    pillModifierClass() {
      if (this.kind === 'order') {
        const phase = String(this.meta.phase || 'unknown').replace(/[^a-z0-9_]/gi, '') || 'unknown';
        const tone = String(this.meta.tone || 'muted').replace(/[^a-z0-9_]/gi, '') || 'muted';
        return `sales-status-pill--order sales-status-pill--o-${phase} sales-status-pill--t-${tone}`;
      }
      if (this.kind !== 'contract' && this.kind !== 'invoice') return '';
      const s = (this.status || 'draft').replace(/[^a-z0-9_]/gi, '');
      return `sales-status-pill--contract sales-status-pill--c-${s || 'draft'}`;
    },
    rejectBlockClass() {
      if (this.kind === 'order') {
        const phase = String(this.meta.phase || 'unknown').replace(/[^a-z0-9_]/gi, '') || 'unknown';
        return `sales-status-reject--order sales-status-reject--${phase}`;
      }
      return 'sales-status-reject--contract';
    }
  },
  methods: {
    onPillClick(e) {
      if (this.clickable) {
        this.$emit('click', e);
        return;
      }
      e?.preventDefault?.();
      e?.stopPropagation?.();
    }
  }
};
</script>

<style scoped>
.sales-status-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}

.sales-status-pill {
  pointer-events: none;
  cursor: default;
  max-width: 100%;
}

.sales-status-wrap--clickable .sales-status-pill,
.sales-status-wrap--clickable .sales-status-reject {
  pointer-events: auto;
  cursor: pointer;
}

.sales-status-wrap--clickable .sales-status-pill:focus-visible,
.sales-status-wrap--clickable .sales-status-reject:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 2px;
}

.sales-status-pill__icon {
  margin-right: 4px;
  vertical-align: middle;
}

.sales-status-pill__text {
  vertical-align: middle;
}

.sales-status-meta {
  max-width: 100%;
  padding: 0 2px;
  font-size: 10px;
  line-height: 1.2;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 驳回状态 + 原因：同一玫红卡片 */
.sales-status-reject {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: 100%;
  max-width: 220px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(244, 63, 94, 0.42);
  border-radius: 10px;
  background: linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%);
  color: #be123c;
  box-shadow: none;
  text-align: left;
  overflow: hidden;
  pointer-events: none;
  cursor: default;
  font: inherit;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    filter 0.15s ease;
}

.sales-status-wrap--clickable .sales-status-reject:hover {
  transform: translateY(-1px);
  filter: brightness(0.99);
  box-shadow: 0 2px 8px rgba(190, 18, 60, 0.12);
}

.sales-status-reject__head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px 3px;
  font-weight: 650;
  font-size: 12px;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.sales-status-reject__icon {
  flex-shrink: 0;
  font-size: 13px;
}

.sales-status-reject__label {
  white-space: nowrap;
}

.sales-status-reject__reason {
  padding: 4px 8px 5px;
  border-top: 1px dashed rgba(244, 63, 94, 0.28);
  background: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  color: #9f1239;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

.sales-status-wrap--order .sales-status-reject {
  max-width: 132px;
  border-radius: 8px;
}

.sales-status-wrap--order .sales-status-reject__head {
  padding: 3px 6px 2px;
  font-size: 11px;
}

.sales-status-wrap--order .sales-status-reject__icon {
  font-size: 12px;
}

.sales-status-wrap--order .sales-status-reject__reason {
  padding: 3px 6px 4px;
  font-size: 10px;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.sales-status-wrap--contract .sales-status-reject {
  max-width: 260px;
  border-radius: 10px;
}

/* 订单流程：阶段色块，便于列表扫读 */
.sales-status-wrap--order .sales-status-pill {
  border-radius: 999px;
  padding: 3px 10px 3px 8px;
  height: auto;
  min-height: 24px;
  font-weight: 600;
  font-size: 12px;
  line-height: 1.2;
  border-width: 1px;
  letter-spacing: 0.01em;
  box-shadow: none;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    filter 0.15s ease;
}

.sales-status-wrap--order.sales-status-wrap--clickable .sales-status-pill:hover {
  transform: translateY(-1px);
  filter: brightness(0.98);
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
}

.sales-status-wrap--order .sales-status-pill__icon {
  margin-right: 4px;
  font-size: 13px;
}

.sales-status-wrap--order .sales-status-pill__text {
  white-space: nowrap;
}

.sales-status-pill--t-slate {
  --ssp-fg: #475569;
  --ssp-bd: rgba(100, 116, 139, 0.42);
  --ssp-bg0: #f8fafc;
  --ssp-bg1: #f1f5f9;
}

.sales-status-pill--t-muted {
  --ssp-fg: #64748b;
  --ssp-bd: rgba(148, 163, 184, 0.45);
  --ssp-bg0: #f8fafc;
  --ssp-bg1: #eef2f7;
}

.sales-status-pill--t-amber {
  --ssp-fg: #b45309;
  --ssp-bd: rgba(245, 158, 11, 0.5);
  --ssp-bg0: #fffbeb;
  --ssp-bg1: #fef3c7;
}

.sales-status-pill--t-orange {
  --ssp-fg: #c2410c;
  --ssp-bd: rgba(249, 115, 22, 0.48);
  --ssp-bg0: #fff7ed;
  --ssp-bg1: #ffedd5;
}

.sales-status-pill--t-rose {
  --ssp-fg: #be123c;
  --ssp-bd: rgba(244, 63, 94, 0.5);
  --ssp-bg0: #fff1f2;
  --ssp-bg1: #ffe4e6;
}

.sales-status-pill--t-emerald {
  --ssp-fg: #047857;
  --ssp-bd: rgba(16, 185, 129, 0.45);
  --ssp-bg0: #ecfdf5;
  --ssp-bg1: #d1fae5;
}

.sales-status-pill--t-sky {
  --ssp-fg: #0369a1;
  --ssp-bd: rgba(14, 165, 233, 0.48);
  --ssp-bg0: #f0f9ff;
  --ssp-bg1: #e0f2fe;
}

.sales-status-pill--t-green {
  --ssp-fg: #15803d;
  --ssp-bd: rgba(34, 197, 94, 0.45);
  --ssp-bg0: #f0fdf4;
  --ssp-bg1: #dcfce7;
}

.sales-status-pill--order.sales-status-pill--t-slate,
.sales-status-pill--order.sales-status-pill--t-muted,
.sales-status-pill--order.sales-status-pill--t-amber,
.sales-status-pill--order.sales-status-pill--t-orange,
.sales-status-pill--order.sales-status-pill--t-rose,
.sales-status-pill--order.sales-status-pill--t-emerald,
.sales-status-pill--order.sales-status-pill--t-sky,
.sales-status-pill--order.sales-status-pill--t-green {
  color: var(--ssp-fg) !important;
  border-color: var(--ssp-bd) !important;
  background: linear-gradient(180deg, var(--ssp-bg0) 0%, var(--ssp-bg1) 100%) !important;
}

.sales-status-pill--o-pending_finance :deep(.sales-status-pill__icon),
.sales-status-pill--o-pending_qc :deep(.sales-status-pill__icon) {
  animation: sales-order-pending-pulse 2.2s ease-in-out infinite;
}

@keyframes sales-order-pending-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.78;
    transform: scale(0.92);
  }
}

/* 合同审核：更清晰的阶段感 */
.sales-status-wrap--contract .sales-status-pill {
  border-radius: 999px;
  padding: 5px 14px 5px 12px;
  font-weight: 600;
  font-size: 12px;
  line-height: 1.2;
  border-width: 1px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  transition: box-shadow 0.15s ease;
}

.sales-status-wrap--contract .sales-status-pill__icon {
  margin-right: 5px;
  font-size: 14px;
}

.sales-status-pill--c-pending_review :deep(.sales-status-pill__icon) {
  animation: sales-contract-pending-glow 2.2s ease-in-out infinite;
}

@keyframes sales-contract-pending-glow {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.88;
    transform: scale(0.94);
  }
}

.sales-status-pill--c-approved {
  border-color: rgba(34, 197, 94, 0.45) !important;
  background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%) !important;
}

.sales-status-pill--c-rejected {
  border-color: rgba(239, 68, 68, 0.5) !important;
  background: linear-gradient(180deg, #fff1f2 0%, #fef2f2 100%) !important;
}

.sales-status-pill--c-draft {
  border-color: rgba(100, 116, 139, 0.45) !important;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%) !important;
}

.sales-status-pill--c-pending_review {
  border-color: rgba(245, 158, 11, 0.55) !important;
  background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%) !important;
}
</style>

<style>
/* tooltip 挂到 body，需非 scoped */
.sales-status-tip-popper .sales-status-tip {
  max-width: 280px;
  line-height: 1.45;
}
.sales-status-tip-popper .sales-status-tip__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.sales-status-tip-popper .sales-status-tip__row + .sales-status-tip__row {
  margin-top: 4px;
}
.sales-status-tip-popper .sales-status-tip__k {
  flex-shrink: 0;
  opacity: 0.78;
}
.sales-status-tip-popper .sales-status-tip__k::after {
  content: '：';
}
.sales-status-tip-popper .sales-status-tip__v {
  word-break: break-word;
}
.sales-status-tip-popper .sales-status-tip__row--reject .sales-status-tip__v {
  color: #fecdd3;
}
.sales-status-tip-popper .sales-status-tip__hint {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 12px;
  opacity: 0.72;
}
</style>
