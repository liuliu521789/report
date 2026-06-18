<template>
  <div class="designer-page">
    <div class="designer-toolbar">
      <div class="toolbar-left">
        <el-button @click="goBack" icon=Back>返回</el-button>
        <span class="page-title">报告样式设计器</span>
        <el-tag v-if="dirty" type="warning" size="small" effect="plain">有未保存修改</el-tag>
      </div>
      <div class="toolbar-right">
        <el-tooltip content="Delete 删除选中 · Esc 取消选中" placement="bottom">
          <el-button text class="shortcut-hint" icon=QuestionFilled>快捷键</el-button>
        </el-tooltip>
        <el-button @click="openStyleManager" icon=FolderOpened>样式库</el-button>
        <el-dropdown split-button type="primary" @click="openSaveStyleDialog" @command="onSaveCommand">
          保存到服务器
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="local">保存草稿到浏览器</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button @click="clearCanvas" icon=Delete>清空画布</el-button>
      </div>
    </div>

    <el-alert
      v-if="showGuide"
      type="info"
      show-icon
      closable
      class="designer-guide"
      @close="dismissGuide"
    >
      <template #title>
        拖拽组件排版 A4 画布，完成后「保存到服务器」供新建报告套用；「保存草稿到浏览器」仅本机临时备份。
      </template>
    </el-alert>

    <div class="designer-main">
      <aside class="toolbox">
        <el-tabs v-model="sidebarTab" class="toolbox-tabs">
          <el-tab-pane label="组件" name="components">
            <div class="component-grid">
              <button
                v-for="item in componentCatalog"
                :key="item.type"
                type="button"
                class="component-card"
                @click="addElement(item.type)"
              >
                <el-icon :size="18"><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </div>
            <ul class="tips-list">
              <li>点击上方卡片向画布添加元素</li>
              <li>拖拽元素调整位置，靠近边缘或彼此对齐时出现辅助线</li>
              <li>选中元素后在「属性」页调整字体、表格等</li>
            </ul>

            <div v-if="isSuperAdminUser" class="image-lib-panel">
          <div class="toolbox-title">系统图片库</div>
          <input
            ref="imageLibFileInput"
            type="file"
            accept="image/*"
            multiple
            class="visually-hidden"
            @change="onImageLibraryFile"
          />
          <el-button class="tool-btn" size="small" type="primary" plain @click="openImageLibraryPicker" icon=Upload>
            批量上传到库
          </el-button>
          <div v-if="imageLibrary.length" class="image-lib-grid">
            <div v-for="item in imageLibrary" :key="item.id" class="lib-thumb-wrap">
              <img
                :src="item.imageUrl"
                class="lib-thumb"
                :title="item.name"
                alt=""
                @click="applyLibraryImageToSelected(item)"
              />
              <button type="button" class="lib-remove" title="从库中删除" @click.stop="removeLibraryImage(item.id)">
                ×
              </button>
            </div>
          </div>
          <div v-else class="tips">暂无图片，上传后可点击缩略图赋给选中的「图片」组件</div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="属性" name="properties">
            <div v-if="!selectedElement" class="properties-empty">
              <el-empty description="请先在画布上选中一个组件" :image-size="72" />
            </div>
            <template v-else>
              <div class="selected-type-badge">{{ elementTypeLabel(selectedElement.type) }}</div>

              <div v-if="selectedElement.type === 'underline'" class="typography-panel">
                <div class="typography-title">下划线宽度</div>
                <div class="underline-width-row">
                  <el-button size="small" @click="bumpUnderlineWidth(-40)">变短</el-button>
                  <el-input-number
                    v-model="selectedElement.w"
                    :min="40"
                    :max="underlineMaxW"
                    size="small"
                    controls-position="right"
                    class="underline-width-num"
                    @change="commitUnderlineWidth"
                  />
                  <el-button size="small" @click="bumpUnderlineWidth(40)">变长</el-button>
                </div>
                <div class="tips">也可直接修改中间数字（像素）</div>
              </div>

              <div v-if="selectedElement.type === 'image'" class="typography-panel">
                <div class="typography-title">图片组件</div>
                <div v-if="isSuperAdminUser" class="tips">
                  在「组件」页系统图片库点击缩略图替换；拖拽右下角手柄等比例缩放。
                </div>
                <div v-else class="tips">配图由超级管理员维护；可拖拽右下角手柄缩放或清除图片。</div>
                <el-button v-if="selectedElement.imageSrc" size="small" type="warning" plain @click="clearSelectedImage">
                  清除图片
                </el-button>
              </div>

              <div class="typography-panel">
                <div class="typography-title">位置对齐</div>
                <div class="align-row">
                  <el-button size="small" @click="alignSelectedElement('left')">左对齐</el-button>
                  <el-button size="small" @click="alignSelectedElement('center')">居中对齐</el-button>
                  <el-button size="small" @click="alignSelectedElement('right')">右对齐</el-button>
                </div>
              </div>

              <div v-if="showTextTypographyPanel" class="typography-panel">
                <div class="typography-title">文字样式</div>
                <template v-if="selectedElement.type === 'bilingualText'">
                  <div class="typography-sub">中文行</div>
                  <el-select v-model="selectedElement.fontFamily" size="small" class="typo-row" @change="onTextTypographyChange">
                    <el-option label="微软雅黑" value="yahei" />
                    <el-option label="宋体" value="simsun" />
                    <el-option label="仿宋" value="fangsong" />
                    <el-option label="楷体" value="kaiti" />
                  </el-select>
                  <div class="typo-row-num">
                    <span class="typo-label">字号</span>
                    <el-input-number
                      v-model="selectedElement.fontSize"
                      :min="8"
                      :max="96"
                      size="small"
                      controls-position="right"
                      @change="onTextTypographyChange"
                    />
                  </div>
                  <el-select v-model="selectedElement.fontWeight" size="small" class="typo-row" @change="onTextTypographyChange">
                    <el-option label="常规" value="normal" />
                    <el-option label="加粗" value="bold" />
                  </el-select>
                  <div class="typography-sub">英文行</div>
                  <el-select v-model="selectedElement.fontFamilyEn" size="small" class="typo-row" @change="onTextTypographyChange">
                    <el-option label="微软雅黑" value="yahei" />
                    <el-option label="宋体" value="simsun" />
                    <el-option label="仿宋" value="fangsong" />
                    <el-option label="楷体" value="kaiti" />
                  </el-select>
                  <div class="typo-row-num">
                    <span class="typo-label">字号</span>
                    <el-input-number
                      v-model="selectedElement.fontSizeEn"
                      :min="8"
                      :max="96"
                      size="small"
                      controls-position="right"
                      @change="onTextTypographyChange"
                    />
                  </div>
                  <el-select v-model="selectedElement.fontWeightEn" size="small" class="typo-row" @change="onTextTypographyChange">
                    <el-option label="常规" value="normal" />
                    <el-option label="加粗" value="bold" />
                  </el-select>
                </template>
                <template v-else>
                  <el-select v-model="selectedElement.fontFamily" size="small" class="typo-row" @change="onTextTypographyChange">
                    <el-option label="微软雅黑" value="yahei" />
                    <el-option label="宋体" value="simsun" />
                    <el-option label="仿宋" value="fangsong" />
                    <el-option label="楷体" value="kaiti" />
                  </el-select>
                  <div class="typo-row-num">
                    <span class="typo-label">字号</span>
                    <el-input-number
                      v-model="selectedElement.fontSize"
                      :min="8"
                      :max="96"
                      size="small"
                      controls-position="right"
                      @change="onTextTypographyChange"
                    />
                  </div>
                  <el-select v-model="selectedElement.fontWeight" size="small" class="typo-row" @change="onTextTypographyChange">
                    <el-option label="常规" value="normal" />
                    <el-option label="加粗" value="bold" />
                  </el-select>
                </template>
              </div>

              <div v-if="tableTypographyTarget" class="typography-panel">
                <div class="typography-title">{{ tableTypographyLabel }}</div>
                <el-select v-model="tableTypographyTarget.fontFamily" size="small" class="typo-row">
                  <el-option label="微软雅黑" value="yahei" />
                  <el-option label="宋体" value="simsun" />
                  <el-option label="仿宋" value="fangsong" />
                  <el-option label="楷体" value="kaiti" />
                </el-select>
                <div class="typo-row-num">
                  <span class="typo-label">字号</span>
                  <el-input-number
                    v-model="tableTypographyTarget.fontSize"
                    :min="8"
                    :max="96"
                    size="small"
                    controls-position="right"
                  />
                </div>
                <el-select v-model="tableTypographyTarget.fontWeight" size="small" class="typo-row">
                  <el-option label="常规" value="normal" />
                  <el-option label="加粗" value="bold" />
                </el-select>
              </div>

              <div v-if="selectedTableElement" class="table-editor">
                <div class="table-editor-title">表格编辑（类 Excel）</div>
                <div class="tips table-editor-hint">
                  拖拽列边界调列宽、行边界调行高；表头下沿调表头高度。表格右侧/下侧「+」可增列/增行。
                </div>
                <div class="table-editor-grid">
                  <el-button size="small" @click="addTableColumn" icon=Plus>新增列</el-button>
                  <el-button size="small" @click="addTableRow" icon=Plus>新增行</el-button>
                  <el-button size="small" @click="removeTableColumn" icon=Delete>删除列</el-button>
                  <el-button size="small" @click="removeTableRow" icon=Delete>删除行</el-button>
                  <el-button size="small" @click="mergeCellRight">合并（向右）</el-button>
                  <el-button size="small" @click="mergeCellDown">合并（向下）</el-button>
                  <el-button size="small" @click="splitCell" icon=Close>取消合并</el-button>
                </div>
                <div class="tips">
                  <template v-if="selectedTableHeaderCol != null">
                    已选表头：第 {{ selectedTableHeaderCol + 1 }} 列
                  </template>
                  <template v-else>
                    已选单元格：
                    {{ selectedTableCell ? `${selectedTableCell.row + 1}-${selectedTableCell.col + 1}` : '未选择' }}
                  </template>
                </div>
              </div>
            </template>
          </el-tab-pane>

          <el-tab-pane name="layers">
            <template #label>
              图层
              <el-badge v-if="elements.length" :value="elements.length" class="layer-badge" />
            </template>
            <div v-if="!elements.length" class="properties-empty">
              <el-empty description="画布暂无组件" :image-size="72" />
            </div>
            <ul v-else class="layer-list">
              <li
                v-for="(el, idx) in layerListReversed"
                :key="el.id"
                class="layer-item"
                :class="{ active: selectedId === el.id }"
                @click="selectElementById(el.id)"
              >
                <span class="layer-name">{{ elementTypeLabel(el.type) }}</span>
                <span class="layer-preview">{{ elementPreviewText(el) }}</span>
                <span class="layer-actions" @click.stop>
                  <el-button
                    text
                    size="small"
                    :disabled="idx === 0"
                    title="上移一层"
                    @click="moveLayer(el.id, 1)"
                  >
                    ↑
                  </el-button>
                  <el-button
                    text
                    size="small"
                    :disabled="idx === elements.length - 1"
                    title="下移一层"
                    @click="moveLayer(el.id, -1)"
                  >
                    ↓
                  </el-button>
                  <el-button text size="small" type="danger" title="删除" @click="removeElement(el.id)" icon=Delete />
                </span>
              </li>
            </ul>
          </el-tab-pane>
        </el-tabs>
      </aside>

      <section class="canvas-area">
        <div class="canvas-toolbar">
          <span class="canvas-meta">{{ elements.length }} 个组件</span>
          <div class="zoom-controls">
            <el-button size="small" text :disabled="canvasZoom <= 50" @click="adjustZoom(-10)">−</el-button>
            <el-select v-model="canvasZoom" size="small" class="zoom-select">
              <el-option v-for="z in zoomOptions" :key="z" :label="`${z}%`" :value="z" />
            </el-select>
            <el-button size="small" text :disabled="canvasZoom >= 150" @click="adjustZoom(10)">+</el-button>
            <el-button size="small" text @click="canvasZoom = 100">适应</el-button>
          </div>
        </div>
        <div class="canvas-scroll">
          <div class="canvas-zoom-wrap" :style="canvasZoomStyle">
            <div
              ref="canvasRef"
              class="a4-canvas"
              @mousedown.self="deselectAll"
              @mousemove="onCanvasMouseMove"
              @mouseup="onCanvasMouseUp"
              @mouseleave="onCanvasMouseUp"
            >
              <div v-if="!elements.length" class="canvas-empty">
                <p class="canvas-empty-title">空白 A4 画布</p>
                <p class="canvas-empty-desc">从左侧添加组件，或套用已有样式快速开始</p>
                <div class="empty-quick-btns">
                  <el-button
                    v-for="item in componentCatalog.slice(0, 4)"
                    :key="item.type"
                    size="small"
                    @click="addElement(item.type)"
                  >
                    {{ item.label }}
                  </el-button>
                </div>
                <el-button type="primary" link @click="openStyleManager">打开样式库套用</el-button>
              </div>
              <div class="safe-area" />
          <div class="measure-host" aria-hidden="true">
            <span ref="measureSpan" class="measure-span" />
            <div ref="measureBlock" class="measure-block" />
          </div>
          <div
            v-if="guideLineX !== null"
            class="guide-line vertical"
            :style="{ left: `${guideLineX}px` }"
          />
          <div
            v-if="guideLineY !== null"
            class="guide-line horizontal"
            :style="{ top: `${guideLineY}px` }"
          />

          <div
            v-for="el in elements"
            :key="el.id"
            class="design-element"
            :class="{
              selected: selectedId === el.id,
              'is-flow-text': isFlowTextType(el.type),
              'has-table': el.type === 'table',
              'has-image-el': el.type === 'image'
            }"
            :style="elementStyle(el)"
            @mousedown.prevent="startDrag(el, $event)"
            @click.stop="selectedId = el.id"
          >
            <button
              v-if="selectedId === el.id"
              type="button"
              class="delete-btn"
              title="删除组件"
              @click.stop="removeElement(el.id)"
            >
              x
            </button>
            <template v-if="el.type === 'text'">
              <input
                v-model="el.text"
                class="el-input-text"
                type="text"
                placeholder="请输入文本"
                :style="fontCss(el)"
                @mousedown.stop
                @input="onFlowTextInput(el)"
              />
            </template>
            <template v-else-if="el.type === 'multiline'">
              <textarea
                v-model="el.text"
                class="el-textarea"
                placeholder="请输入多行文本"
                :style="fontCss(el)"
                @mousedown.stop
                @input="onFlowTextInput(el)"
              />
            </template>
            <template v-else-if="el.type === 'bilingualText'">
              <input
                v-model="el.text"
                class="el-input-text"
                type="text"
                placeholder="中文文本"
                :style="fontCssZh(el)"
                @mousedown.stop
                @input="onFlowTextInput(el)"
              />
              <input
                v-model="el.subtext"
                class="el-input-text el-input-subtext"
                type="text"
                placeholder="English text"
                :style="fontCssEn(el)"
                @mousedown.stop
                @input="onFlowTextInput(el)"
              />
            </template>
            <template v-else-if="el.type === 'table'">
              <div class="table-canvas-wrap" @mousedown.stop>
                <table class="mini-table mini-table-fixed">
                  <colgroup>
                    <col
                      v-for="(cw, ci) in el.table.colWidths"
                      :key="`colgroup-${ci}`"
                      :style="{ width: `${cw}px` }"
                    />
                  </colgroup>
                  <thead>
                    <tr class="table-tr-header" :style="{ height: `${el.table.headerRowHeight}px` }">
                      <th
                        v-for="(col, ci) in el.table.columns"
                        :key="`h-${ci}`"
                        class="th-resize-host"
                        :class="{ 'cell-selected': isSelectedTableHeader(el, ci) }"
                        @mousedown.stop
                        @click.stop="selectTableHeader(el, ci)"
                      >
                        <input
                          v-model="col.text"
                          class="table-input table-header-input"
                          type="text"
                          :style="fontCss(col)"
                          @mousedown.stop
                          @click.stop="selectTableHeader(el, ci)"
                        />
                        <div
                          class="col-resize-grip"
                          title="拖拽调整列宽"
                          @mousedown.stop.prevent="startTableColResize(el, ci, $event)"
                        />
                        <div
                          v-if="ci === 0"
                          class="header-row-resize-grip"
                          title="拖拽调整表头行高"
                          @mousedown.stop.prevent="startTableHeaderRowResize(el, $event)"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, ri) in el.table.rows"
                      :key="`r-${ri}`"
                      :style="{ height: `${el.table.bodyRowHeights[ri] || 32}px` }"
                    >
                      <td
                        v-for="(cell, ci) in row"
                        v-show="!cell.hidden"
                        :key="`c-${ri}-${ci}`"
                        class="td-resize-host"
                        :rowspan="cell.rowspan || 1"
                        :colspan="cell.colspan || 1"
                        :class="{ 'cell-selected': isSelectedTableCell(el, ri, ci) }"
                        @mousedown.stop
                        @click.stop="selectTableCell(el, ri, ci)"
                      >
                        <input
                          v-model="cell.text"
                          class="table-input"
                          type="text"
                          :style="fontCss(cell)"
                          @mousedown.stop
                          @click.stop="selectTableCell(el, ri, ci)"
                        />
                        <div
                          v-if="!cell.hidden && ci === firstVisibleColInRow(row)"
                          class="body-row-resize-grip"
                          :style="bodyRowGripStretchStyle(el, row)"
                          title="拖拽调整该行高度"
                          @mousedown.stop.prevent="startTableBodyRowResize(el, ri, $event)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <button
                  type="button"
                  class="table-edge-btn table-edge-add-col"
                  title="在右侧增加一列"
                  @click.stop="addTableColumnForEl(el)"
                >
                  +
                </button>
                <button
                  type="button"
                  class="table-edge-btn table-edge-add-row"
                  title="在下方增加一行"
                  @click.stop="addTableRowForEl(el)"
                >
                  +
                </button>
              </div>
            </template>
            <template v-else-if="el.type === 'underline'">
              <div class="underline-only" />
            </template>
            <template v-else-if="el.type === 'image'">
              <div class="image-element-inner" @mousedown.stop>
                <img
                  v-if="el.imageSrc"
                  :src="el.imageSrc"
                  class="designer-img"
                  alt=""
                  @load="onDesignerImageLoad(el, $event)"
                />
                <div v-else class="image-box image-box-empty">请从左侧图片库选择图片</div>
                <div
                  v-if="selectedId === el.id"
                  class="img-resize-handle"
                  title="拖拽等比例缩放"
                  @mousedown.stop.prevent="startImageProportionalResize(el, $event)"
                />
              </div>
            </template>
          </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer v-if="selectedElement" class="designer-statusbar">
      已选：{{ elementTypeLabel(selectedElement.type) }}
      <span class="status-sep">·</span>
      位置 ({{ Math.round(selectedElement.x) }}, {{ Math.round(selectedElement.y) }})
      <span class="status-sep">·</span>
      尺寸 {{ Math.round(selectedElement.w) }} × {{ Math.round(selectedElement.h) }}
    </footer>

    <el-dialog title="保存为报告样式" v-model="styleSaveDialog" width="520px">
      <el-form :model="styleForm" label-width="96px">
        <el-form-item label="样式名称">
          <el-input v-model="styleForm.name" maxlength="128" show-word-limit placeholder="例如：外贸报告横向样式" />
        </el-form-item>
        <el-form-item label="样式描述">
          <el-input v-model="styleForm.description" maxlength="255" show-word-limit placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="styleSaveDialog = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="styleSaveLoading" @click="submitSaveStyle" icon=Check>保存</el-button>
      </template>
    </el-dialog>

    <el-dialog title="报告样式管理" v-model="styleManageDialog" width="760px">
      <div class="style-manage-toolbar">
        <span class="tips">报告样式与报告模板是独立能力；这里仅管理设计器样式。</span>
        <el-button text type="primary" :loading="styleManageLoading" @click="loadReportStyles" icon=Refresh>刷新</el-button>
      </div>
      <el-table :data="reportStyles" border size="small" v-loading="styleManageLoading">
        <el-table-column prop="name" label="样式名称" min-width="220" />
        <el-table-column prop="description" label="描述" min-width="240" />
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ $dt(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="applyReportStyle(row)">套用</el-button>
            <el-button link type="primary" @click="editReportStyle(row)">修改</el-button>
            <el-button link type="danger" :loading="styleDeleteId === row.id" @click="removeReportStyle(row)" icon=Delete>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="styleManageDialog = false" icon=Close>关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  Back,
  Check,
  Close,
  Connection,
  Delete,
  Document,
  EditPen,
  FolderOpened,
  Grid,
  Minus,
  Picture,
  Plus,
  QuestionFilled,
  Refresh,
  Upload
} from '@element-plus/icons-vue';
import {
  createReportStyle,
  deleteReportStyle,
  listReportStyles,
  deleteReportImageLibraryBatch,
  getReportStyle,
  listReportImageLibrary,
  updateReportStyle,
  uploadReportImageLibraryBatch
} from '../api';
import { IMAGE_LIB_MAX_BATCH, IMAGE_LIB_MAX_FILE_BYTES } from '../utils/reportImageLibrary';
import { isSuperAdmin } from '../utils/permissions';

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const STORAGE_KEY = 'report-designer-style-v1';
const GUIDE_DISMISS_KEY = 'report-designer-guide-dismissed';
const ALIGN_THRESHOLD = 6;
const SAFE_MARGIN = 32;
const SAFE_INNER_MAX_W = A4_WIDTH - SAFE_MARGIN * 2;
const SAFE_INNER_MAX_H = A4_HEIGHT - SAFE_MARGIN * 2;
/** 容器 padding(6+6) + input 左右 padding + 余量，避免实际渲染比测量值略宽而裁字 */
const TEXT_BOX_PAD_X = 12 + 12 + 8;
/** 容器上下 padding + input 上下 padding + 余量（input 默认内边距与行高会高于纯文本测量） */
const TEXT_BOX_PAD_Y = 8 + 8 + 10;
const BILINGUAL_LINE_GAP = 4;

