import { h } from 'vue';
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElTooltip } from 'element-plus';
import {
  CircleCheck,
  CircleClose,
  CloseBold,
  Delete,
  Document,
  Edit,
  MoreFilled,
  Promotion,
  RefreshLeft,
  Select,
  Van
} from '@element-plus/icons-vue';
import { perm } from './permissions';
import { splitOrderRowActions } from './orderRowActionSplit';

export function createOrderActionIconBtn({ tooltip, icon, type = 'default', plain = true, className = '', onClick }) {
  const btn = h(
    ElButton,
    {
      size: 'small',
      circle: true,
      type,
      plain,
      class: className,
      onClick
    },
    {
      default: () => h(ElIcon, null, { default: () => h(icon) })
    }
  );
  return h(
    ElTooltip,
    { content: tooltip, placement: 'top' },
    { default: () => h('span', { class: 'orders-action-btn-host' }, [btn]) }
  );
}

/**
 * 收集单行可用操作（不含 UI）。
 * handlers 由页面传入，避免与 Options API 实例强耦合。
 */
export function collectSalesOrderRowActions(row, handlers) {
  if (!row) return [];
  const actions = [];
  const push = (action) => actions.push(action);
  const {
    canFinanceReview,
    canQcReview,
    canSubmit,
    canWithdrawSubmit,
    canShip,
    canComplete,
    canEdit,
    canCancel,
    canDelete,
    approveSingle,
    rejectSingle,
    approveSingleQc,
    rejectSingleQc,
    submitSingle,
    withdrawReview,
    openShip,
    doComplete,
    openEdit,
    openGenerateReport,
    doCancel,
    doDeleteRow
  } = handlers;

  if (perm('order_management', 'order_status_finance') && canFinanceReview(row)) {
    push({
      key: 'finance_approve',
      label: '通过',
      tooltip: '通过',
      icon: Select,
      type: 'success',
      plain: false,
      priority: 10,
      onClick: () => approveSingle(row)
    });
    push({
      key: 'finance_reject',
      label: '驳回',
      tooltip: '驳回',
      icon: CloseBold,
      type: 'danger',
      plain: false,
      priority: 11,
      onClick: () => rejectSingle(row)
    });
  }
  if (perm('order_management', 'order_status_qc') && canQcReview(row)) {
    push({
      key: 'qc_approve',
      label: '品管通过',
      tooltip: '审核通过',
      icon: CircleCheck,
      type: 'success',
      plain: false,
      priority: 12,
      onClick: () => approveSingleQc(row)
    });
    push({
      key: 'qc_reject',
      label: '品管驳回',
      tooltip: '品管驳回',
      icon: CircleClose,
      type: 'danger',
      plain: false,
      priority: 13,
      onClick: () => rejectSingleQc(row)
    });
  }
  if (perm('order_management', 'order_submit') && canSubmit(row)) {
    push({
      key: 'submit',
      label: '提交审核',
      tooltip: '提交审核',
      icon: Promotion,
      type: 'primary',
      plain: false,
      priority: 15,
      onClick: () => submitSingle(row)
    });
  }
  if (canWithdrawSubmit(row)) {
    push({
      key: 'withdraw',
      label: '撤回审核',
      tooltip: '撤回审核申请',
      icon: RefreshLeft,
      type: 'warning',
      plain: true,
      priority: 16,
      onClick: () => withdrawReview(row)
    });
  }
  if (canShip(row)) {
    push({
      key: 'ship',
      label: '发货',
      tooltip: '发货',
      icon: Van,
      type: 'primary',
      plain: true,
      priority: 20,
      onClick: () => openShip(row)
    });
  }
  if (perm('order_management', 'order_status_finance') && canComplete(row)) {
    push({
      key: 'complete',
      label: '完结',
      tooltip: '财务确认订单完结',
      icon: CircleCheck,
      type: 'success',
      plain: true,
      priority: 22,
      onClick: () => doComplete(row)
    });
  }
  if (perm('order_management', 'order_edit') && canEdit(row)) {
    push({
      key: 'edit',
      label: '编辑',
      tooltip: '编辑',
      icon: Edit,
      type: 'primary',
      plain: true,
      priority: 25,
      onClick: () => openEdit(row)
    });
  }
  if (perm('reports', 'create')) {
    push({
      key: 'report',
      label: '生成报告',
      tooltip: '生成报告',
      icon: Document,
      type: 'success',
      plain: true,
      priority: 40,
      onClick: () => openGenerateReport(row)
    });
  }
  if (perm('order_management', 'order_cancel') && canCancel(row)) {
    push({
      key: 'cancel',
      label: '取消订单',
      tooltip: '取消订单',
      icon: CircleClose,
      type: 'warning',
      plain: true,
      priority: 45,
      onClick: () => doCancel(row)
    });
  }
  if (perm('order_management', 'order_delete') && canDelete(row)) {
    push({
      key: 'delete',
      label: '删除',
      tooltip: '删除',
      icon: Delete,
      type: 'danger',
      plain: true,
      priority: 50,
      divided: true,
      onClick: () => doDeleteRow(row)
    });
  }
  return actions.sort((a, b) => a.priority - b.priority);
}

export function splitSalesOrderRowActions(row, profile, handlers) {
  const all = collectSalesOrderRowActions(row, handlers);
  return splitOrderRowActions(all, profile);
}

export function buildOrderRowActionNodes(row, { profile, handlers, onMenuCommand }) {
  const { primary, secondary } = splitSalesOrderRowActions(row, profile, handlers);
  const nodes = primary.map((act) =>
    createOrderActionIconBtn({
      tooltip: act.tooltip,
      icon: act.icon,
      type: act.type,
      plain: act.plain,
      onClick: act.onClick
    })
  );
  if (secondary.length) {
    nodes.push(
      h(
        ElDropdown,
        {
          trigger: 'click',
          onCommand: (key) => onMenuCommand(row, key)
        },
        {
          default: () =>
            h('span', { class: 'orders-action-btn-host' }, [
              h(
                ElButton,
                { size: 'small', circle: true, plain: true, title: '更多操作' },
                { default: () => h(ElIcon, null, { default: () => h(MoreFilled) }) }
              )
            ]),
          dropdown: () =>
            h(
              ElDropdownMenu,
              null,
              {
                default: () =>
                  secondary.map((act) =>
                    h(
                      ElDropdownItem,
                      { command: act.key, divided: act.divided },
                      { default: () => act.label }
                    )
                  )
              }
            )
        }
      )
    );
  }
  return nodes;
}
