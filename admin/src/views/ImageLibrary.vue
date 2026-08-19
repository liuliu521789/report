<template>
  <div class="image-library-page">
    <el-card v-loading="loading" shadow="never" class="main-card">
      <template #header>
        <div class="card-head">
          <span>系统图片库</span>
          <span class="hint">
            仅超级管理员可访问本页。图片保存在服务器，与「报告样式设计器」中的系统图片库共用；设计器里选中「图片」组件后点击缩略图即可插入。
          </span>
        </div>
      </template>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="visually-hidden"
        @change="onFiles"
      />
      <div class="toolbar">
        <el-button type="primary" :loading="uploading" @click="openPicker" icon=Upload>批量上传</el-button>
        <el-button
          type="danger"
          plain
          :disabled="!selectedIds.length || deleting"
          :loading="deleting"
          @click="batchDelete"
         icon=Delete>
          批量删除（{{ selectedIds.length }}）
        </el-button>
        <el-button text type="primary" :loading="loading" @click="reload" icon=Refresh>刷新</el-button>
        <span class="meta">
          共 {{ items.length }} / {{ maxTotal }} 张 · 单次最多 {{ maxBatch }} 张 · 单张 &lt; 4MB
        </span>
      </div>
      <div v-if="items.length" class="grid">
        <div
          v-for="item in items"
          :key="item.id"
          class="cell"
          :class="{ 'is-selected': isSelected(item.id) }"
          @click="toggleSelect(item.id, $event)"
        >
          <el-checkbox
            class="cell-check"
            :model-value="isSelected(item.id)"
            :validate-event="false"
            @click.stop
            @update:model-value="(v) => onCheckChange(item.id, v)"
          />
          <img :src="item.imageUrl" class="thumb" :title="item.name" alt="" />
          <div class="name" :title="item.name">{{ item.name }}</div>
        </div>
      </div>
      <el-empty v-else description="暂无图片，点击批量上传加入图库" />
    </el-card>
  </div>
</template>

<script>
import {
  deleteReportImageLibraryBatch,
  listReportImageLibrary,
  uploadReportImageLibraryBatch
} from '../api';
import { IMAGE_LIB_MAX_BATCH, IMAGE_LIB_MAX_FILE_BYTES } from '../utils/reportImageLibrary';

export default {
  name: 'ImageLibrary',
  data() {
    return {
      items: [],
      maxTotal: 500,
      maxBatch: IMAGE_LIB_MAX_BATCH,
      selectedIds: [],
      loading: false,
      uploading: false,
      deleting: false
    };
  },
  mounted() {
    this.reload();
  },
  methods: {
    isSelected(id) {
      return this.selectedIds.some((x) => x === id);
    },
    async reload() {
      this.loading = true;
      try {
        const data = await listReportImageLibrary();
        this.items = Array.isArray(data.items) ? data.items : [];
        if (Number.isFinite(Number(data.maxTotal))) this.maxTotal = Number(data.maxTotal);
        if (Number.isFinite(Number(data.maxBatch))) this.maxBatch = Number(data.maxBatch);
        this.selectedIds = this.selectedIds.filter((id) => this.items.some((x) => x.id === id));
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
        this.items = [];
      } finally {
        this.loading = false;
      }
    },
    openPicker() {
      this.$refs.fileInput?.click();
    },
    onCheckChange(id, checked) {
      if (checked) {
        if (!this.selectedIds.includes(id)) this.selectedIds.push(id);
      } else {
        this.selectedIds = this.selectedIds.filter((x) => x !== id);
      }
    },
    toggleSelect(id, ev) {
      const t = ev?.target;
      if (t instanceof Element && t.closest('.cell-check, .el-checkbox')) return;
      const has = this.selectedIds.includes(id);
      if (has) this.selectedIds = this.selectedIds.filter((x) => x !== id);
      else this.selectedIds = [...this.selectedIds, id];
    },
    async onFiles(event) {
      const input = event.target;
      const raw = Array.from(input?.files || []);
      input.value = '';
      if (!raw.length) return;

      const files = [];
      for (const file of raw) {
        if (!file.type.startsWith('image/')) {
          this.$message.warning(`已跳过非图片：${file.name}`);
          continue;
        }
        if (file.size > IMAGE_LIB_MAX_FILE_BYTES) {
          this.$message.warning(`已跳过超过 4MB：${file.name}`);
          continue;
        }
        files.push(file);
      }
      if (!files.length) return;
      const slice = files.slice(0, this.maxBatch);
      if (files.length > slice.length) {
        this.$message.warning(`单次最多上传 ${this.maxBatch} 张，已自动截取前 ${this.maxBatch} 张`);
      }

      this.uploading = true;
      try {
        await uploadReportImageLibraryBatch(slice);
        this.$message.success(`已上传 ${slice.length} 张`);
        await this.reload();
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'LIBRARY_FULL') {
          const cur = e?.response?.data?.current;
          const max = e?.response?.data?.max;
          this.$message.warning(
            typeof cur === 'number' ? `图库已满（${cur}/${max}），请先删除部分图片` : '图库已满，请先删除部分图片'
          );
        } else {
          this.$message.error(this.$apiUserMsg(e, '上传失败'));
        }
      } finally {
        this.uploading = false;
      }
    },
    async batchDelete() {
      if (!this.selectedIds.length) return;
      try {
        await this.$confirm(`确定删除选中的 ${this.selectedIds.length} 张图片？`, '批量删除', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        });
      } catch {
        return;
      }
      this.deleting = true;
      try {
        await deleteReportImageLibraryBatch([...this.selectedIds]);
        this.$message.success('已删除');
        this.selectedIds = [];
        await this.reload();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      } finally {
        this.deleting = false;
      }
    }
  }
};
</script>

<style scoped>
.image-library-page {
  padding: 16px;
  max-width: 1100px;
}

.main-card {
  border-radius: 8px;
}

.card-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.card-head .hint {
  font-size: 12px;
  font-weight: normal;
  color: #64748b;
  line-height: 1.45;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 16px;
}

.meta {
  font-size: 12px;
  color: #94a3b8;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.cell {
  position: relative;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  padding-top: 28px;
  background: #fafafa;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.cell:hover {
  border-color: #c7d2fe;
}

.cell.is-selected {
  border-color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.35);
}

.cell-check {
  position: absolute;
  top: 6px;
  left: 8px;
  z-index: 1;
}

.thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  background: #fff;
}

.name {
  font-size: 12px;
  color: #475569;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 992px) {
  .image-library-page {
    margin: 0 -4px;
  }

  .image-library-page .main-card :deep(.el-card__body) {
    padding: 12px;
  }

  .image-library-page .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .image-library-page .toolbar .el-button {
    width: 100%;
    margin: 0;
  }

  .image-library-page .meta {
    width: 100%;
  }

  .image-library-page .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