const FONT_FAMILY_CSS = {
  yahei: '"Microsoft YaHei","微软雅黑",sans-serif',
  simsun: 'SimSun,"宋体",serif',
  fangsong: 'FangSong,"仿宋",serif',
  kaiti: 'KaiTi,"楷体",serif'
};

const DEFAULT_BODY_TYPO = { fontFamily: 'yahei', fontSize: 14, fontWeight: 'normal' };
const DEFAULT_TABLE_CELL_TYPO = { fontFamily: 'yahei', fontSize: 12, fontWeight: 'normal' };
const DEFAULT_TABLE_HEADER_TYPO = { fontFamily: 'yahei', fontSize: 12, fontWeight: 'bold' };

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toCssTypography({ fontFamily, fontSize, fontWeight }) {
  const fam = FONT_FAMILY_CSS[fontFamily] || FONT_FAMILY_CSS.yahei;
  const size = Number(fontSize);
  return {
    fontFamily: fam,
    fontSize: `${Number.isFinite(size) && size > 0 ? size : 14}px`,
    fontWeight: fontWeight === 'bold' ? 'bold' : 'normal'
  };
}

function headerCol(text) {
  return { text, ...DEFAULT_TABLE_HEADER_TYPO };
}

function bodyCell(text) {
  return { text, rowspan: 1, colspan: 1, hidden: false, ...DEFAULT_TABLE_CELL_TYPO };
}

