<template>
  <div class="perm-toggles">
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">报告</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('reports', { withFieldEdit: true })"
          :indeterminate="isModuleIndeterminate('reports', { withFieldEdit: true })"
          @change="(v) => setModuleAll('reports', v, { withFieldEdit: true })"
        >
          全选
        </el-checkbox>
      </div>
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
      <el-checkbox v-model="inner.reports.export" @change="emit">导出报告数据（备案）</el-checkbox>
      <el-checkbox v-model="inner.reports.chairmanApprove" @change="emit">最高级审批（批量判定合格）</el-checkbox>
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
      <div class="perm-block-head">
        <div class="perm-title">二维码</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('qrcodes')"
          :indeterminate="isModuleIndeterminate('qrcodes')"
          @change="(v) => setModuleAll('qrcodes', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.qrcodes.list" @change="emit">列表</el-checkbox>
      <el-checkbox v-model="inner.qrcodes.create" @change="emit">生成</el-checkbox>
      <el-checkbox v-model="inner.qrcodes.viewDetail" @change="emit">详情/下载图</el-checkbox>
      <el-checkbox v-model="inner.qrcodes.delete" @change="emit">删除</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">模板</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('templates')"
          :indeterminate="isModuleIndeterminate('templates')"
          @change="(v) => setModuleAll('templates', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.templates.use" @change="emit">使用模板/存为模板</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">公司章 / 公司信息</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isMultiModuleAllChecked(['stamps', 'company'])"
          :indeterminate="isMultiModuleIndeterminate(['stamps', 'company'])"
          @change="(v) => setMultiModuleAll(['stamps', 'company'], v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.stamps.view" @change="emit">公司章查看</el-checkbox>
      <el-checkbox v-model="inner.stamps.manage" @change="emit">公司章管理</el-checkbox>
      <el-checkbox v-model="inner.company.view" @change="emit">公司信息查看</el-checkbox>
      <el-checkbox v-model="inner.company.manage" @change="emit">公司信息管理</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">企业微信通知</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('wecom')"
          :indeterminate="isModuleIndeterminate('wecom')"
          @change="(v) => setModuleAll('wecom', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.wecom.manage" @change="emit">配置企业与模板、通知对象</el-checkbox>
      <el-checkbox v-model="inner.wecom.send" @change="emit">仅调用发送接口（自动化/对接，不含密钥配置）</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">安全审计</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('audit')"
          :indeterminate="isModuleIndeterminate('audit')"
          @change="(v) => setModuleAll('audit', v)"
        >
          全选
        </el-checkbox>
      </div>
      <div class="perm-subtitle">不可删除日志、不可修改安全策略</div>
      <el-checkbox v-model="inner.audit.viewLogin" @change="emit">登录日志查看</el-checkbox>
      <el-checkbox v-model="inner.audit.viewOperations" @change="emit">操作日志查看</el-checkbox>
      <el-checkbox v-model="inner.audit.viewErrors" @change="emit">错误日志查看</el-checkbox>
      <el-checkbox v-model="inner.audit.exportAudit" @change="emit">审计数据导出</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">销售 · 订单</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('order_management')"
          :indeterminate="isModuleIndeterminate('order_management')"
          @change="(v) => setModuleAll('order_management', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.order_management.order_input" @change="emit">录入 / Excel 导入</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_query" @change="emit">查询列表</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_query_all" @change="emit">查看全部订单（否则仅本人）</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_edit" @change="emit">修改订单</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_submit" @change="emit">提交财务审核</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_withdraw" @change="emit">撤回审核申请</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_status_finance" @change="emit">财务审核 / 完结</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_status_warehouse" @change="emit">仓库（全员订单 / 待发货视图）</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_ship" @change="emit">确认发货（待发货 → 已发货）</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_view_status_logs" @change="emit">状态与修改日志</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_cancel" @change="emit">取消订单</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_delete" @change="emit">删除订单（含批量；非财务角色仅能删本人创建的单据）</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_field_config" @change="emit">订单录入表单字段管理</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_list_unit_price" @change="emit">订单列表显示单价列</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_list_contract" @change="emit">订单列表显示合同列</el-checkbox>
      <el-checkbox v-model="inner.order_management.order_list_qc_qrcode" @change="emit">订单列表显示质检二维码列</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">销售 · 合同</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('contract_management')"
          :indeterminate="isModuleIndeterminate('contract_management')"
          @change="(v) => setModuleAll('contract_management', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.contract_management.template_manage" @change="emit">合同模板管理</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_generate" @change="emit">生成合同</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_submit" @change="emit">提交合同审核</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_review" @change="emit">合同审核</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_view" @change="emit">查看合同</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_edit" @change="emit">编辑合同（草稿/驳回；非超管仅限本人创建）</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_delete" @change="emit">删除合同（含批量；非超管仅限本人创建的草稿/驳回）</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_version_view" @change="emit">合同版本查看</el-checkbox>
      <el-checkbox v-model="inner.contract_management.contract_multi_approve" @change="emit">多人审批流程</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">销售 · 流程</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('process_management')"
          :indeterminate="isModuleIndeterminate('process_management')"
          @change="(v) => setModuleAll('process_management', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.process_management.view_flow" @change="emit">流程状态追溯</el-checkbox>
      <el-checkbox v-model="inner.process_management.edit_flow" @change="emit">配置订单审核流程</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">销售 · 数据导出</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('data_management')"
          :indeterminate="isModuleIndeterminate('data_management')"
          @change="(v) => setModuleAll('data_management', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.data_management.data_export" @change="emit">导出 Excel（权限范围内）</el-checkbox>
      <el-checkbox v-model="inner.data_management.data_export_all" @change="emit">全量导出 / 订单号前缀设置</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">销售 · 客户管理</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('customer_management')"
          :indeterminate="isModuleIndeterminate('customer_management')"
          @change="(v) => setModuleAll('customer_management', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.customer_management.view" @change="emit">查看客户列表</el-checkbox>
      <el-checkbox v-model="inner.customer_management.create" @change="emit">新增客户</el-checkbox>
      <el-checkbox v-model="inner.customer_management.edit" @change="emit">编辑客户信息</el-checkbox>
      <el-checkbox v-model="inner.customer_management.disable" @change="emit">启用/停用客户</el-checkbox>
    </div>
    <div class="perm-block">
      <div class="perm-block-head">
        <div class="perm-title">品质台账</div>
        <el-checkbox
          class="perm-select-all"
          :model-value="isModuleAllChecked('qc_yearbooks')"
          :indeterminate="isModuleIndeterminate('qc_yearbooks')"
          @change="(v) => setModuleAll('qc_yearbooks', v)"
        >
          全选
        </el-checkbox>
      </div>
      <el-checkbox v-model="inner.qc_yearbooks.view" @change="emit">查看各年份台账数据</el-checkbox>
      <el-checkbox v-model="inner.qc_yearbooks.upload" @change="emit">维护（新增年份、Excel 导入与成品检验台账）</el-checkbox>
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
    },
    moduleBoolKeys(modKey) {
      const obj = this.inner[modKey];
      if (!obj || typeof obj !== 'object') return [];
      return Object.keys(obj).filter((k) => k !== 'fieldEdit');
    },
    moduleFieldEditKeys(modKey) {
      const fe = this.inner[modKey]?.fieldEdit;
      if (!fe || typeof fe !== 'object') return [];
      return Object.keys(fe);
    },
    isModuleAllChecked(modKey, { withFieldEdit = false } = {}) {
      const boolKeys = this.moduleBoolKeys(modKey);
      if (!boolKeys.length) return false;
      const mainAll = boolKeys.every((k) => !!this.inner[modKey][k]);
      if (!withFieldEdit) return mainAll;
      const feKeys = this.moduleFieldEditKeys(modKey);
      if (!feKeys.length) return mainAll;
      return mainAll && feKeys.every((k) => !!this.inner[modKey].fieldEdit[k]);
    },
    isModuleAnyChecked(modKey, { withFieldEdit = false } = {}) {
      const boolKeys = this.moduleBoolKeys(modKey);
      if (boolKeys.some((k) => !!this.inner[modKey][k])) return true;
      if (!withFieldEdit) return false;
      const feKeys = this.moduleFieldEditKeys(modKey);
      return feKeys.some((k) => !!this.inner[modKey].fieldEdit[k]);
    },
    isModuleIndeterminate(modKey, opts = {}) {
      return this.isModuleAnyChecked(modKey, opts) && !this.isModuleAllChecked(modKey, opts);
    },
    setModuleAll(modKey, checked, { withFieldEdit = false, emitChange = true } = {}) {
      for (const k of this.moduleBoolKeys(modKey)) {
        this.inner[modKey][k] = !!checked;
      }
      if (withFieldEdit) {
        for (const k of this.moduleFieldEditKeys(modKey)) {
          this.inner[modKey].fieldEdit[k] = !!checked;
        }
      }
      if (emitChange) this.emit();
    },
    isMultiModuleAllChecked(modKeys, opts = {}) {
      return modKeys.every((m) => this.isModuleAllChecked(m, opts));
    },
    isMultiModuleIndeterminate(modKeys, opts = {}) {
      return modKeys.some((m) => this.isModuleAnyChecked(m, opts)) && !this.isMultiModuleAllChecked(modKeys, opts);
    },
    setMultiModuleAll(modKeys, checked, opts = {}) {
      for (const m of modKeys) {
        this.setModuleAll(m, checked, { ...opts, emitChange: false });
      }
      this.emit();
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
.perm-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.perm-title {
  font-weight: 600;
  color: #334155;
}
.perm-block-head .perm-title {
  margin-bottom: 0;
}
.perm-select-all :deep(.el-checkbox__label) {
  font-size: 12px;
  font-weight: normal;
  color: #64748b;
}
.perm-subtitle {
  margin-top: 4px;
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
