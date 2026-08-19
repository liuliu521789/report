<template>

  <transition name="orders-batch-bar-fade">

    <div

      v-if="selectedCount"

      ref="barRef"

      class="orders-batch-bar"

      :style="barStyle"

    >

      <div class="orders-batch-bar__left">

        <span class="orders-batch-bar__count">{{ selectedCountLabel || `已选 ${selectedCount} 条` }}</span>

        <el-popover placement="top-start" :width="300" trigger="click">

          <template #reference>

            <el-button link type="primary" size="small">查看清单</el-button>

          </template>

          <div class="orders-batch-bar__list">

            <div v-for="r in selectedRows" :key="'sel-' + r.id" class="orders-batch-bar__item">

              {{ r.order_no || `订单 #${r.id}` }}

            </div>

          </div>

        </el-popover>

        <el-button link size="small" @click="$emit('clear-selection')">清空选择</el-button>

      </div>

      <div class="orders-batch-bar__actions">

        <SalesOrderBatchActions

          variant="bar"

          size="small"

          :plain="true"

          :selected-count="selectedCount"

          :batch-submit-button-label="batchSubmitButtonLabel"

          :batch-submit-tooltip="batchSubmitTooltip"

          :batch-submit-disabled="batchSubmitDisabled"

          :batch-submit-tip-disabled="batchSubmitTipDisabled"

          :batch-withdraw-button-label="batchWithdrawButtonLabel"

          :batch-withdraw-tooltip="batchWithdrawTooltip"

          :batch-withdraw-disabled="batchWithdrawDisabled"

          :batch-withdraw-tip-disabled="batchWithdrawTipDisabled"

          :batch-delete-button-label="batchDeleteButtonLabel"

          :batch-delete-tooltip="batchDeleteTooltip"

          :batch-delete-disabled="batchDeleteDisabled"

          :batch-delete-tip-disabled="batchDeleteTipDisabled"

          :batch-finance-count="batchFinanceCount"

          :batch-qc-count="batchQcCount"

          :batch-ship-count="batchShipCount"

          :batch-ship-visible="batchShipVisible"

          @batch-submit="$emit('batch-submit')"

          @batch-withdraw="$emit('batch-withdraw')"

          @open-finance-batch="$emit('open-finance-batch')"

          @open-qc-batch="$emit('open-qc-batch')"

          @open-ship-batch="$emit('open-ship-batch')"

          @batch-delete="$emit('batch-delete')"

          @open-contract-gen="$emit('open-contract-gen')"

        />

      </div>

    </div>

  </transition>

</template>



<script>

import SalesOrderBatchActions from './SalesOrderBatchActions.vue';



export default {

  name: 'SalesOrderBatchBar',

  components: { SalesOrderBatchActions },

  props: {

    anchorSelector: { type: String, default: '' },

    selectedCount: { type: Number, default: 0 },

    selectedCountLabel: { type: String, default: '' },

    selectedRows: { type: Array, default: () => [] },

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

    'clear-selection',

    'batch-submit',

    'batch-withdraw',

    'open-finance-batch',

    'open-qc-batch',

    'open-ship-batch',

    'batch-delete',

    'open-contract-gen'

  ],

  data() {

    return {

      barStyle: {

        left: '0px',

        width: '0px'

      },

      resizeObserver: null

    };

  },

  watch: {

    selectedCount(val) {

      if (val) {

        this.$nextTick(() => this.syncBarGeometry());

      }

    },

    anchorSelector() {

      this.$nextTick(() => this.bindAnchor());

    }

  },

  mounted() {

    this.bindAnchor();

    window.addEventListener('resize', this.syncBarGeometry, { passive: true });

    document.querySelector('.main')?.addEventListener('scroll', this.syncBarGeometry, { passive: true });

    window.addEventListener('scroll', this.syncBarGeometry, { passive: true });

  },

  beforeUnmount() {

    this.unbindAnchor();

    window.removeEventListener('resize', this.syncBarGeometry);

    document.querySelector('.main')?.removeEventListener('scroll', this.syncBarGeometry);

    window.removeEventListener('scroll', this.syncBarGeometry);

  },

  methods: {

    getAnchorEl() {

      if (!this.anchorSelector) return null;

      return document.querySelector(this.anchorSelector);

    },

    syncBarGeometry() {

      const anchor = this.getAnchorEl();

      if (!anchor || !this.selectedCount) return;

      const rect = anchor.getBoundingClientRect();

      this.barStyle = {

        left: `${Math.round(rect.left)}px`,

        width: `${Math.round(rect.width)}px`

      };

    },

    bindAnchor() {

      this.unbindAnchor();

      const anchor = this.getAnchorEl();

      if (!anchor || typeof ResizeObserver === 'undefined') {

        this.syncBarGeometry();

        return;

      }

      this.resizeObserver = new ResizeObserver(() => this.syncBarGeometry());

      this.resizeObserver.observe(anchor);

      this.syncBarGeometry();

    },

    unbindAnchor() {

      if (this.resizeObserver) {

        this.resizeObserver.disconnect();

        this.resizeObserver = null;

      }

    }

  }

};

</script>



<style scoped>

.orders-batch-bar__actions :deep(.sales-order-batch-actions) {

  display: flex;

  flex-wrap: wrap;

  align-items: center;

  gap: 8px;

}

</style>