const DEFAULT_COL_WIDTH = 92;
const DEFAULT_HEADER_ROW_H = 34;
const DEFAULT_BODY_ROW_H = 32;

const ELEMENT_TYPE_LABELS = {
  text: '单行文本',
  multiline: '多行文本',
  bilingualText: '中英文双行',
  table: '表格',
  underline: '下划线',
  image: '图片'
};

function createTableModel() {
  return {
    columns: [headerCol('项目'), headerCol('标准'), headerCol('结果')],
    rows: [
      [bodyCell('外观'), bodyCell('透明'), bodyCell('透明')],
      [bodyCell('色度'), bodyCell('<=3'), bodyCell('2')]
    ],
    colWidths: [DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH],
    headerRowHeight: DEFAULT_HEADER_ROW_H,
    bodyRowHeights: [DEFAULT_BODY_ROW_H, DEFAULT_BODY_ROW_H]
  };
}

function normalizeColEntry(raw, index) {
  if (typeof raw === 'string') {
    return { text: raw, ...DEFAULT_TABLE_HEADER_TYPO };
  }
  const t = raw || {};
  return {
    text: String(t.text ?? `列${index + 1}`),
    fontFamily: t.fontFamily && FONT_FAMILY_CSS[t.fontFamily] ? t.fontFamily : 'yahei',
    fontSize: Number(t.fontSize) > 0 ? Number(t.fontSize) : DEFAULT_TABLE_HEADER_TYPO.fontSize,
    fontWeight: t.fontWeight === 'bold' ? 'bold' : 'normal'
  };
}

function normalizeCellEntry(cell) {
  const c = cell || {};
  const rs = Number(c.rowspan);
  const cs = Number(c.colspan);
  return {
    text: String(c.text ?? ''),
    rowspan: Number.isFinite(rs) && rs > 1 ? Math.floor(rs) : 1,
    colspan: Number.isFinite(cs) && cs > 1 ? Math.floor(cs) : 1,
    hidden: !!c.hidden,
    fontFamily: c.fontFamily && FONT_FAMILY_CSS[c.fontFamily] ? c.fontFamily : 'yahei',
    fontSize: Number(c.fontSize) > 0 ? Number(c.fontSize) : DEFAULT_TABLE_CELL_TYPO.fontSize,
    fontWeight: c.fontWeight === 'bold' ? 'bold' : 'normal'
  };
}

function normalizeTable(table) {
  const src = table && typeof table === 'object' ? table : {};
  const colCount = Math.max(1, src.columns?.length || 0);
  const rowCount = Math.max(1, src.rows?.length || 0);
  const columns = Array.from({ length: colCount }).map((_, i) => normalizeColEntry(src.columns?.[i], i));
  const normalized = [];
  for (let r = 0; r < rowCount; r += 1) {
    const nextRow = [];
    for (let c = 0; c < colCount; c += 1) {
      nextRow.push(normalizeCellEntry(src.rows?.[r]?.[c]));
    }
    normalized.push(nextRow);
  }

  let colWidths = Array.isArray(src.colWidths) ? src.colWidths.map((w) => Number(w)) : [];
  while (colWidths.length < colCount) colWidths.push(DEFAULT_COL_WIDTH);
  colWidths = colWidths.slice(0, colCount).map((w) => (Number.isFinite(w) && w >= 40 ? w : DEFAULT_COL_WIDTH));

  let headerRowHeight = Number(src.headerRowHeight);
  if (!Number.isFinite(headerRowHeight) || headerRowHeight < 24) headerRowHeight = DEFAULT_HEADER_ROW_H;

  let bodyRowHeights = Array.isArray(src.bodyRowHeights) ? src.bodyRowHeights.map((h) => Number(h)) : [];
  while (bodyRowHeights.length < rowCount) bodyRowHeights.push(DEFAULT_BODY_ROW_H);
  bodyRowHeights = bodyRowHeights.slice(0, rowCount).map((h) => (Number.isFinite(h) && h >= 22 ? h : DEFAULT_BODY_ROW_H));

  return {
    columns,
    rows: normalized,
    colWidths,
    headerRowHeight,
    bodyRowHeights
  };
}

