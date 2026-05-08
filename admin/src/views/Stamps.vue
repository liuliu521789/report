<template>
  <div class="stamps-page">
    <el-alert
      v-if="!canManageStamps"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
      title="当前为只读查看，不可新增、修改或删除印章。"
    />
    <div class="toolbar">
      <div class="toolbar-left">
        <el-button
          v-if="canManageStamps"
          type="danger"
          plain
          :icon="Delete"
          :disabled="selected.length === 0"
          @click="removeSelected"
        >
          批量删除
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-button @click="load" icon=Refresh>刷新</el-button>
        <el-button v-if="canManageStamps" type="primary" @click="openCreate" icon=Plus>新增印章</el-button>
      </div>
    </div>

    <div class="table-wrap">
      <el-table class="stamps-table desktop-table" :data="items" border size="small" row-key="id" @selection-change="selected = $event">
      <el-table-column v-if="canManageStamps" type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="sealType" label="印章类型" width="130">
        <template #default="{ row }">
          <el-tag size="small">{{ sealTypeLabel(row.sealType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column label="印章预览" width="200" align="center">
        <template #default="{ row }">
          <div class="stamp-preview-group">
            <div class="stamp-preview-item" :class="{ active: row.activeImageType === 'original' || !row.activeImageType }">
              <div class="stamp-preview-label">原图</div>
              <img
                v-if="row.imageUrl"
                :src="row.imageUrl"
                alt="original"
                class="seal-thumb"
                @click="openPreview(row.imageUrl)"
              />
              <span v-else class="muted">-</span>
            </div>
            <div class="stamp-preview-item" :class="{ active: row.activeImageType === 'svg' }">
              <div class="stamp-preview-label">SVG</div>
              <img
                v-if="row.svgImageUrl"
                :src="row.svgImageUrl"
                alt="svg"
                class="seal-thumb"
                @click="openSvgEditor(row)"
              />
              <span v-else class="muted" @click="openSvgEditor(row)" style="cursor:pointer">点击添加</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" label="激活" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.isActive" type="success">是</el-tag>
          <el-tag v-else type="info">否</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="使用" width="120" align="center">
        <template #default="{ row }">
          <el-radio-group 
            v-model="row.activeImageType" 
            size="small" 
            @change="(val) => handleSwitchImage(row, val)"
            :disabled="!row.svgImageUrl"
          >
            <el-radio-button label="original">原图</el-radio-button>
            <el-radio-button label="svg" :disabled="!row.svgImageUrl">SVG</el-radio-button>
          </el-radio-group>
        </template>
      </el-table-column>
      <el-table-column v-if="canManageStamps" label="操作" min-width="280" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openSvgEditor(row)">SVG电子章</el-button>
          <el-button link :disabled="row.isActive" @click="activate(row)">设为激活</el-button>
          <el-button link @click="openEdit(row)">修改</el-button>
          <el-button link @click="remove(row)" icon=Delete>删除</el-button>
        </template>
      </el-table-column>
      </el-table>
    </div>
    <div class="mobile-list">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <strong>{{ row.name || sealTypeLabel(row.sealType) }}</strong>
          <el-tag size="small">{{ sealTypeLabel(row.sealType) }}</el-tag>
        </div>
        <div class="mobile-line"><span>ID</span><span>{{ row.id }}</span></div>
        <div class="mobile-line"><span>激活</span><span>{{ row.isActive ? '是' : '否' }}</span></div>
        <div class="mobile-stamp-previews">
          <div class="mobile-stamp-item">
            <div class="mobile-stamp-label">原图：</div>
            <img v-if="row.imageUrl" :src="row.imageUrl" alt="seal-thumb" class="seal-thumb mobile-thumb" @click="openPreview(row.imageUrl)" />
            <span v-else class="muted">-</span>
          </div>
          <div class="mobile-stamp-item">
            <div class="mobile-stamp-label">SVG：</div>
            <img v-if="row.svgImageUrl" :src="row.svgImageUrl" alt="svg" class="seal-thumb mobile-thumb" @click="openSvgEditor(row)" />
            <span v-else class="muted" @click="openSvgEditor(row)" style="cursor:pointer">点击添加</span>
          </div>
        </div>
        <div class="mobile-line">
          <span>使用：</span>
          <el-radio-group 
            v-model="row.activeImageType" 
            size="small" 
            @change="(val) => handleSwitchImage(row, val)"
            :disabled="!row.svgImageUrl"
          >
            <el-radio-button label="original">原图</el-radio-button>
            <el-radio-button label="svg" :disabled="!row.svgImageUrl">SVG</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="canManageStamps" class="mobile-actions">
          <el-button size="small" type="primary" @click="openSvgEditor(row)">SVG电子章</el-button>
          <el-button size="small" :disabled="row.isActive" @click="activate(row)">设为激活</el-button>
          <el-button size="small" @click="openEdit(row)">修改</el-button>
          <el-button size="small" type="danger" plain @click="remove(row)" icon=Delete>删除</el-button>
        </div>
      </div>
      <el-empty v-if="!items.length" description="暂无印章" />
    </div>

    <el-dialog :title="editId ? '修改印章' : '新增印章'" v-model="dialog" width="520px">
      <el-form :model="form" label-width="90px" class="stamps-form">
        <el-form-item label="印章类型">
          <el-select v-model="form.sealType" style="width: 100%">
            <el-option label="质检章" value="department_qc" />
            <el-option label="主检章" value="inspector" />
            <el-option label="审核章" value="supervisor" />
            <el-option label="合格章" value="pass" />
            <el-option label="复检章" value="recheck" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="公司章图片">
          <el-upload
            :action="uploadAction"
            :headers="uploadHeaders"
            :show-file-list="false"
            :before-upload="beforeUpload"
            :on-success="onUploadSuccess"
            :on-error="onUploadError"
          >
            <el-button icon=Upload>选择图片并上传</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 png/jpg/webp，建议透明背景，大小 ≤ 2MB</div>
            </template>
          </el-upload>
          <div v-if="form.imageUrl" style="margin-top: 10px">
            <div class="muted" style="margin-bottom: 6px">已上传：</div>
            <el-link :href="form.imageUrl" target="_blank" class="uploaded-url">{{ form.imageUrl }}</el-link>
            <div style="margin-top: 10px">
              <img :src="form.imageUrl" alt="stamp" class="preview" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="设为激活">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">
          {{ editId ? '保存修改' : '保存' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      title="印章预览"
      v-model="previewDialog"
      width="520px"
      :close-on-click-modal="false"
    >
      <div v-if="previewImageUrl" class="preview-wrap">
        <img :src="previewImageUrl" alt="seal-preview" class="preview-image" />
      </div>
      <template #footer>
        <el-button @click="previewDialog = false" icon=Close>关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      :title="svgDialogTitle"
      v-model="svgPreviewDialog"
      width="620px"
      :close-on-click-modal="false"
    >
      <div class="svg-editor-wrap">
        <div class="svg-input-area">
          <div class="svg-input-label">请输入SVG代码：</div>
          <el-input
            v-model="svgCodeInput"
            type="textarea"
            :rows="12"
            placeholder="粘贴您的SVG代码到这里，例如：<svg viewBox='0 0 200 200'>...</svg>"
          />
          <div class="svg-input-tip">
            <el-button size="small" @click="loadExampleSvg">加载示例</el-button>
            <span>提示：可从SVG编辑器复制代码，或使用示例模板修改</span>
          </div>
        </div>
        <div class="svg-preview-area">
          <div class="svg-preview-label">实时预览：</div>
          <div class="svg-preview-box">
            <div v-if="parsedSvg" class="svg-preview-content" v-html="parsedSvg"></div>
            <div v-else class="svg-preview-empty">
              <el-icon size="48"><Picture /></el-icon>
              <p>输入SVG代码后自动预览</p>
            </div>
          </div>
          <div v-if="currentStampRow?.imageUrl" class="current-stamp-info">
            <div class="current-stamp-label">当前印章图片：</div>
            <img :src="currentStampRow.imageUrl" alt="当前印章" class="current-stamp-thumb" />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="saveSvgToStamp" type="success" icon=Check :disabled="!parsedSvg">保存SVG到印章</el-button>
        <el-button @click="downloadSvg" type="primary" icon=Download :disabled="!parsedSvg">下载SVG</el-button>
        <el-button @click="copySvgCode" icon=Document :disabled="!parsedSvg">复制代码</el-button>
        <el-button @click="svgPreviewDialog = false" icon=Close>关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { Delete, Download, Document, Picture, Check, ArrowDown } from '@element-plus/icons-vue';
import { mapState } from 'pinia';
import { activateStamp, bulkDeleteStamps, createStamp, deleteStamp, listStamps, updateStamp, switchStampImage } from '../api';
import { perm } from '../utils/permissions';
import { useAuthStore } from '../stores/auth';
import { absoluteApiOrigin } from '../utils/absoluteApiOrigin.js';

export default {
  name: 'Stamps',
  components: { Delete, Download, Document, Picture, Check, ArrowDown },
  data() {
    return {
      items: [],
      selected: [],
      dialog: false,
      saving: false,
      editId: null,
      previewDialog: false,
      previewImageUrl: '',
      svgPreviewDialog: false,
      svgCodeInput: '',
      currentStampRow: null,
      form: { sealType: 'department_qc', name: '', imageUrl: '', isActive: true }
    };
  },
  computed: {
    ...mapState(useAuthStore, ['token']),
    canManageStamps() {
      return perm('stamps', 'manage');
    },
    uploadAction() {
      return `${absoluteApiOrigin()}/api/stamps/upload`;
    },
    uploadHeaders() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    },
    parsedSvg() {
      if (!this.svgCodeInput) return '';
      const trimmed = this.svgCodeInput.trim();
      if (trimmed.startsWith('<svg') && trimmed.endsWith('</svg>')) {
        return trimmed;
      }
      return '';
    },
    svgDialogTitle() {
      if (this.currentStampRow) {
        const name = this.currentStampRow.name || this.sealTypeLabel(this.currentStampRow.sealType);
        return `SVG电子章 - ${name}`;
      }
      return 'SVG电子章';
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    openCreate() {
      this.editId = null;
      this.previewDialog = false;
      this.previewImageUrl = '';
      this.form = { sealType: 'department_qc', name: '', imageUrl: '', isActive: true };
      this.dialog = true;
    },
    openEdit(row) {
      this.editId = row?.id ?? null;
      this.previewDialog = false;
      this.previewImageUrl = '';
      this.form = {
        sealType: row.sealType,
        name: row.name,
        imageUrl: row.imageUrl,
        isActive: !!row.isActive
      };
      this.dialog = true;
    },
    async load() {
      const { items } = await listStamps();
      this.items = items;
      this.selected = [];
    },
    async submit() {
      if (this.editId) return this.update();
      return this.create();
    },
    async create() {
      this.saving = true;
      try {
        if (!this.form.sealType) {
          this.$message.warning('请选择印章类型');
          return;
        }
        if (!this.form.imageUrl) {
          this.$message.warning('请先上传印章图片');
          return;
        }
        await createStamp(this.form);
        this.$message.success('已新增');
        this.dialog = false;
        this.form = { sealType: 'department_qc', name: '', imageUrl: '', isActive: true };
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '新增失败'));
      } finally {
        this.saving = false;
      }
    },
    async update() {
      this.saving = true;
      try {
        if (!this.editId) return;
        if (!this.form.sealType) {
          this.$message.warning('请选择印章类型');
          return;
        }
        if (!this.form.imageUrl) {
          this.$message.warning('请先上传印章图片');
          return;
        }
        await updateStamp(this.editId, this.form);
        this.$message.success('已修改');
        this.dialog = false;
        this.editId = null;
        this.form = { sealType: 'department_qc', name: '', imageUrl: '', isActive: true };
        await this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '修改失败'));
      } finally {
        this.saving = false;
      }
    },
    sealTypeLabel(v) {
      const map = {
        department_qc: '质检章',
        inspector: '主检章',
        supervisor: '审核章',
        pass: '合格章',
        recheck: '复检章'
      };
      return map[v] || v || '-';
    },
    beforeUpload(file) {
      const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const okSize = file.size / 1024 / 1024 <= 2;
      if (!okType) this.$message.error('仅支持 png/jpg/webp');
      if (!okSize) this.$message.error('图片大小不能超过 2MB');
      return okType && okSize;
    },
    onUploadSuccess(res) {
      if (res && res.imageUrl) {
        this.form.imageUrl = res.imageUrl;
        this.$message.success('上传成功');
      } else {
        this.$message.error('上传返回异常');
      }
    },
    onUploadError(err) {
      const code = err?.response?.data?.error;
      this.$message.error(code || '上传失败');
    },
    async activate(row) {
      await activateStamp(row.id);
      this.$message.success('已激活');
      this.load();
    },
    async remove(row) {
      await this.$confirm('确认删除该公司章？', '提示', { type: 'warning' });
      await deleteStamp(row.id);
      this.$message.success('已删除');
      this.load();
    },
    async removeSelected() {
      const ids = (this.selected || []).map((x) => x.id).filter(Boolean);
      if (!ids.length) return;
      try {
        await this.$confirm(`确认删除选中的 ${ids.length} 个公司章？删除后不可恢复`, '批量删除', { type: 'warning' });
        await bulkDeleteStamps(ids);
        this.$message.success('批量删除完成');
        this.selected = [];
        await this.load();
      } catch (_) {
        // cancelled
      }
    },
    openPreview(imageUrl) {
      if (!imageUrl) return;
      this.previewImageUrl = imageUrl;
      this.previewDialog = true;
    },
    async openSvgEditor(row) {
      this.currentStampRow = row;
      this.svgCodeInput = '';
      this.svgPreviewDialog = true;
      
      // 如果有SVG图片，尝试加载SVG代码
      if (row.svgImageUrl) {
        try {
          const response = await fetch(row.svgImageUrl);
          if (response.ok) {
            const svgText = await response.text();
            if (svgText && svgText.trim().startsWith('<svg')) {
              this.svgCodeInput = svgText;
            }
          }
        } catch (e) {
          console.warn('加载SVG代码失败:', e);
        }
      }
    },
    loadExampleSvg() {
      const sealType = this.currentStampRow?.sealType || 'department_qc';
      const name = this.currentStampRow?.name || this.sealTypeLabel(sealType);
      
      const colorMap = {
        department_qc: '#c00',
        inspector: '#c00',
        supervisor: '#c00',
        pass: '#009900',
        recheck: '#ff9800'
      };
      const color = colorMap[sealType] || '#c00';
      
      if (sealType === 'pass') {
        this.svgCodeInput = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M100 10 L190 100 L100 190 L10 100 Z" fill="none" stroke="${color}" stroke-width="6"/>
  <text x="100" y="90" text-anchor="middle" font-size="36" fill="${color}" font-weight="bold">合格</text>
  <text x="100" y="130" text-anchor="middle" font-size="28" fill="${color}" font-weight="bold">PASSED</text>
</svg>`;
      } else {
        const subTextMap = {
          department_qc: '质量检验专用',
          inspector: '检验专用',
          supervisor: '审核专用',
          recheck: '复核专用'
        };
        const subText = subTextMap[sealType] || '';
        
        this.svgCodeInput = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="90" fill="none" stroke="${color}" stroke-width="6"/>
  <path id="topArc" d="M 30 100 A 70 70 0 0 1 170 100" fill="none"/>
  <text font-size="16" fill="${color}">
    <textPath href="#topArc" startOffset="50%" text-anchor="middle">开封物源化工有限公司</textPath>
  </text>
  <text x="100" y="108" text-anchor="middle" font-size="32" fill="${color}" font-weight="bold">${name}</text>
  <path id="bottomArc" d="M 30 100 A 70 70 0 0 0 170 100" fill="none"/>
  <text font-size="14" fill="${color}">
    <textPath href="#bottomArc" startOffset="50%" text-anchor="middle">${subText}</textPath>
  </text>
</svg>`;
      }
    },
    downloadSvg() {
      if (!this.parsedSvg) {
        this.$message.warning('请先输入有效的SVG代码');
        return;
      }
      const blob = new Blob([this.parsedSvg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `电子章_${this.currentStampRow?.name || 'seal'}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.$message.success('SVG文件已下载');
    },
    copySvgCode() {
      if (!this.parsedSvg) {
        this.$message.warning('请先输入有效的SVG代码');
        return;
      }
      navigator.clipboard.writeText(this.parsedSvg).then(() => {
        this.$message.success('SVG代码已复制到剪贴板');
      }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = this.parsedSvg;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.$message.success('SVG代码已复制到剪贴板');
      });
    },
    handleApplyCommand(command) {
      if (command === 'save') {
        this.saveSvgToStamp();
      }
    },
    async saveSvgToStamp() {
      if (!this.parsedSvg) {
        this.$message.warning('请先输入有效的SVG代码');
        return;
      }
      if (!this.currentStampRow) {
        this.$message.warning('未找到印章信息');
        return;
      }
      
      try {
        const svgBlob = new Blob([this.parsedSvg], { type: 'image/svg+xml' });
        const svgFile = new File([svgBlob], 'stamp.svg', { type: 'image/svg+xml' });
        
        const formData = new FormData();
        formData.append('file', svgFile);
        
        const response = await fetch(this.uploadAction, {
          method: 'POST',
          headers: this.uploadHeaders,
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result && result.imageUrl) {
          const updateData = {
            name: this.currentStampRow.name,
            sealType: this.currentStampRow.sealType,
            svgImageUrl: result.imageUrl,
            activeImageType: this.currentStampRow.activeImageType || 'original',
            isActive: !!this.currentStampRow.isActive
          };
          
          // 只有当原图存在时才传递
          if (this.currentStampRow.imageUrl) {
            updateData.imageUrl = this.currentStampRow.imageUrl;
          }
          
          await updateStamp(this.currentStampRow.id, updateData);
          
          this.$message.success('SVG电子章已保存');
          this.svgPreviewDialog = false;
          await this.load();
        } else {
          this.$message.error('上传失败：未返回图片地址');
        }
      } catch (e) {
        console.error('保存SVG失败:', e);
        this.$message.error('保存失败：' + (e.message || e));
      }
    },
    async handleSwitchImage(row, imageType) {
      try {
        await switchStampImage(row.id, imageType);
        this.$message.success(imageType === 'svg' ? '已切换为SVG章' : '已切换为原图');
        await this.load();
      } catch (e) {
        this.$message.error('切换失败：' + (e.message || e));
        await this.load();
      }
    }
  }
};
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  align-items: center;
  gap: 8px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
}
.desktop-table {
  min-width: 900px;
}
.mobile-list {
  display: none;
}
.mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  margin-bottom: 8px;
}
.mobile-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0;
  font-size: 13px;
  color: #475569;
}
.mobile-thumb {
  margin-top: 8px;
}
.mobile-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.muted {
  color: #666;
  font-size: 12px;
}
.preview {
  width: 140px;
  height: 140px;
  object-fit: contain;
  border: 1px dashed #ddd;
  border-radius: 8px;
  background: #fafafa;
}

.uploaded-url {
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-all;
  line-height: 1.4;
}

.stamp-preview-group {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.stamp-preview-item {
  text-align: center;
  padding: 4px;
  border: 2px solid transparent;
  border-radius: 6px;
  transition: all 0.3s;
}

.stamp-preview-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.stamp-preview-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.seal-thumb {
  width: 70px;
  height: 46px;
  object-fit: contain;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  display: block;
  margin: 0 auto;
}

.mobile-stamp-previews {
  display: flex;
  gap: 12px;
  margin: 8px 0;
}

.mobile-stamp-item {
  flex: 1;
  text-align: center;
}

.mobile-stamp-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.mobile-thumb {
  max-width: 100%;
}

.preview-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

.preview-image {
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
  border: 1px dashed #ddd;
  border-radius: 10px;
  background: #fafafa;
}

.stamps-table .el-table__cell {
  vertical-align: middle;
}

.stamps-table .el-button--text {
  padding-left: 6px;
  padding-right: 6px;
}
@media (max-width: 992px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-left,
  .toolbar-right {
    width: 100%;
  }
  .toolbar .el-button {
    flex: 1 1 calc(50% - 8px);
  }
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
  .stamps-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .stamps-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}

.svg-editor-wrap {
  display: flex;
  gap: 20px;
}

.svg-input-area {
  flex: 1;
}

.svg-input-label,
.svg-preview-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.svg-input-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.svg-preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.svg-preview-box {
  flex: 1;
  min-height: 280px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.svg-preview-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.svg-preview-content svg {
  max-width: 200px;
  max-height: 200px;
  width: 100%;
  height: auto;
}

.svg-preview-empty {
  text-align: center;
  color: #c0c4cc;
}

.svg-preview-empty p {
  margin-top: 10px;
  font-size: 13px;
}

.current-stamp-info {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.current-stamp-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.current-stamp-thumb {
  max-width: 80px;
  max-height: 80px;
  object-fit: contain;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 4px;
  background: #fff;
}

.el-dialog__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.footer-left {
  margin-right: auto;
}

@media (max-width: 768px) {
  .svg-editor-wrap {
    flex-direction: column;
  }
  
  .el-dialog__footer {
    flex-direction: column;
  }
  
  .footer-left {
    margin-right: 0;
    width: 100%;
  }
  
  .el-dialog__footer .el-button {
    width: 100%;
  }
}
</style>
