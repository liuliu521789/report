<template>
  <div class="orders-empty-state">
    <el-empty :description="description" :image-size="72">
      <div class="orders-empty-state__actions">
        <template v-if="isFiltered">
          <el-button type="primary" plain @click="$emit('reset-filters')">清空筛选</el-button>
        </template>
        <template v-else>
          <el-button v-if="canInput" type="primary" @click="$emit('open-create')">手动录入</el-button>
          <el-button v-if="canInput" plain @click="$emit('download-template')">下载导入模板</el-button>
        </template>
      </div>
    </el-empty>
  </div>
</template>

<script>
export default {
  name: 'SalesOrderListEmpty',
  props: {
    description: { type: String, default: '暂无数据' },
    isFiltered: { type: Boolean, default: false },
    canInput: { type: Boolean, default: false }
  },
  emits: ['reset-filters', 'open-create', 'download-template']
};
</script>