function migrateCanvasElement(e) {
  const next = { ...e };
  if (next.type === 'text' || next.type === 'multiline') {
    if (next.fontFamily == null) next.fontFamily = DEFAULT_BODY_TYPO.fontFamily;
    if (next.fontSize == null) next.fontSize = DEFAULT_BODY_TYPO.fontSize;
    if (next.fontWeight == null) next.fontWeight = DEFAULT_BODY_TYPO.fontWeight;
  }
  if (next.type === 'bilingualText') {
    if (next.fontFamily == null) next.fontFamily = DEFAULT_BODY_TYPO.fontFamily;
    if (next.fontSize == null) next.fontSize = DEFAULT_BODY_TYPO.fontSize;
    if (next.fontWeight == null) next.fontWeight = DEFAULT_BODY_TYPO.fontWeight;
    if (next.fontFamilyEn == null) next.fontFamilyEn = 'yahei';
    if (next.fontSizeEn == null) next.fontSizeEn = 12;
    if (next.fontWeightEn == null) next.fontWeightEn = 'normal';
  }
  if (next.type === 'table') {
    next.table = normalizeTable(next.table || createTableModel());
  }
  if (next.type === 'image') {
    if (next.imageSrc == null) next.imageSrc = '';
    if (next.libraryImageId == null) next.libraryImageId = null;
    const ar = Number(next.aspectRatio);
    next.aspectRatio = Number.isFinite(ar) && ar > 0 ? ar : 4 / 3;
  }
  return next;
}

