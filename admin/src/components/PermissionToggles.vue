<template>
  <div class="perm-toggles">
    <div class="perm-block">
      <div class="perm-title">报告</div>
      <el-checkbox v-model="inner.reports.list" @change="emit">列表</el-checkbox>
      <el-checkbox v-model="inner.reports.view" @change="emit">查看详情</el-checkbox>
      <el-checkbox v-model="inner.reports.create" @change="emit">新建</el-checkbox>
      <el-checkbox v-model="inner.reports.edit" @change="emit">编辑</el-checkbox>
      <el-checkbox v-model="inner.reports.void" @change="emit">作废</el-checkbox>
      <el-checkbox v-model="inner.reports.activate" @change="emit">恢复有效</el-checkbox>
      <el-checkbox v-model="inner.reports.bulkPass" @change="emit">批量判定合格</el-checkbox>
      <el-checkbox v-model="inner.reports.bulkVoid" @change="emit">批量作废</el-checkbox>
      <el-checkbox v-model="inner.reports.bulkActivate" @change="emit">批量有效</el-checkbox>
      <el-checkbox v-model="inner.reports.bulkDelete" @change="emit">批量删除</el-checkbox>
      <el-checkbox v-model="inner.reports.previewPrint" @change="emit">预览/打印</el-checkbox>
      <el-checkbox v-model="inner.reports.seals" @change="emit">盖章</el-checkbox>
      <div class="perm-subtitle">报告字段（勾选为可编辑，未勾选为只读）</div>
      <div class="perm-field-grid">
        <el-checkbox
          v-for="d in fieldDefs"
          :key="d.key"
          v-model="inner.reports.fieldEdit[d.key]"
          :disabled="!inner.reports.edit"
          @change="emit"
        >
          {{ d.labelZh }}
        </el-checkbox>
      </div>
    </div>
    <div class="perm-block">
      <div class="perm-title">二维码</div>
      <el-checkbox v-model="inner.qrcodes.list" @change="emit">列表</el-checkbox>
      <el-checkbox v-model="inner.qrcodes.create" @change="emit">生成</el-checkbox>
      <el-checkbox v-model="inner.qrcodes.viewDetail" @change="emit">详情/下载图</el-checkbox>
      <el-checkbox v-model="inner.qrcodes.delete" @change="emit">删除</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-title">模板</div>
      <el-checkbox v-model="inner.templates.use" @change="emit">使用模板/存为模板</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-title">公司章 / 公司信息</div>
      <el-checkbox v-model="inner.stamps.manage" @change="emit">公司章管理</el-checkbox>
      <el-checkbox v-model="inner.company.manage" @change="emit">公司信息管理</el-checkbox>
    </div>
  </div>
</template>

<script>
import { emptyPermissionShape, mergeIntoShape } from '../utils/permissionDefaults';
import { REPORT_FIELD_EDIT_DEFINITIONS } from '../utils/reportFieldEditDefinitions';

export default {
  name: 'PermissionToggles',
  props: {
    modelValue: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      fieldDefs: REPORT_FIELD_EDIT_DEFINITIONS,
      inner: mergeIntoShape(emptyPermissionShape(), this.modelValue)
    };
  },
  watch: {
    modelValue: {
      deep: true,
      handler(v) {
        this.inner = mergeIntoShape(emptyPermissionShape(), v);
      }
    }
  },
  methods: {
    emit() {
      this.$emit('update:modelValue', JSON.parse(JSON.stringify(this.inner)));
    }
  }
};
</script>

<style scoped>
.perm-toggles {
  font-size: 13px;
}
.perm-block {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}
.perm-block:last-child {
  border-bottom: none;
}
.perm-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #334155;
}
.perm-subtitle {
  margin-top: 12px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #64748b;
}
.perm-field-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: flex-start;
}
.perm-field-grid .el-checkbox {
  margin-right: 0;
  margin-bottom: 4px;
  min-width: 0;
}
.el-checkbox {
  display: inline-block;
  margin-right: 12px;
  margin-bottom: 6px;
}
@media (max-width: 992px) {
  .perm-toggles {
    font-size: 12px;
  }
  .perm-block {
    margin-bottom: 10px;
    padding-bottom: 8px;
  }
  .el-checkbox {
    display: block;
    margin-right: 0;
    margin-bottom: 8px;
  }
  .perm-field-grid {
    gap: 0;
  }
}
</style>
