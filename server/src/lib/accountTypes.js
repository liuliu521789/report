/** 使用员工类别 + permissions_json 的账号（非超级管理员） */
export function isPermissionedStaffType(accountType) {
  return accountType === 'employee' || accountType === 'manager';
}
