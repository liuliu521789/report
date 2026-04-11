<template>
  <div class="sales-status-wrap" :class="wrapModifierClass">
    <el-button
      class="sales-status-pill"
      :class="pillModifierClass"
      :type="meta.type"
      size="small"
      plain
      tabindex="-1"
      @click.prevent.stop
    >
      <el-icon class="sales-status-pill__icon">
        <component :is="meta.icon" />
      </el-icon>
      <span class="sales-status-pill__text">{{ meta.label }}</span>
    </el-button>
    <div v-if="meta.rejectReason" class="sales-status-reason">
      <span class="sales-status-reason__label">驳回原因：</span>
      <span class="sales-status-reason__text">{{ meta.rejectReason }}</span>
    </div>
  </div>
</template>

<script>
import { orderStatusDisplay, contractStatusDisplay } from '../utils/salesStatusDisplay';

export default {
  name: 'SalesStatusPill',
  props: {
    /** `order`: use `orderRow`; `contract`: use `status` string */
    kind: {
      type: String,
      required: true,
      validator: (v) => v === 'order' || v === 'contract'
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
    }
  },
  computed: {
    meta() {
      if (this.kind === 'order') return orderStatusDisplay(this.orderRow || {});
      return contractStatusDisplay(this.status, this.rejectReason);
    },
    wrapModifierClass() {
      if (this.kind === 'contract') return 'sales-status-wrap--contract';
      return '';
    },
    pillModifierClass() {
      if (this.kind !== 'contract') return '';
      const s = (this.status || 'draft').replace(/[^a-z0-9_]/gi, '');
      return `sales-status-pill--contract sales-status-pill--c-${s || 'draft'}`;
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

.sales-status-pill__icon {
  margin-right: 4px;
  vertical-align: middle;
}

.sales-status-pill__text {
  vertical-align: middle;
}

.sales-status-reason {
  width: 100%;
  max-width: 220px;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1.4;
  color: #b91c1c;
  background: #fef2f2;
  border-radius: 6px;
  border: 1px solid #fecaca;
  text-align: left;
  word-break: break-word;
}

.sales-status-reason__label {
  font-weight: 600;
  color: #991b1b;
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

.sales-status-wrap--contract .sales-status-reason {
  max-width: 260px;
  border-radius: 8px;
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: #ef4444;
  background: linear-gradient(90deg, #fff5f5 0%, #fef2f2 100%);
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
