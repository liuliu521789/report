import { h } from 'vue';
import { ElCheckbox } from 'element-plus';
import SalesStatusPill from '../components/SalesStatusPill.vue';

/** 虚拟列表列宽按容器等比缩放，避免横向滚动 */
export function scaleOrdersV2Columns(cols, containerWidth) {
  if (!cols?.length || !containerWidth || containerWidth <= 0) return cols;
  const baseWidths = cols.map((c) => Math.max(40, Number(c.width) || 72));
  const sum = baseWidths.reduce((a, b) => a + b, 0);
  const scale = containerWidth / sum;
  return cols.map((c, i) => ({
    ...c,
    width: Math.max(40, Math.floor(baseWidths[i] * scale))
  }));
}

/**
 * 构建订单 TableV2 列定义。
 * ctx 由 SalesOrders 传入，避免列渲染与页面状态强耦合。
 */
export function buildOrdersV2Columns(ctx) {
  const {
    showOrderRowSelection,
    orderListColVisible,
    customerListNameMode,
    orderListFieldDefinitions,
    v2SelectedIds,
    orderRowSelectable,
    onV2RowPick,
    openLogs,
    formatDateTime,
    orderListColumnTitle,
    isCustomerNameColumn,
    renderCustomerNameColumnHeader,
    displayCustomerNameCell,
    displayCell,
    buildOrderRowActionNodes
  } = ctx;

  const nameMode = customerListNameMode;
  const cols = [];

  if (showOrderRowSelection) {
    cols.push({
      key: '__pick',
      dataKey: 'id',
      title: '',
      width: 40,
      align: 'center',
      cellRenderer: ({ rowData }) =>
        h(ElCheckbox, {
          size: 'small',
          modelValue: v2SelectedIds.includes(rowData.id),
          disabled: !orderRowSelectable(rowData),
          'onUpdate:modelValue': (v) => onV2RowPick(rowData, !!v)
        })
    });
  }

  if (orderListColVisible.orderNo) {
    cols.push({
      key: 'order_no',
      dataKey: 'order_no',
      title: '订单号',
      width: 96,
      align: 'center',
      cellRenderer: ({ rowData }) =>
        h('span', { class: 'v2-cell-txt', title: rowData.order_no || '' }, rowData.order_no || '—')
    });
  }

  cols.push({
    key: 'status',
    dataKey: 'status',
    title: '状态',
    width: 120,
    align: 'center',
    cellRenderer: ({ rowData }) =>
      h(SalesStatusPill, {
        kind: 'order',
        orderRow: rowData,
        clickable: true,
        onClick: () => openLogs(rowData)
      })
  });

  if (orderListColVisible.shipper) {
    cols.push({
      key: 'shipper',
      dataKey: 'shipped_by_name',
      title: '发货人',
      width: 72,
      align: 'center',
      cellRenderer: ({ rowData }) =>
        h(
          'span',
          { class: 'v2-cell-txt', title: rowData.shipped_by_name || '' },
          rowData.shipped_by_name || '—'
        )
    });
  }

  if (orderListColVisible.sales) {
    cols.push({
      key: 'sales',
      dataKey: 'created_by_username',
      title: '销售',
      width: 64,
      align: 'center',
      cellRenderer: ({ rowData }) =>
        h(
          'span',
          { class: 'v2-cell-txt', title: rowData.created_by_username || '' },
          rowData.created_by_username || '—'
        )
    });
  }

  if (orderListColVisible.uploadedAt) {
    cols.push({
      key: 'uploaded',
      dataKey: 'created_at',
      title: '上传日期',
      width: 100,
      align: 'center',
      cellRenderer: ({ rowData }) => h('span', { class: 'v2-cell-txt' }, formatDateTime(rowData.created_at))
    });
  }

  for (const col of orderListFieldDefinitions) {
    const key = col.field_key;
    if (isCustomerNameColumn(col)) {
      cols.push({
        key: `${key}-${nameMode}`,
        dataKey: key,
        width: 108,
        align: 'center',
        headerCellRenderer: () => renderCustomerNameColumnHeader(col),
        cellRenderer: ({ rowData }) => {
          const text = displayCustomerNameCell(rowData, col);
          return h('span', { class: 'v2-cell-txt', title: text === '—' ? '' : String(text) }, text);
        }
      });
      continue;
    }
    cols.push({
      key,
      dataKey: key,
      title: `${col.required ? '*' : ''}${orderListColumnTitle(col)}`,
      width: 72,
      align: 'center',
      cellRenderer: ({ rowData }) => {
        const text = displayCell(rowData, key);
        return h('span', { class: 'v2-cell-txt', title: text === '—' ? '' : String(text) }, text);
      }
    });
  }

  cols.push({
    key: 'actions',
    dataKey: 'id',
    title: '操作',
    width: 88,
    align: 'center',
    cellRenderer: ({ rowData }) => {
      const chunks = buildOrderRowActionNodes(rowData);
      return h(
        'div',
        { class: 'orders-v2-actions' },
        chunks.map((node, i) => h('span', { key: i, class: 'orders-v2-actions__btn' }, [node]))
      );
    }
  });

  return cols;
}
