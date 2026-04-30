import { describe, expect, it } from 'vitest';

import {
  ALLOWED_PERMISSION_KEYS,
  ALLOWED_PERMISSION_MODULES,
  KNOWN_ROLE_CODES,
  defaultPermissionsForRole,
  emptyPermissions,
  listPermissionSchema
} from './permissionSchema.js';
import { effectiveEmployeePermissions, mergePermissions } from './permissions.js';

describe('permissionSchema', () => {
  it('emptyPermissions 所有模块所有键均为 false', () => {
    const e = emptyPermissions();
    for (const m of ALLOWED_PERMISSION_MODULES) {
      const node = e[m];
      expect(node).toBeDefined();
      for (const k of ALLOWED_PERMISSION_KEYS[m]) {
        if (m === 'reports' && k === 'fieldEdit') {
          expect(node.fieldEdit).toEqual({});
          continue;
        }
        expect(node[k]).toBe(false);
      }
    }
  });

  it('defaultPermissionsForRole 内置角色至少能开出一些权限', () => {
    for (const r of KNOWN_ROLE_CODES) {
      const p = defaultPermissionsForRole(r);
      const someTrue = JSON.stringify(p).includes(':true');
      expect(someTrue).toBe(true);
    }
  });

  it('listPermissionSchema 仅暴露 key/label，不泄露默认值', () => {
    const items = listPermissionSchema();
    expect(items.length).toBeGreaterThan(0);
    for (const m of items) {
      expect(typeof m.key).toBe('string');
      expect(typeof m.label).toBe('string');
      for (const it of m.items) {
        expect(typeof it.key).toBe('string');
        expect(typeof it.label).toBe('string');
        expect(it.defaults).toBeUndefined();
      }
    }
  });
});

describe('effectiveEmployeePermissions', () => {
  it('内置 sales：类别 JSON 为空仍包含订单查询等默认权限', () => {
    const eff = effectiveEmployeePermissions({}, null, 'sales');
    expect(eff.order_management.order_query).toBe(true);
    expect(eff.order_management.order_input).toBe(true);
  });

  it('类别 JSON 中的 false 不撤销内置 sales 模板里已为 true 的权限（避免类别脏数据导致 JWT 与后台观感不一致）', () => {
    const eff = effectiveEmployeePermissions({ order_management: { order_query: false } }, null, 'sales');
    expect(eff.order_management.order_query).toBe(true);
    expect(eff.order_management.order_input).toBe(true);
  });

  it('用户 permissions_json 中的 false 不撤销销售模板中已为 true 的权限（模板保底 OR）', () => {
    const eff = effectiveEmployeePermissions({}, { order_management: { order_query: false } }, 'sales');
    expect(eff.order_management.order_query).toBe(true);
  });
});

describe('mergePermissions 安全裁剪', () => {
  it('丢弃未知模块', () => {
    const merged = mergePermissions(emptyPermissions(), { fooBar: { x: true }, reports: { list: true } });
    expect(merged.fooBar).toBeUndefined();
    expect(merged.reports.list).toBe(true);
  });

  it('丢弃未知操作键，但 reports.fieldEdit 保留为对象', () => {
    const merged = mergePermissions(emptyPermissions(), {
      reports: { list: true, mystery_action: true, fieldEdit: { product_name: true } }
    });
    expect(merged.reports.list).toBe(true);
    expect(merged.reports.mystery_action).toBeUndefined();
    expect(merged.reports.fieldEdit.product_name).toBe(true);
  });
});
