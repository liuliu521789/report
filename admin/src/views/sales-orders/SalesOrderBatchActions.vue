<template>
  <div class="sales-order-batch-actions" :class="{ 'sales-order-batch-actions--bar': variant === 'bar' }">
    <el-tooltip placement="top" :disabled="batchSubmitTipDisabled" :content="batchSubmitTooltip">
      <span class="batch-del-tooltip-host">
        <el-button
          v-if="perm('order_management', 'order_submit')"
          type="primary"
          :size="size"
          :plain="plain"
          :disabled="batchSubmitDisabled"
          :icon="variant === 'toolbar' ? Check : undefined"
          @click="$emit('batch-submit')"
        >
          {{ batchSubmitButtonLabel }}
        </el-button>
      </span>
    </el-tooltip>
    <el-tooltip placement="top" :disabled="batchWithdrawTipDisabled" :content="batchWithdrawTooltip">
      <span class="batch-del-tooltip-host">
        <el-button
          v-if="perm('order_management', 'order_withdraw')"
          type="warning"
          :size="size"
          :plain="plain"
          :disabled="batchWithdrawDisabled"
          @click="$emit('batch-withdraw')"
        >
          {{ batchWithdrawButtonLabel }}
        </el-button>
      </span>
    </el-tooltip>
    <el-button
      v-if="perm('order_management', 'order_status_finance')"
      type="warning"
      :size="size"
      :plain="plain"
      :disabled="batchFinanceCount === 0"
      @click="$emit('open-finance-batch')"
    >
      {{ variant === 'bar' ? '批量审核' : '批量审核' }}
    </el-button>
    <el-button
      v-if="perm('order_management', 'order_status_qc')"
      type="warning"
      :size="size"
      :plain="plain"
      :disabled="batchQcCount === 0"
      @click="$emit('open-qc-batch')"
    >
      {{ variant === 'bar' ? '批量品管' : '批量品管审核' }}
    </el-button>
    <el-button
      v-if="batchShipVisible"
      type="primary"
      :size="size"
      :plain="plain"
      :disabled="batchShipCount === 0"
      @click="$emit('open-ship-batch')"
    >
      批量发货
    </el-button>
    <el-tooltip placement="top" :disabled="batchDeleteTipDisabled" :content="batchDeleteTooltip">
      <span class="batch-del-tooltip-host">
        <el-button
          v-if="perm('order_management', 'order_delete')"
          type="danger"
          :size="size"
          :plain="plain"
          :disabled="batchDeleteDisabled"
          :icon="variant === 'toolbar' ? Delete : undefined"
          @click="$emit('batch-delete')"
        >
          {{ batchDeleteButtonLabel }}
        </el-button>
      </span>
    </el-tooltip>
    <el-button
      v-if="perm('contract_management', 'contract_generate')"
      type="success"
      :size="size"
      :plain="variant === 'bar' ? true : false"
      :disabled="selectedCount === 0"
      @click="$emit('open-contract-gen')"
    >
      生成合同
    </el-button>
  </div>
</template>

<script>
import { Check, Delete } from '@element-plus/icons-vue';
import { perm } from '../../utils/permissions';

export default {
  name: 'SalesOrderBatchActions',
  props: {
    variant: { type: String, default: 'toolbar' },
    size: { type: String, default: 'default' },
    plain: { type: Boolean, default: true },
    selectedCount: { type: Number, default: 0 },
    batchSubmitButtonLabel: { type: String, default: '' },
    batchSubmitTooltip: { type: String, default: '' },
    batchSubmitDisabled: { type: Boolean, default: true },
    batchSubmitTipDisabled: { type: Boolean, default: true },
    batchWithdrawButtonLabel: { type: String, default: '' },
    batchWithdrawTooltip: { type: String, default: '' },
    batchWithdrawDisabled: { type: Boolean, default: true },
    batchWithdrawTipDisabled: { type: Boolean, default: true },
    batchDeleteButtonLabel: { type: String, default: '' },
    batchDeleteTooltip: { type: String, default: '' },
    batchDeleteDisabled: { type: Boolean, default: true },
    batchDeleteTipDisabled: { type: Boolean, default: true },
    batchFinanceCount: { type: Number, default: 0 },
    batchQcCount: { type: Number, default: 0 },
    batchShipCount: { type: Number, default: 0 },
    batchShipVisible: { type: Boolean, default: false }
  },
  emits: [
    'batch-submit',
    'batch-withdraw',
    'open-finance-batch',
    'open-qc-batch',
    'open-ship-batch',
    'batch-delete',
    'open-contract-gen'
  ],
  setup() {
    return { Check, Delete, perm };
  }
};
</script>