export default {
  name: 'ReportDesigner',
  data() {
    return {
      Back,
      Check,
      Close,
      Delete,
      FolderOpened,
      Plus,
      QuestionFilled,
      Refresh,
      Upload,
      componentCatalog: [
        { type: 'text', label: '单行文本', icon: EditPen },
        { type: 'multiline', label: '多行文本', icon: Document },
        { type: 'bilingualText', label: '中英文', icon: Connection },
        { type: 'table', label: '表格', icon: Grid },
        { type: 'underline', label: '下划线', icon: Minus },
        { type: 'image', label: '图片', icon: Picture }
      ],
      sidebarTab: 'components',
      showGuide: !localStorage.getItem(GUIDE_DISMISS_KEY),
      dirty: false,
      suppressDirty: true,
      canvasZoom: 100,
      zoomOptions: [50, 75, 100, 125, 150],
      elements: [],
      selectedId: null,
      selectedTableCell: null,
      selectedTableHeaderCol: null,
      dragState: null,
      guideLineX: null,
      guideLineY: null,
      imageLibrary: [],
      styleSaveDialog: false,
      styleSaveLoading: false,
      styleForm: { id: null, name: '', description: '' },
      styleManageDialog: false,
      styleManageLoading: false,
      styleDeleteId: null,
      reportStyles: []
    };
  },
  mounted() {
    if (isSuperAdmin()) this.loadImageLibrary();
    this.restoreFromLocal();
    this.$nextTick(() => {
      this.syncAllFlowTextBoxes();
      this.elements.forEach((e) => {
        if (e.type === 'table') this.syncTableElementSize(e);
      });
      this.suppressDirty = false;
    });
    window.addEventListener('keydown', this.onKeyDown);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeyDown);
  },
  beforeRouteLeave(to, from, next) {
    if (!this.dirty) {
      next();
      return;
    }
    this.$confirm('当前有未保存的修改，确认离开设计器？', '提示', { type: 'warning' })
      .then(() => next())
      .catch(() => next(false));
  },
  watch: {
    elements: {
      deep: true,
      handler() {
        if (!this.suppressDirty) this.dirty = true;
      }
    }
  },
  computed: {
    selectedElement() {
      return this.elements.find((e) => e.id === this.selectedId) || null;
    },
    selectedTableElement() {
      return this.selectedElement?.type === 'table' ? this.selectedElement : null;
    },
    showTextTypographyPanel() {
      const el = this.selectedElement;
      return !!(el && ['text', 'multiline', 'bilingualText'].includes(el.type));
    },
    tableTypographyTarget() {
      const el = this.selectedTableElement;
      if (!el?.table) return null;
      if (this.selectedTableHeaderCol != null) {
        const col = el.table.columns[this.selectedTableHeaderCol];
        if (col && typeof col === 'object' && 'text' in col) return col;
      }
      if (this.selectedTableCell) {
        const { row, col } = this.selectedTableCell;
        const cell = el.table.rows[row]?.[col];
        if (cell && !cell.hidden) return cell;
      }
      return null;
    },
    tableTypographyLabel() {
      if (this.selectedTableHeaderCol != null) return '表头文字';
      if (this.selectedTableCell) return '单元格文字';
      return '表格文字';
    },
    underlineMaxW() {
      return SAFE_INNER_MAX_W;
    },
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    layerListReversed() {
      return [...this.elements].reverse();
    },
    canvasZoomStyle() {
      const s = this.canvasZoom / 100;
      return {
        transform: `scale(${s})`,
        transformOrigin: 'top center',
        width: `${794 * s}px`,
        margin: '0 auto'
      };
    }
  },
  methods: {
    dismissGuide() {
      this.showGuide = false;
      localStorage.setItem(GUIDE_DISMISS_KEY, '1');
    },
    goBack() {
      if (!this.dirty) {
        this.$router.push('/reports');
        return;
      }
      this.$confirm('当前有未保存的修改，确认返回报告列表？', '提示', { type: 'warning' })
        .then(() => this.$router.push('/reports'))
        .catch(() => {});
    },
    onSaveCommand(command) {
      if (command === 'local') this.saveToLocal();
    },
    elementTypeLabel(type) {
      return ELEMENT_TYPE_LABELS[type] || type || '组件';
    },
    elementPreviewText(el) {
      if (!el) return '';
      if (el.type === 'text' || el.type === 'multiline') return String(el.text || '').slice(0, 24);
      if (el.type === 'bilingualText') return String(el.text || el.subtext || '').slice(0, 24);
      if (el.type === 'table') {
        const col = el.table?.columns?.[0];
        const label = typeof col === 'object' ? col.text : col;
        return label ? `表头：${String(label).slice(0, 16)}` : '表格';
      }
      if (el.type === 'image') return el.imageSrc ? '已配图' : '未配图';
      return '';
    },
    selectElementById(id) {
      this.selectedId = id;
      this.selectedTableCell = null;
      this.selectedTableHeaderCol = null;
      this.sidebarTab = 'properties';
    },
    deselectAll() {
      this.selectedId = null;
      this.selectedTableCell = null;
      this.selectedTableHeaderCol = null;
    },
    moveLayer(id, direction) {
      const idx = this.elements.findIndex((e) => e.id === id);
      if (idx < 0) return;
      const next = idx + direction;
      if (next < 0 || next >= this.elements.length) return;
      const copy = [...this.elements];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      this.elements = copy;
      this.selectedId = id;
    },
    adjustZoom(delta) {
      const opts = this.zoomOptions;
      const cur = this.canvasZoom;
      const i = opts.indexOf(cur);
      if (i >= 0) {
        const ni = Math.max(0, Math.min(opts.length - 1, i + (delta > 0 ? 1 : -1)));
        this.canvasZoom = opts[ni];
        return;
      }
      this.canvasZoom = Math.max(50, Math.min(150, cur + delta));
    },
    onKeyDown(event) {
      const tag = String(event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
      if (event.key === 'Escape') {
        this.deselectAll();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!this.selectedId) return;
        event.preventDefault();
        this.removeElement(this.selectedId);
      }
    },
    fontCss(obj) {
      return toCssTypography({
        fontFamily: obj.fontFamily,
        fontSize: obj.fontSize,
        fontWeight: obj.fontWeight
      });
    },
    fontCssZh(el) {
      return this.fontCss({
        fontFamily: el.fontFamily,
        fontSize: el.fontSize,
        fontWeight: el.fontWeight
      });
    },
    fontCssEn(el) {
      return this.fontCss({
        fontFamily: el.fontFamilyEn,
        fontSize: el.fontSizeEn,
        fontWeight: el.fontWeightEn
      });
    },
    isFlowTextType(type) {
      return type === 'text' || type === 'multiline' || type === 'bilingualText';
    },
    applyMeasureTypography(node, cssObj, lineHeight) {
      if (!node || !cssObj) return;
      node.style.fontFamily = cssObj.fontFamily;
      node.style.fontSize = cssObj.fontSize;
      node.style.fontWeight = cssObj.fontWeight;
      node.style.lineHeight = lineHeight || '1.45';
    },
    clampFlowTextElement(el) {
      el.w = Math.min(Math.max(el.w, 40), SAFE_INNER_MAX_W);
      el.h = Math.min(Math.max(el.h, 24), SAFE_INNER_MAX_H);
      el.x = Math.max(SAFE_MARGIN, Math.min(el.x, A4_WIDTH - SAFE_MARGIN - el.w));
      el.y = Math.max(SAFE_MARGIN, Math.min(el.y, A4_HEIGHT - SAFE_MARGIN - el.h));
    },
    syncCanvasTextBox(el) {
      const span = this.$refs.measureSpan;
      const block = this.$refs.measureBlock;
      if (!el || !span || !block) return;

      if (el.type === 'text') {
        const css = this.fontCss(el);
        this.applyMeasureTypography(span, css, '1.45');
        span.textContent = String(el.text || '').length ? el.text : '\u00a0';
        const measuredW = Math.ceil(span.getBoundingClientRect().width);
        const measuredH = Math.ceil(span.getBoundingClientRect().height);
        const fs = Number(el.fontSize) > 0 ? Number(el.fontSize) : 14;
        el.w = Math.min(Math.max(measuredW + TEXT_BOX_PAD_X, 56), SAFE_INNER_MAX_W);
        const wantH = Math.max(measuredH + TEXT_BOX_PAD_Y, fs * 1.55 + TEXT_BOX_PAD_Y);
        el.h = Math.min(wantH, SAFE_INNER_MAX_H);
        this.clampFlowTextElement(el);
        return;
      }

      if (el.type === 'bilingualText') {
        const cssZh = this.fontCssZh(el);
        const cssEn = this.fontCssEn(el);
        this.applyMeasureTypography(span, cssZh, '1.45');
        span.textContent = String(el.text || '').length ? el.text : '\u00a0';
        const h1 = Math.ceil(span.getBoundingClientRect().height);
        const w1 = Math.ceil(span.getBoundingClientRect().width);
        this.applyMeasureTypography(span, cssEn, '1.45');
        span.textContent = String(el.subtext || '').length ? el.subtext : '\u00a0';
        const h2 = Math.ceil(span.getBoundingClientRect().height);
        const w2 = Math.ceil(span.getBoundingClientRect().width);
        const fsZh = Number(el.fontSize) > 0 ? Number(el.fontSize) : 14;
        const fsEn = Number(el.fontSizeEn) > 0 ? Number(el.fontSizeEn) : 12;
        el.w = Math.min(Math.max(Math.max(w1, w2) + TEXT_BOX_PAD_X, 56), SAFE_INNER_MAX_W);
        const wantH = Math.max(
          h1 + h2 + BILINGUAL_LINE_GAP + TEXT_BOX_PAD_Y,
          fsZh * 1.55 + fsEn * 1.55 + BILINGUAL_LINE_GAP + TEXT_BOX_PAD_Y
        );
        el.h = Math.min(wantH, SAFE_INNER_MAX_H);
        this.clampFlowTextElement(el);
        return;
      }

      if (el.type === 'multiline') {
        const css = this.fontCss(el);
        const raw = String(el.text ?? '');
        const lines = raw.length ? raw.split('\n') : [''];
        let maxLineW = 48;
        for (const line of lines) {
          this.applyMeasureTypography(span, css, '1.45');
          span.textContent = line.length ? line : '\u00a0';
          maxLineW = Math.max(maxLineW, Math.ceil(span.getBoundingClientRect().width));
        }
        const innerW = Math.min(Math.max(maxLineW + 16, 88), SAFE_INNER_MAX_W - TEXT_BOX_PAD_X);
        el.w = innerW + TEXT_BOX_PAD_X;
        this.applyMeasureTypography(block, css, '1.45');
        block.style.width = `${innerW}px`;
        block.textContent = raw.length ? raw : '\u200b';
        const contentH = block.scrollHeight + 6;
        const fs = Number(el.fontSize) > 0 ? Number(el.fontSize) : 14;
        const wantH = Math.max(contentH + TEXT_BOX_PAD_Y, fs * 1.6 + TEXT_BOX_PAD_Y);
        el.h = Math.min(wantH, SAFE_INNER_MAX_H);
        this.clampFlowTextElement(el);
      }
    },
    syncAllFlowTextBoxes() {
      this.elements.forEach((e) => {
        if (this.isFlowTextType(e.type)) this.syncCanvasTextBox(e);
      });
    },
    onFlowTextInput(el) {
      this.$nextTick(() => this.syncCanvasTextBox(el));
    },
    onTextTypographyChange() {
      this.$nextTick(() => {
        const el = this.selectedElement;
        if (el && this.isFlowTextType(el.type)) this.syncCanvasTextBox(el);
      });
    },
    openSaveStyleDialog() {
      this.styleForm = { id: null, name: '', description: '' };
      this.styleSaveDialog = true;
    },
    openStyleManager() {
      this.styleManageDialog = true;
      this.loadReportStyles();
    },
    async loadReportStyles() {
      this.styleManageLoading = true;
      try {
        const { items } = await listReportStyles();
        this.reportStyles = Array.isArray(items) ? items : [];
      } catch (e) {
        this.reportStyles = [];
        this.$message.error(this.$apiUserMsg(e, '加载报告样式失败'));
      } finally {
        this.styleManageLoading = false;
      }
    },
    async submitSaveStyle() {
      const name = String(this.styleForm.name || '').trim();
      if (!name) {
        this.$message.warning('请输入样式名称');
        return;
      }
      this.styleSaveLoading = true;
      try {
        const payload = {
          name,
          description: String(this.styleForm.description || '').trim() || null,
          elements: this.elements.map((e) => ({ ...e }))
        };
        await createReportStyle(payload);
        this.$message.success('已保存到服务器');
        this.dirty = false;
        this.styleSaveDialog = false;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存报告样式失败'));
      } finally {
        this.styleSaveLoading = false;
      }
    },
    async applyReportStyle(row) {
      const ok = await this.$confirm('套用报告样式会覆盖当前画布内容，确认继续？', '提示', { type: 'warning' }).catch(() => false);
      if (!ok) return;
      try {
        const { style } = await getReportStyle(row.id);
        const parsed = Array.isArray(style?.elements) ? style.elements : [];
        this.elements = parsed.filter((e) => e && e.id && e.type).map((e) => migrateCanvasElement(e));
        this.selectedId = null;
        this.selectedTableCell = null;
        this.selectedTableHeaderCol = null;
        this.$nextTick(() => {
          this.syncAllFlowTextBoxes();
          this.elements.forEach((e) => {
            if (e.type === 'table') this.syncTableElementSize(e);
          });
        });
        this.$message.success('已套用报告样式');
        this.dirty = false;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '套用报告样式失败'));
      }
    },
    async editReportStyle(row) {
      const { value } = await this.$prompt('请输入新的样式名称', '修改报告样式', {
        inputValue: row.name || '',
        inputPattern: /^.{1,128}$/,
        inputErrorMessage: '样式名称长度需在 1~128'
      }).catch(() => ({ value: null }));
      if (value == null) return;
      try {
        const { style } = await getReportStyle(row.id);
        await updateReportStyle(row.id, {
          name: String(value).trim(),
          description: row.description || null,
          elements: Array.isArray(style?.elements) ? style.elements : []
        });
        this.$message.success('已更新报告样式');
        await this.loadReportStyles();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '更新报告样式失败'));
      }
    },
    async removeReportStyle(row) {
      const ok = await this.$confirm(`确认删除报告样式「${row.name || row.id}」？`, '删除报告样式', { type: 'warning' }).catch(() => false);
      if (!ok) return;
      this.styleDeleteId = row.id;
      try {
        await deleteReportStyle(row.id);
        this.$message.success('已删除报告样式');
        await this.loadReportStyles();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除报告样式失败'));
      } finally {
        this.styleDeleteId = null;
      }
    },
    async loadImageLibrary() {
      try {
        const data = await listReportImageLibrary();
        this.imageLibrary = Array.isArray(data.items) ? data.items : [];
      } catch (e) {
        this.$message.warning('图片库加载失败，请检查网络或登录状态');
        this.imageLibrary = [];
      }
    },
    openImageLibraryPicker() {
      this.$refs.imageLibFileInput?.click();
    },
    async onImageLibraryFile(event) {
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
      let maxBatch = IMAGE_LIB_MAX_BATCH;
      try {
        const meta = await listReportImageLibrary();
        if (Number.isFinite(Number(meta.maxBatch))) maxBatch = Number(meta.maxBatch);
      } catch {
        /* use default */
      }
      const slice = files.slice(0, maxBatch);
      if (files.length > slice.length) {
        this.$message.warning(`单次最多上传 ${maxBatch} 张，已自动截取前 ${maxBatch} 张`);
      }
      try {
        await uploadReportImageLibraryBatch(slice);
        this.$message.success(`已上传 ${slice.length} 张`);
        await this.loadImageLibrary();
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'LIBRARY_FULL') {
          const cur = e?.response?.data?.current;
          const max = e?.response?.data?.max;
          this.$message.warning(
            typeof cur === 'number' ? `图库已满（${cur}/${max}），请先删除` : '图库已满，请先删除部分图片'
          );
        } else {
          this.$message.error(this.$apiUserMsg(e, '上传失败'));
        }
      }
    },
    async removeLibraryImage(id) {
      try {
        await deleteReportImageLibraryBatch([id]);
        await this.loadImageLibrary();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    applyLibraryImageToSelected(item) {
      const el = this.selectedElement;
      if (!el || el.type !== 'image') {
        this.$message.warning('请先在画布上选中「图片」组件，再点击缩略图');
        return;
      }
      el.imageSrc = item.imageUrl;
      el.libraryImageId = item.id;
    },
    clearSelectedImage() {
      const el = this.selectedElement;
      if (!el || el.type !== 'image') return;
      el.imageSrc = '';
      el.libraryImageId = null;
      el.aspectRatio = 4 / 3;
    },
    onDesignerImageLoad(el, event) {
      const img = event?.target;
      if (!el || !img || el.type !== 'image') return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw > 0 && nh > 0) {
        el.aspectRatio = nw / nh;
        if (!el.w || !el.h || el.w < 20 || el.h < 20) {
          el.w = 160;
          el.h = Math.round(160 / el.aspectRatio);
        }
      }
    },
    startImageProportionalResize(el, event) {
      if (!el || el.type !== 'image') return;
      const ar =
        el.aspectRatio && Number(el.aspectRatio) > 0 ? Number(el.aspectRatio) : el.w / Math.max(el.h, 1);
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = el.w;
      const startH = el.h;
      const diag0 = Math.hypot(startW, startH) || 1;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const diag1 = Math.hypot(Math.max(40, startW + dx), Math.max(40, startH + dy));
        const s = Math.max(0.12, diag1 / diag0);
        let nw = Math.round(Math.max(40, startW * s));
        let nh = Math.round(nw / ar);
        if (nw > SAFE_INNER_MAX_W) {
          nw = SAFE_INNER_MAX_W;
          nh = Math.round(nw / ar);
        }
        if (nh > SAFE_INNER_MAX_H) {
          nh = SAFE_INNER_MAX_H;
          nw = Math.round(nh * ar);
          nw = Math.min(nw, SAFE_INNER_MAX_W);
          nh = Math.round(nw / ar);
        }
        el.w = nw;
        el.h = nh;
        el.x = Math.max(SAFE_MARGIN, Math.min(el.x, A4_WIDTH - SAFE_MARGIN - el.w));
        el.y = Math.max(SAFE_MARGIN, Math.min(el.y, A4_HEIGHT - SAFE_MARGIN - el.h));
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    bumpUnderlineWidth(delta) {
      const el = this.selectedElement;
      if (!el || el.type !== 'underline') return;
      el.w = Math.round(Number(el.w) || 260) + delta;
      this.commitUnderlineWidth();
    },
    commitUnderlineWidth() {
      const el = this.selectedElement;
      if (!el || el.type !== 'underline') return;
      let w = Math.round(Number(el.w));
      if (!Number.isFinite(w)) w = 260;
      el.w = Math.min(Math.max(w, 40), SAFE_INNER_MAX_W);
      el.x = Math.max(SAFE_MARGIN, Math.min(el.x, A4_WIDTH - SAFE_MARGIN - el.w));
    },
    alignSelectedElement(mode) {
      const el = this.selectedElement;
      if (!el) return;
      const width = Math.max(1, Number(el.w) || 0);
      let nextX = el.x;
      if (mode === 'left') {
        nextX = SAFE_MARGIN;
      } else if (mode === 'center') {
        nextX = Math.round(SAFE_MARGIN + (SAFE_INNER_MAX_W - width) / 2);
      } else if (mode === 'right') {
        nextX = A4_WIDTH - SAFE_MARGIN - width;
      }
      el.x = Math.max(SAFE_MARGIN, Math.min(nextX, A4_WIDTH - SAFE_MARGIN - width));
    },
    addElement(type) {
      const index = this.elements.length;
      const baseX = 40 + (index % 5) * 18;
      const baseY = 40 + (index % 8) * 16;
      const base = { id: uid(), type, x: baseX, y: baseY, w: 220, h: 32, text: '', subtext: '' };
      if (type === 'text') {
        Object.assign(base, DEFAULT_BODY_TYPO);
        base.text = '单行文本';
      } else if (type === 'multiline') {
        Object.assign(base, DEFAULT_BODY_TYPO);
        base.text = '多行文本';
        base.h = 96;
      } else if (type === 'bilingualText') {
        Object.assign(base, DEFAULT_BODY_TYPO);
        base.text = '中文标题';
        base.subtext = 'English Subtitle';
        base.h = 48;
        base.fontFamilyEn = 'yahei';
        base.fontSizeEn = 12;
        base.fontWeightEn = 'normal';
      } else if (type === 'table') {
        base.table = createTableModel();
        base.w = 320;
        base.h = 160;
      } else if (type === 'underline') {
        base.w = 260;
        base.h = 14;
      } else if (type === 'image') {
        base.w = 160;
        base.h = 120;
        base.imageSrc = '';
        base.libraryImageId = null;
        base.aspectRatio = 4 / 3;
      }
      this.elements.push(base);
      this.selectedId = base.id;
      this.selectedTableCell = null;
      this.selectedTableHeaderCol = null;
      this.sidebarTab = 'properties';
      if (this.isFlowTextType(type)) {
        this.$nextTick(() => this.syncCanvasTextBox(base));
      }
      if (type === 'table') {
        this.$nextTick(() => this.syncTableElementSize(base));
      }
    },
    removeElement(id) {
      const idx = this.elements.findIndex((e) => e.id === id);
      if (idx < 0) return;
      this.elements.splice(idx, 1);
      if (this.selectedId === id) this.selectedId = null;
      this.selectedTableCell = null;
      this.selectedTableHeaderCol = null;
    },
    elementStyle(el) {
      return {
        left: `${el.x}px`,
        top: `${el.y}px`,
        width: `${el.w}px`,
        height: `${el.h}px`
      };
    },
    startDrag(el, event) {
      this.selectedId = el.id;
      if (el.type !== 'table') this.selectedTableCell = null;
      this.dragState = {
        id: el.id,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startX: el.x,
        startY: el.y
      };
    },
    onCanvasMouseMove(event) {
      if (!this.dragState) return;
      const el = this.elements.find((item) => item.id === this.dragState.id);
      if (!el) return;

      const dx = event.clientX - this.dragState.startMouseX;
      const dy = event.clientY - this.dragState.startMouseY;

      let nextX = this.dragState.startX + dx;
      let nextY = this.dragState.startY + dy;

      nextX = Math.max(SAFE_MARGIN, Math.min(nextX, A4_WIDTH - SAFE_MARGIN - el.w));
      nextY = Math.max(SAFE_MARGIN, Math.min(nextY, A4_HEIGHT - SAFE_MARGIN - el.h));

      const aligned = this.applySnapAndGuides(el.id, nextX, nextY, el.w, el.h);
      el.x = aligned.x;
      el.y = aligned.y;
    },
    onCanvasMouseUp() {
      if (!this.dragState) return;
      this.dragState = null;
      this.guideLineX = null;
      this.guideLineY = null;
    },
    isSelectedTableCell(el, row, col) {
      if (!this.selectedTableCell) return false;
      return this.selectedId === el.id && this.selectedTableCell.row === row && this.selectedTableCell.col === col;
    },
    selectTableCell(el, row, col) {
      if (!el || el.type !== 'table') return;
      const cell = el.table?.rows?.[row]?.[col];
      if (!cell || cell.hidden) return;
      this.selectedId = el.id;
      this.selectedTableCell = { row, col };
      this.selectedTableHeaderCol = null;
    },
    selectTableHeader(el, colIndex) {
      if (!el || el.type !== 'table') return;
      this.selectedId = el.id;
      this.selectedTableHeaderCol = colIndex;
      this.selectedTableCell = null;
    },
    isSelectedTableHeader(el, colIndex) {
      return this.selectedId === el.id && this.selectedTableHeaderCol === colIndex;
    },
    firstVisibleColInRow(row) {
      if (!row || !row.length) return 0;
      for (let i = 0; i < row.length; i += 1) {
        if (!row[i].hidden) return i;
      }
      return 0;
    },
    offsetColsBefore(el, colIndex) {
      const widths = el.table?.colWidths || [];
      let s = 0;
      for (let i = 0; i < colIndex; i += 1) {
        s += Number(widths[i]) > 0 ? Number(widths[i]) : DEFAULT_COL_WIDTH;
      }
      return s;
    },
    bodyRowGripStretchStyle(el, row) {
      const ci = this.firstVisibleColInRow(row);
      const leftOff = this.offsetColsBefore(el, ci);
      const total = (el.table.colWidths || []).reduce((a, b) => a + (Number(b) > 0 ? b : DEFAULT_COL_WIDTH), 0);
      return {
        left: `${-leftOff}px`,
        width: `${total}px`
      };
    },
    syncTableElementSize(el) {
      if (!el || el.type !== 'table' || !el.table?.colWidths) return;
      const tw = el.table.colWidths.reduce((a, b) => a + (Number(b) > 0 ? b : DEFAULT_COL_WIDTH), 0);
      const borderExtra = el.table.columns.length * 2 + 6;
      const hh = Number(el.table.headerRowHeight) > 0 ? el.table.headerRowHeight : DEFAULT_HEADER_ROW_H;
      const br = el.table.bodyRowHeights || [];
      const bodyH = br.reduce((a, b) => a + (Number(b) > 0 ? b : DEFAULT_BODY_ROW_H), 0);
      const rowBorder = Math.max(el.table.rows.length, 1) * 2 + 6;
      const pad = 14;
      el.w = Math.min(SAFE_INNER_MAX_W, Math.max(tw + borderExtra + pad, 120));
      el.h = Math.min(SAFE_INNER_MAX_H, Math.max(hh + bodyH + rowBorder + pad, 72));
      el.x = Math.max(SAFE_MARGIN, Math.min(el.x, A4_WIDTH - SAFE_MARGIN - el.w));
      el.y = Math.max(SAFE_MARGIN, Math.min(el.y, A4_HEIGHT - SAFE_MARGIN - el.h));
    },
    startTableColResize(el, colIndex, event) {
      const startX = event.clientX;
      const startW = el.table.colWidths[colIndex] || DEFAULT_COL_WIDTH;
      const move = (ev) => {
        const dw = ev.clientX - startX;
        el.table.colWidths[colIndex] = Math.round(Math.max(48, startW + dw));
        this.syncTableElementSize(el);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    startTableHeaderRowResize(el, event) {
      const startY = event.clientY;
      const startH = el.table.headerRowHeight || DEFAULT_HEADER_ROW_H;
      const move = (ev) => {
        const dh = ev.clientY - startY;
        el.table.headerRowHeight = Math.round(Math.max(24, startH + dh));
        this.syncTableElementSize(el);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    startTableBodyRowResize(el, rowIndex, event) {
      const startY = event.clientY;
      const startH = el.table.bodyRowHeights[rowIndex] || DEFAULT_BODY_ROW_H;
      const move = (ev) => {
        const dh = ev.clientY - startY;
        el.table.bodyRowHeights[rowIndex] = Math.round(Math.max(22, startH + dh));
        this.syncTableElementSize(el);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    addTableColumnForEl(el) {
      if (!el || el.type !== 'table') return;
      this.selectedId = el.id;
      this.selectedTableHeaderCol = null;
      this.selectedTableCell = null;
      el.table = normalizeTable(el.table);
      const nextCol = el.table.columns.length + 1;
      el.table.columns.push(headerCol(`列${nextCol}`));
      el.table.colWidths.push(DEFAULT_COL_WIDTH);
      for (const row of el.table.rows) {
        row.push(bodyCell(''));
      }
      el.table = normalizeTable(el.table);
      this.syncTableElementSize(el);
    },
    addTableRowForEl(el) {
      if (!el || el.type !== 'table') return;
      this.selectedId = el.id;
      this.selectedTableHeaderCol = null;
      this.selectedTableCell = null;
      el.table = normalizeTable(el.table);
      const colCount = el.table.columns.length;
      el.table.rows.push(Array.from({ length: colCount }, () => bodyCell('')));
      el.table.bodyRowHeights.push(DEFAULT_BODY_ROW_H);
      el.table = normalizeTable(el.table);
      this.syncTableElementSize(el);
    },
    ensureSelectedTableCell() {
      const el = this.selectedTableElement;
      if (!el) return null;
      const row = this.selectedTableCell?.row ?? 0;
      const col = this.selectedTableCell?.col ?? 0;
      const cell = el.table?.rows?.[row]?.[col];
      if (!cell || cell.hidden) {
        this.selectedTableCell = null;
        return null;
      }
      return { el, row, col, cell };
    },
    addTableColumn() {
      const el = this.selectedTableElement;
      if (!el) return;
      this.addTableColumnForEl(el);
    },
    addTableRow() {
      const el = this.selectedTableElement;
      if (!el) return;
      this.addTableRowForEl(el);
    },
    removeTableColumn() {
      const info = this.ensureSelectedTableCell();
      if (!info) {
        this.$message.warning('请先选择要删除的列中的一个单元格');
        return;
      }
      const { el, col } = info;
      if ((el.table.columns || []).length <= 1) {
        this.$message.warning('至少保留一列');
        return;
      }
      el.table = normalizeTable(el.table);
      el.table.columns.splice(col, 1);
      el.table.colWidths.splice(col, 1);
      for (const row of el.table.rows) {
        row.splice(col, 1);
      }
      el.table = normalizeTable(el.table);
      this.syncTableElementSize(el);
      this.selectedTableCell = null;
      this.selectedTableHeaderCol = null;
    },
    removeTableRow() {
      const info = this.ensureSelectedTableCell();
      if (!info) {
        this.$message.warning('请先选择要删除的行中的一个单元格');
        return;
      }
      const { el, row } = info;
      if ((el.table.rows || []).length <= 1) {
        this.$message.warning('至少保留一行');
        return;
      }
      el.table = normalizeTable(el.table);
      el.table.rows.splice(row, 1);
      el.table.bodyRowHeights.splice(row, 1);
      el.table = normalizeTable(el.table);
      this.syncTableElementSize(el);
      this.selectedTableCell = null;
      this.selectedTableHeaderCol = null;
    },
    mergeCellRight() {
      const info = this.ensureSelectedTableCell();
      if (!info) {
        this.$message.warning('请先选择单元格');
        return;
      }
      const { el, row, col, cell } = info;
      const right = el.table?.rows?.[row]?.[col + 1];
      if (!right || right.hidden) {
        this.$message.warning('右侧没有可合并单元格');
        return;
      }
      if ((cell.rowspan || 1) !== 1 || (right.rowspan || 1) !== 1) {
        this.$message.warning('请先拆分复杂合并单元格后再操作');
        return;
      }
      cell.colspan = (cell.colspan || 1) + (right.colspan || 1);
      right.hidden = true;
      right.rowspan = 1;
      right.colspan = 1;
    },
    mergeCellDown() {
      const info = this.ensureSelectedTableCell();
      if (!info) {
        this.$message.warning('请先选择单元格');
        return;
      }
      const { el, row, col, cell } = info;
      const down = el.table?.rows?.[row + 1]?.[col];
      if (!down || down.hidden) {
        this.$message.warning('下方没有可合并单元格');
        return;
      }
      if ((cell.colspan || 1) !== 1 || (down.colspan || 1) !== 1) {
        this.$message.warning('请先拆分复杂合并单元格后再操作');
        return;
      }
      cell.rowspan = (cell.rowspan || 1) + (down.rowspan || 1);
      down.hidden = true;
      down.rowspan = 1;
      down.colspan = 1;
    },
    splitCell() {
      const info = this.ensureSelectedTableCell();
      if (!info) {
        this.$message.warning('请先选择单元格');
        return;
      }
      const { el, row, col, cell } = info;
      const rs = cell.rowspan || 1;
      const cs = cell.colspan || 1;
      if (rs === 1 && cs === 1) return;
      for (let r = row; r < row + rs; r += 1) {
        for (let c = col; c < col + cs; c += 1) {
          const target = el.table?.rows?.[r]?.[c];
          if (!target) continue;
          target.hidden = false;
          target.rowspan = 1;
          target.colspan = 1;
        }
      }
      cell.rowspan = 1;
      cell.colspan = 1;
    },
    applySnapAndGuides(movingId, x, y, w, h) {
      const movingVertical = [x, x + w / 2, x + w];
      const movingHorizontal = [y, y + h / 2, y + h];
      const safeLeft = SAFE_MARGIN;
      const safeTop = SAFE_MARGIN;
      const safeRight = A4_WIDTH - SAFE_MARGIN;
      const safeBottom = A4_HEIGHT - SAFE_MARGIN;
      const targetX = [safeLeft, (safeLeft + safeRight) / 2, safeRight];
      const targetY = [safeTop, (safeTop + safeBottom) / 2, safeBottom];

      for (const other of this.elements) {
        if (other.id === movingId) continue;
        targetX.push(other.x, other.x + other.w / 2, other.x + other.w);
        targetY.push(other.y, other.y + other.h / 2, other.y + other.h);
      }

      let snapX = x;
      let snapY = y;
      this.guideLineX = null;
      this.guideLineY = null;

      const leftBasedAdjust = (movingEdgeIdx, target) => target - movingVertical[movingEdgeIdx];
      const topBasedAdjust = (movingEdgeIdx, target) => target - movingHorizontal[movingEdgeIdx];

      let bestX = { delta: ALIGN_THRESHOLD + 1, adjust: 0, line: null };
      let bestY = { delta: ALIGN_THRESHOLD + 1, adjust: 0, line: null };

      for (const tx of targetX) {
        for (let i = 0; i < movingVertical.length; i += 1) {
          const delta = Math.abs(movingVertical[i] - tx);
          if (delta < bestX.delta) {
            bestX = { delta, adjust: leftBasedAdjust(i, tx), line: tx };
          }
        }
      }
      for (const ty of targetY) {
        for (let i = 0; i < movingHorizontal.length; i += 1) {
          const delta = Math.abs(movingHorizontal[i] - ty);
          if (delta < bestY.delta) {
            bestY = { delta, adjust: topBasedAdjust(i, ty), line: ty };
          }
        }
      }

      if (bestX.delta <= ALIGN_THRESHOLD) {
        snapX = x + bestX.adjust;
        this.guideLineX = bestX.line;
      }
      if (bestY.delta <= ALIGN_THRESHOLD) {
        snapY = y + bestY.adjust;
        this.guideLineY = bestY.line;
      }

      snapX = Math.max(safeLeft, Math.min(snapX, safeRight - w));
      snapY = Math.max(safeTop, Math.min(snapY, safeBottom - h));
      return { x: snapX, y: snapY };
    },
    saveToLocal() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.elements));
      this.$message.success('草稿已保存到本机浏览器');
      this.dirty = false;
    },
    restoreFromLocal() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        this.elements = parsed.filter((e) => e && e.id && e.type).map((e) => migrateCanvasElement(e));
      } catch (_) {
        // ignore invalid local data
      }
    },
    clearCanvas() {
      this.$confirm('确认清空画布中的所有元素？', '提示', { type: 'warning' })
        .then(() => {
          this.elements = [];
          this.selectedId = null;
          this.selectedTableCell = null;
          this.selectedTableHeaderCol = null;
          this.guideLineX = null;
          this.guideLineY = null;
          this.dirty = false;
        })
        .catch(() => {});
    }
  }
};
</script>

<style scoped>
.designer-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 110px);
}

