# 权限与角色高级命令 (rbac-advanced)

本文档覆盖权限与角色相关的高级 / 写命令。基础查询见 `rbacPrivilegeCurrentList` / `rbacRoleCurrentList`。

## 命令清单

- `rbacPrivilegeCurrentList`（POST，none，**只读**）：当前账号权限。
- `rbacPrivilegeList`（POST，body，**只读**）：分页查询权限。
- `rbacPrivilegeAssignPrivileges`（POST，body，**写**）：分配权限。
- `rbacRoleCurrentList`（POST，none，**只读**）：当前账号角色。
- `rbacRoleAssignRoles`（POST，body，**写**）：分配角色。

## 写操作提醒

- 权限和角色分配是危险操作，必须传 `confirm=true` 才会真正执行。
- 分配前建议先调用 `*CurrentList` 或 `rbacPrivilegeList` / `rbacRoleCurrentList` 拿到目标对象 ID。

## 常见使用模式

### 查看当前账号权限

```bash
alpha rbacPrivilegeCurrentList
alpha rbacRoleCurrentList
```

### 分配权限 / 角色

```bash
alpha rbacRoleAssignRoles --body '{"userId":1001,"roleIds":[1,2]}' --confirm true
alpha rbacPrivilegeAssignPrivileges --body '{"roleId":1,"privilegeIds":[101,102]}' --confirm true
```
