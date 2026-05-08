<template>
  <div class="report-templates-page">
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="q"
          class="field-q"
          clearable
          placeholder="按模板名称搜索"
          @keyup.enter="onSearch"
        />
        <el-button type="primary" @click="onSearch" icon=Search>查询</el-button>
      </div>
      <div class="toolbar-right">
        <span class="selected-tip">已选 {{ selected.length }} 条</span>
        <el-button
          type="danger"
          plain
          :disabled="selected.length === 0"
          icon=Delete
          @click="onBulkDelete"
        >
          批量删除
        </el-button>
        <el-button @click="load" icon=Refresh>刷新</el-button>
        <el-button type="success" @click="goCreateReport" icon=Plus>新建报告</el-button>
        <input
          ref="docxInput"
          type="file"
          accept=".docx"
          multiple
          class="hidden-docx-input"
          @change="onDocxInputChange"
        />
        <el-button type="warning" icon=Upload @click="pickDocxFiles">导入DOCX</el-button>
        <el-button type="primary" @click="openCreate" icon=Plus>新建模板</el-button>
      </div>
    </div>

    <div class="table-wrap">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="items"
        border
        size="small"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="模板名称" min-width="220" />
        <el-table-column prop="description" label="描述" min-width="260" />
        <el-table-column label="字段数" width="90" align="center">
          <template #default="{ row }">
            {{ Number(row.fieldCount || 0) }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ $dt(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-button link type="primary" @click="goEditReport(row)" icon=Edit>编辑报告</el-button>
            <el-button link type="danger" @click="onDelete(row)" icon=Delete>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :current-page="page"
        :page-sizes="[10, 20, 50, 100]"
        :page-size="pageSize"
        :total="total"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-dialog title="新建报告模板" v-model="dialog" width="560px">
      <el-form :model="form" label-width="110px" class="tpl-form">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" maxlength="128" show-word-limit placeholder="例如：常规产品质检报告模板" />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="form.description" maxlength="255" show-word-limit placeholder="可选" />
        </el-form-item>
        <el-form-item label="创建方式">
          <el-radio-group v-model="form.createMode">
            <el-radio label="default">默认质检模板</el-radio>
            <el-radio label="clone">克隆已有模板</el-radio>
          </el-radio-group>
          <div class="sub-hint">默认模板包含产品信息字段、检验项目表、结论与备注。</div>
        </el-form-item>
        <el-form-item v-if="form.createMode === 'clone'" label="源模板">
          <el-select
            v-model="form.cloneTemplateId"
            style="width: 100%"
            filterable
            clearable
            placeholder="请选择要克隆的模板"
          >
            <el-option v-for="tpl in cloneOptions" :key="tpl.id" :label="tpl.name" :value="tpl.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog title="导入DOCX质检单" v-model="importDialog" width="700px">
      <div v-if="importLoading" class="import-loading">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <span>正在解析DOCX文件...</span>
      </div>
      <div v-else-if="importPreview">
        <el-alert type="success" :closable="false" style="margin-bottom: 16px;">
          <template #title>
            解析成功！模板名称：<strong>{{ importPreview.name }}</strong>，识别到 <strong>{{ importPreview.fields.length }}</strong> 个字段
          </template>
        </el-alert>
        <el-descriptions :column="2" border size="small" style="margin-bottom: 16px;">
          <el-descriptions-item label="模板名称">
            <el-input v-model="importPreview.name" size="small" />
          </el-descriptions-item>
          <el-descriptions-item label="描述">
            <el-input v-model="importPreview.description" size="small" />
          </el-descriptions-item>
        </el-descriptions>
        <div class="preview-section">
          <h4>识别到的字段：</h4>
          <el-table :data="importPreview.fields" border size="small" max-height="300">
            <el-table-column prop="fieldKey" label="字段标识" width="160" />
            <el-table-column prop="fieldLabel" label="中文名称" width="140" />
            <el-table-column prop="fieldLabelEn" label="英文名称" width="140" />
            <el-table-column prop="fieldType" label="类型" width="80">
              <template #default="{ row }">
                <el-tag :type="row.fieldType === 'table' ? 'warning' : 'info'" size="small">
                  {{ row.fieldType === 'table' ? '表格' : '文本' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="预览数据" min-width="200">
              <template #default="{ row }">
                <span v-if="row.fieldType === 'table' && row.defaultValue">
                  {{ row.defaultValue.rows?.length || 0 }} 行数据
                </span>
                <span v-else-if="row.defaultValue">{{ row.defaultValue }}</span>
                <span v-else style="color: #999;">-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="importSaving" @click="confirmImport" :disabled="!importPreview">
          确认导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog title="批量导入DOCX模板" v-model="batchDialog" width="900px">
      <div v-if="batchLoading" class="import-loading">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <span>正在批量导入，请稍候（文件较多时可能需要几分钟）...</span>
      </div>
      <div v-else-if="batchResult">
        <el-alert type="info" :closable="false" style="margin-bottom: 12px;">
          <template #title>
            合计 {{ batchResult.summary?.total || 0 }} 个文件：成功 {{ batchResult.summary?.success || 0 }}，失败
            {{ batchResult.summary?.failed || 0 }}；因重名自动改名 {{ batchResult.summary?.renamed || 0 }} 个
          </template>
        </el-alert>
        <el-table :data="batchResult.items || []" border size="small" max-height="420">
          <el-table-column prop="fileName" label="文件名" min-width="240" show-overflow-tooltip />
          <el-table-column label="结果" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.ok ? 'success' : 'danger'" size="small">{{ row.ok ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="templateId" label="模板ID" width="90" align="center">
            <template #default="{ row }">{{ row.ok ? row.templateId : '-' }}</template>
          </el-table-column>
          <el-table-column prop="name" label="模板名称" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.ok">{{ row.name }}</span>
              <span v-else style="color: #909399;">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="fieldCount" label="字段数" width="90" align="center">
            <template #default="{ row }">{{ row.ok ? row.fieldCount : '-' }}</template>
          </el-table-column>
          <el-table-column label="说明" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.ok && row.renamed" style="color: #e6a23c;">已自动改名避免重名</span>
              <span v-else-if="!row.ok">{{ batchItemErrorText(row.error) }}</span>
              <span v-else style="color: #909399;">-</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button type="primary" :disabled="batchLoading" @click="batchDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  createTemplate,
  deleteTemplate,
  deleteTemplates,
  getTemplate,
  listTemplates,
  importTemplateDocx,
  importTemplateDocxBatch
} from '../api';
import { enrichApiErrorBody } from '../../../shared/apiErrorZh.js';

function defaultTemplateFields() {
  return [
    { fieldKey: 'product_name', fieldLabel: '产品名称', fieldLabelEn: 'Product Name', fieldType: 'text', sortOrder: 10 },
    { fieldKey: 'packing', fieldLabel: '包装规格', fieldLabelEn: 'Packing', fieldType: 'text', sortOrder: 20 },
    { fieldKey: 'batch_weight', fieldLabel: '本批数量', fieldLabelEn: 'Batch Weight', fieldType: 'text', sortOrder: 30 },
    { fieldKey: 'batch_no', fieldLabel: '生产批号', fieldLabelEn: 'Batch No.', fieldType: 'text', sortOrder: 40 },
    { fieldKey: 'analysis_date', fieldLabel: '检验日期', fieldLabelEn: 'Analysis Date', fieldType: 'text', sortOrder: 50 },
    { fieldKey: 'ex_mill_date', fieldLabel: '出厂日期', fieldLabelEn: 'EX-mill Date', fieldType: 'text', sortOrder: 60 },
    {
      fieldKey: 'inspection_table',
      fieldLabel: '检测项目表',
      fieldLabelEn: 'Inspection items',
      fieldType: 'table',
      sortOrder: 70,
      defaultValue: {
        columnLabels: [
          { key: 'item', zh: '检验项目', en: 'Test item' },
          { key: 'unit', zh: '单位', en: 'Unit' },
          { key: 'standard', zh: '标准值', en: 'Normal value' },
          { key: 'result', zh: '检测值', en: 'Test value' }
        ],
        rows: [
          {
            item: { zh: '外观', en: 'Appearance' },
            unit: { zh: '-', en: '-' },
            standard: { zh: '透明', en: 'Transparent' },
            result: { zh: '', en: '' },
            basis: { zh: '', en: '' }
          }
        ]
      }
    },
    { fieldKey: 'test_conclusion', fieldLabel: '检验结论', fieldLabelEn: 'Test conclusion', fieldType: 'text', sortOrder: 80 },
    { fieldKey: 'remarks', fieldLabel: '备注', fieldLabelEn: 'Remarks', fieldType: 'text', sortOrder: 90 }
  ];
}

export default {
  name: 'ReportTemplates',
  data() {
    return {
      loading: false,
      saving: false,
      dialog: false,
      q: '',
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      selected: [],
      cloneOptions: [],
      form: {
        name: '',
        description: '',
        createMode: 'default',
        cloneTemplateId: null
      },
      importDialog: false,
      importLoading: false,
      importSaving: false,
      importPreview: null,
      batchDialog: false,
      batchLoading: false,
      batchResult: null
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    goCreateReport() {
      this.$router.push('/reports/new');
    },
    goEditReport(row) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0) {
        this.$message.warning('模板ID无效');
        return;
      }
      this.$router.push(`/reports/new?templateId=${id}`);
    },
    onSelectionChange(rows) {
      this.selected = Array.isArray(rows) ? rows : [];
    },
    clearTableSelection() {
      const t = this.$refs.tableRef;
      if (t && typeof t.clearSelection === 'function') t.clearSelection();
    },
    async load() {
      this.loading = true;
      try {
        const offset = (this.page - 1) * this.pageSize;
        const res = await listTemplates({
          q: this.q || undefined,
          limit: this.pageSize,
          offset
        });
        const raw = res.items || [];
        this.total = Number(res.total != null ? res.total : raw.length);
        this.items = raw.map((it) => ({
          ...it,
          fieldCount: Array.isArray(it.fields) ? it.fields.length : Number(it.fieldCount || 0)
        }));
        const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize) || 1);
        if (this.page > maxPage) {
          this.page = maxPage;
          await this.load();
          return;
        }
        this.clearTableSelection();
      } catch (e) {
        this.items = [];
        this.total = 0;
        this.$message.error(this.$apiUserMsg(e, '加载模板失败'));
      } finally {
        this.loading = false;
      }
    },
    async onSearch() {
      this.page = 1;
      await this.load();
    },
    onPageChange(p) {
      this.page = p;
      this.load();
    },
    onSizeChange(size) {
      this.pageSize = size;
      this.page = 1;
      this.load();
    },
    resetForm() {
      this.form = {
        name: '',
        description: '',
        createMode: 'default',
        cloneTemplateId: null
      };
    },
    async openCreate() {
      this.resetForm();
      this.dialog = true;
      await this.loadCloneOptions();
    },
    async loadCloneOptions() {
      try {
        const all = [];
        let offset = 0;
        const limit = 200;
        for (;;) {
          const { items } = await listTemplates({ limit, offset });
          const chunk = items || [];
          all.push(...chunk);
          if (chunk.length < limit) break;
          offset += limit;
          if (offset > 200000) break;
        }
        this.cloneOptions = all.map((it) => ({
          ...it,
          fieldCount: Array.isArray(it.fields) ? it.fields.length : Number(it.fieldCount || 0)
        }));
      } catch (e) {
        this.cloneOptions = [];
        this.$message.warning(this.$apiUserMsg(e, '加载可克隆模板列表失败'));
      }
    },
    async buildCreateFields() {
      if (this.form.createMode !== 'clone') return defaultTemplateFields();
      const sourceId = Number(this.form.cloneTemplateId);
      if (!Number.isFinite(sourceId) || sourceId <= 0) {
        this.$message.warning('请选择要克隆的模板');
        return null;
      }
      const { template } = await getTemplate(sourceId);
      return Array.isArray(template?.fields) ? template.fields : [];
    },
    async submit() {
      const name = String(this.form.name || '').trim();
      if (!name) {
        this.$message.warning('请输入模板名称');
        return;
      }
      this.saving = true;
      try {
        const fields = await this.buildCreateFields();
        if (fields == null) return;
        await createTemplate({
          name,
          description: String(this.form.description || '').trim() || null,
          fields
        });
        this.$message.success('模板已创建');
        this.dialog = false;
        this.resetForm();
        await this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '创建模板失败'));
      } finally {
        this.saving = false;
      }
    },
    async onDelete(row) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const ok = await this.$confirm(`确认删除模板「${row.name || id}」？`, '删除模板', { type: 'warning' }).catch(() => false);
      if (!ok) return;
      try {
        await deleteTemplate(id);
        this.$message.success('模板已删除');
        await this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除模板失败'));
      }
    },
    async onBulkDelete() {
      const ids = this.selected
        .map((r) => Number(r?.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const uniq = [...new Set(ids)];
      if (!uniq.length) {
        this.$message.warning('请先勾选要删除的模板');
        return;
      }
      const ok = await this.$confirm(
        `确认批量删除已选 ${uniq.length} 个模板？删除后不可恢复。`,
        '批量删除模板',
        { type: 'warning' }
      ).catch(() => false);
      if (!ok) return;
      try {
        const res = await deleteTemplates(uniq);
        const n = Number(res?.deletedCount ?? uniq.length);
        this.$message.success(`已删除 ${n} 个模板`);
        await this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '批量删除失败'));
      }
    },
    pickDocxFiles() {
      const input = this.$refs.docxInput;
      if (!input) return;
      try {
        input.value = '';
      } catch {}
      input.click();
    },
    async onDocxInputChange(evt) {
      const input = evt?.target;
      const picked = input?.files ? Array.from(input.files) : [];
      try {
        input.value = '';
      } catch {}

      const files = picked.filter((f) => f && String(f.name || '').toLowerCase().endsWith('.docx'));
      if (!files.length) {
        this.$message.warning('请选择 .docx 格式的文件');
        return;
      }
      if (files.length > 500) {
        this.$message.warning('一次最多选择 500 个 .docx 文件，请分批导入');
        return;
      }

      // 多选：直接走服务端批量导入（单次请求，服务端逐个解析/入库）
      if (files.length > 1) {
        await this.runBatchDocxImport(files);
        return;
      }

      // 单文件：保持原来的「预览 → 确认导入」体验
      this.importDialog = true;
      this.importLoading = true;
      this.importPreview = null;
      try {
        const { template } = await importTemplateDocx(files[0]);
        this.importPreview = template;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '解析DOCX失败'));
        this.importDialog = false;
      } finally {
        this.importLoading = false;
      }
    },
    async runBatchDocxImport(files) {
      this.batchResult = null;
      this.batchDialog = true;
      this.batchLoading = true;
      try {
        const res = await importTemplateDocxBatch(files);
        this.batchResult = res?.data || null;
        const s = this.batchResult?.summary || {};
        this.$message.success(`批量导入完成：成功 ${s.success || 0}，失败 ${s.failed || 0}`);
        await this.load();
      } catch (e) {
        this.batchDialog = false;
        this.$message.error(this.$apiUserMsg(e, '批量导入失败'));
      } finally {
        this.batchLoading = false;
      }
    },
    batchItemErrorText(code) {
      const enriched = enrichApiErrorBody({ error: code });
      const msg = enriched?.message != null ? String(enriched.message).trim() : '';
      return msg || String(code || '').trim() || '失败';
    },
    async confirmImport() {
      if (!this.importPreview?.name?.trim()) {
        this.$message.warning('请输入模板名称');
        return;
      }
      this.importSaving = true;
      try {
        await createTemplate({
          name: this.importPreview.name.trim(),
          description: this.importPreview.description?.trim() || null,
          fields: this.importPreview.fields
        });
        this.$message.success('模板已导入');
        this.importDialog = false;
        this.importPreview = null;
        await this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '导入模板失败'));
      } finally {
        this.importSaving = false;
      }
    }
  }
};
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.field-q {
  width: 280px;
}
.selected-tip {
  color: #64748b;
  font-size: 13px;
  margin-right: 4px;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
}
.pagination-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.sub-hint {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
@media (max-width: 992px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-left,
  .toolbar-right,
  .field-q {
    width: 100%;
  }
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
.import-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
  color: #606266;
}
.preview-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}
.hidden-docx-input {
  display: none;
}
</style>
