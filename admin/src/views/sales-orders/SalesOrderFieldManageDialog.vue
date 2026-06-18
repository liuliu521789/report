<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="dialogTitle"
    width="720px"
    @open="loadAll"
  >
    <el-button type="primary" size="small" class="mb8" @click="openNewField" icon="Plus">新增字段</el-button>
    <el-table :data="fieldAllList" border size="small" max-height="360">
      <el-table-column prop="field_key" label="字段键" width="120" />
      <el-table-column prop="label_zh" label="表头/标签" width="120" />
      <el-table-column prop="field_type" label="类型" width="100" />
      <el-table-column label="必填" width="72">
        <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="72" />
      <el-table-column prop="maps_to" label="业务映射" width="120" />
      <el-table-column label="启用" width="72">
        <template #default="{ row }">{{ row.is_active ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link @click="openEditField(row)" icon="Edit">编辑</el-button>
          <el-button v-if="row.is_active" link type="danger" @click="removeField(row)" icon="Delete">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Field Edit Dialog (nested) -->
    <el-dialog
      v-model="fieldEditOpen"
      :title="fieldEdit.id ? '编辑字段' : '新增字段'"
      width="480px"
      append-to-body
    >
      <el-form label-width="110px">
        <el-form-item label="字段键" required>
          <el-input v-model="fieldEdit.field_key" :disabled="!!fieldEdit.id" placeholder="小写字母开头，如 custom_a" />
        </el-form-item>
        <el-form-item label="显示名称" required>
          <el-input v-model="fieldEdit.label_zh" maxlength="128" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="fieldEdit.field_type" class="w-full">
            <el-option label="单行文本" value="text" />
            <el-option label="多行文本" value="textarea" />
            <el-option label="数字" value="number" />
            <el-option label="正数（＞0）" value="positive_number" />
            <el-option label="日期" value="date" />
          </el-select>
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="fieldEdit.required" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="fieldEdit.sort_order" :min="0" :max="9999" class="w-full" />
        </el-form-item>
        <el-form-item label="业务映射">
          <el-select v-model="fieldEdit.maps_to" clearable placeholder="可选，映射到系统列" class="w-full">
            <el-option label="（无）" :value="''" />
            <el-option v-for="m in mapsToOptions" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fieldEditOpen = false" icon="Close">取消</el-button>
        <el-button type="primary" :loading="fieldEditSaving" @click="saveFieldEdit" icon="Check">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  listSalesOrderFields,
  createSalesOrderField,
  updateSalesOrderField,
  deleteSalesOrderField,
  getSalesOrderFieldImpact
} from '../../api';

const props = defineProps({
  visible: Boolean,
  schemaVersion: { type: [Number, String], default: null }
});

const emit = defineEmits(['update:visible', 'changed']);

const fieldAllList = ref([]);
const fieldEditOpen = ref(false);
const fieldEditSaving = ref(false);
const fieldEdit = ref({
  id: null, field_key: '', label_zh: '', field_type: 'text', required: false, sort_order: 100, maps_to: ''
});
const mapsToOptions = [
  { value: 'customer_code', label: '客户编号' },
  { value: 'customer_name', label: '客户名称' },
  { value: 'product_code', label: '商品编号' },
  { value: 'product_name', label: '商品名称' },
  { value: 'product_model', label: '标签型号' },
  { value: 'warehouse_model', label: '仓库型号' },
  { value: 'quantity', label: '数量' },
  { value: 'unit_price', label: '单价' },
  { value: 'amount', label: '金额' },
  { value: 'remark', label: '备注' }
];

const dialogTitle = computed(() => {
  const sv = props.schemaVersion;
  const ver = sv != null && sv !== '' ? ` (v${sv})` : '';
  return `表单字段管理${ver}`;
});

async function loadAll() {
  try {
    const d = await listSalesOrderFields({ all: '1' });
    fieldAllList.value = d.items || [];
  } catch {
    fieldAllList.value = [];
  }
}

function openNewField() {
  fieldEdit.value = { id: null, field_key: '', label_zh: '', field_type: 'text', required: false, sort_order: 100, maps_to: '' };
  fieldEditOpen.value = true;
}

function openEditField(row) {
  fieldEdit.value = {
    id: row.id, field_key: row.field_key, label_zh: row.label_zh,
    field_type: row.field_type, required: !!row.required, sort_order: row.sort_order, maps_to: row.maps_to || ''
  };
  fieldEditOpen.value = true;
}

async function removeField(row) {
  let confirmText = '停用该字段？历史订单数据仍保留。';
  try {
    const imp = await getSalesOrderFieldImpact(row.id);
    const n = Number(imp?.order_count_with_data_json_key || 0);
    if (n > 0) {
      const fk = imp?.field_key || row.field_key || '';
      confirmText = `有 ${n} 条订单的扩展数据仍包含字段键「${fk}」。停用后新单不再使用该配置，列表以当前启用字段为准。\n\n仍要停用吗？历史订单数据仍保留。`;
    }
  } catch { /* ignore */ }
  try {
    await ElMessageBox.confirm(confirmText, '提示', { type: 'warning' });
  } catch { return; }
  try {
    await deleteSalesOrderField(row.id);
    ElMessage.success('已停用');
    await loadAll();
    emit('changed');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败');
  }
}

async function saveFieldEdit() {
  if (!fieldEdit.value.field_key?.trim() || !fieldEdit.value.label_zh?.trim()) {
    ElMessage.warning('请填写字段键与显示名称');
    return;
  }
  fieldEditSaving.value = true;
  try {
    const mapsTo = fieldEdit.value.maps_to === '' ? null : fieldEdit.value.maps_to;
    if (fieldEdit.value.id) {
      await updateSalesOrderField(fieldEdit.value.id, {
        label_zh: fieldEdit.value.label_zh, field_type: fieldEdit.value.field_type,
        required: fieldEdit.value.required, sort_order: fieldEdit.value.sort_order, maps_to: mapsTo
      });
    } else {
      await createSalesOrderField({
        field_key: fieldEdit.value.field_key.trim(), label_zh: fieldEdit.value.label_zh.trim(),
        field_type: fieldEdit.value.field_type, required: fieldEdit.value.required,
        sort_order: fieldEdit.value.sort_order, maps_to: mapsTo
      });
    }
    ElMessage.success('已保存');
    fieldEditOpen.value = false;
    await loadAll();
    emit('changed');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败');
  } finally {
    fieldEditSaving.value = false;
  }
}
</script>