.designer-guide {
  flex-shrink: 0;
}

.designer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.toolbar-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.shortcut-hint {
  color: #6b7280;
}

.style-manage-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.designer-main {
  display: flex;
  gap: 12px;
  min-height: 0;
  flex: 1;
}

.toolbox {
  width: 268px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbox-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.toolbox-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 8px 8px 0;
}

.toolbox-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 10px 12px 12px;
}

.component-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.component-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
  cursor: pointer;
  font-size: 12px;
  color: #374151;
  transition: border-color 0.15s, background 0.15s;
}

.component-card:hover {
  border-color: #409eff;
  background: #ecf5ff;
  color: #409eff;
}

.tips-list {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
}

.tips-list li + li {
  margin-top: 4px;
}

.properties-empty {
  padding: 12px 0;
}

.selected-type-badge {
  display: inline-block;
  margin-bottom: 10px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 12px;
  font-weight: 600;
}

.layer-badge {
  margin-left: 4px;
}

.layer-badge :deep(.el-badge__content) {
  transform: translateY(-2px) scale(0.85);
}

.layer-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.layer-item:hover,
.layer-item.active {
  background: #f0f9ff;
  border-color: #bfdbfe;
}

.layer-name {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  min-width: 64px;
}

.layer-preview {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.toolbox-title {
  font-weight: 600;
  margin-bottom: 10px;
}

.tool-btn {
  width: 100%;
  margin: 0 0 8px 0;
}

.tips {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
  line-height: 1.5;
}

.table-editor {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}

.table-editor-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.table-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.canvas-area {
  flex: 1;
  min-width: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f5f6f8;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  flex-shrink: 0;
}

.canvas-meta {
  font-size: 12px;
  color: #6b7280;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.zoom-select {
  width: 88px;
}

.canvas-scroll {
  flex: 1;
  overflow: auto;
  padding: 14px;
}

.canvas-zoom-wrap {
  min-height: 1123px;
}

.canvas-empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  pointer-events: none;
}

.canvas-empty-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

.canvas-empty-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: #6b7280;
}

.empty-quick-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 10px;
  pointer-events: auto;
}

.canvas-empty .el-button--primary.is-link {
  pointer-events: auto;
}

.designer-statusbar {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  color: #6b7280;
}

.status-sep {
  margin: 0 6px;
  color: #d1d5db;
}

.a4-canvas {
  position: relative;
  width: 794px;
  height: 1123px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 1px 10px rgba(0, 0, 0, 0.08);
}

.safe-area {
  position: absolute;
  left: 32px;
  top: 32px;
  right: 32px;
  bottom: 32px;
  border: 1px dashed #d1d5db;
  pointer-events: none;
}

.measure-host {
  position: fixed;
  left: 0;
  top: 0;
  z-index: -1;
  width: max-content;
  max-width: none;
  height: auto;
  overflow: visible;
  pointer-events: none;
  opacity: 0;
}

.measure-span {
  display: inline-block;
  white-space: nowrap;
  line-height: 1.45;
  padding: 0;
  margin: 0;
}

.measure-block {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  overflow: visible;
}

.design-element {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed transparent;
  background: rgba(255, 255, 255, 0.7);
  cursor: move;
  user-select: none;
  padding: 4px 6px;
}

.design-element.is-flow-text {
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.design-element.is-flow-text .el-input-text,
.design-element.is-flow-text .el-textarea {
  user-select: text;
  -webkit-user-select: text;
}

.design-element.is-flow-text > .el-input-text,
.design-element.is-flow-text > .el-textarea {
  width: 100%;
  box-sizing: border-box;
}

.design-element.is-flow-text > .el-textarea {
  flex: 1 1 auto;
  min-height: 2.5em;
}

.design-element.is-flow-text > .el-input-text:not(:only-child) {
  flex: 0 0 auto;
  min-height: 1.6em;
  box-sizing: border-box;
  padding: 4px 6px;
}

.design-element.is-flow-text > .el-input-text:only-child {
  flex: 1 1 auto;
  min-height: 1.6em;
  align-self: stretch;
  box-sizing: border-box;
  padding: 4px 6px;
}

.design-element:hover,
.design-element.selected {
  border-color: #409eff;
}

.el-text {
  font-size: 14px;
  color: #111827;
  line-height: 1.4;
}

.el-subtext {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.el-input-text {
  width: 100%;
  border: none;
  outline: none;
  line-height: 1.45;
  background: transparent;
  color: #111827;
}

.el-input-text:focus {
  box-shadow: none;
}

.el-input-subtext {
  margin-top: 2px;
  color: #6b7280;
}

.el-textarea {
  width: 100%;
  min-height: 48px;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 6px 8px;
  outline: none;
  resize: none;
  background: #fff;
  color: #111827;
  line-height: 1.45;
  overflow-x: hidden;
  overflow-y: auto;
}

.typography-panel {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}

.typography-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.typography-sub {
  font-size: 12px;
  color: #64748b;
  margin: 8px 0 4px;
}

.typo-row {
  width: 100%;
  margin-bottom: 8px;
}

.typo-row-num {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.typo-row-num :deep(.el-input-number) {
  flex: 1;
}

.typo-label {
  font-size: 12px;
  color: #64748b;
  flex-shrink: 0;
}

.mini-table {
  width: 100%;
  height: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.mini-table.mini-table-fixed {
  table-layout: fixed;
  width: auto;
  height: auto;
}

.mini-table th,
.mini-table td {
  border: 1px solid #333;
  text-align: center;
  padding: 3px 2px;
}

.th-resize-host,
.td-resize-host {
  position: relative;
  overflow: visible;
  vertical-align: middle;
}

.col-resize-grip {
  position: absolute;
  top: 0;
  right: -5px;
  bottom: 0;
  width: 10px;
  cursor: col-resize;
  z-index: 5;
}

.col-resize-grip:hover {
  background: rgba(64, 158, 255, 0.12);
}

.header-row-resize-grip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -5px;
  height: 10px;
  cursor: ns-resize;
  z-index: 6;
}

.header-row-resize-grip:hover {
  background: rgba(64, 158, 255, 0.12);
}

.body-row-resize-grip {
  position: absolute;
  bottom: -5px;
  height: 10px;
  cursor: ns-resize;
  z-index: 5;
}

.body-row-resize-grip:hover {
  background: rgba(64, 158, 255, 0.12);
}

.table-canvas-wrap {
  position: relative;
  display: inline-block;
  vertical-align: top;
}

.table-edge-btn {
  position: absolute;
  z-index: 8;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #409eff;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.table-edge-add-col {
  right: -30px;
  top: 50%;
  transform: translateY(-50%);
}

.table-edge-add-row {
  left: 50%;
  bottom: -30px;
  transform: translateX(-50%);
}

.design-element.has-table {
  overflow: visible;
}

.design-element.has-image-el {
  padding: 0;
  overflow: hidden;
  background: #fff;
}

.image-element-inner {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.designer-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  background: #f3f4f6;
}

.img-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  background: #409eff;
  border: 1px solid #fff;
  border-radius: 2px 0 0 0;
  cursor: nwse-resize;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  z-index: 3;
}

.image-lib-panel {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.image-lib-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
  max-height: 220px;
  overflow-y: auto;
}

.lib-thumb-wrap {
  position: relative;
}

.lib-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  display: block;
}

.lib-thumb:hover {
  border-color: #409eff;
}

.lib-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
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

.underline-width-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.underline-width-num {
  flex: 1;
  min-width: 100px;
}

.align-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.table-editor-hint {
  margin-bottom: 8px;
  line-height: 1.45;
}

.table-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  text-align: center;
  box-sizing: border-box;
}

.th-resize-host .table-input,
.td-resize-host .table-input {
  max-height: 100%;
}

.table-header-input {
  font-weight: inherit;
}

.cell-selected {
  outline: 2px solid #22c55e;
  outline-offset: -2px;
}

.underline-only {
  width: 100%;
  height: 100%;
  border-bottom: 1px solid #111827;
}

.image-box {
  width: 100%;
  height: 100%;
  border: 1px dashed #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 12px;
}

.guide-line {
  position: absolute;
  background: #22c55e;
  z-index: 10;
  pointer-events: none;
}

.guide-line.vertical {
  width: 1px;
  top: 0;
  bottom: 0;
}

.guide-line.horizontal {
  height: 1px;
  left: 0;
  right: 0;
}

.delete-btn {
  position: absolute;
  right: -10px;
  top: -10px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
  padding: 0;
}
</style>
