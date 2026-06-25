# 迭代与版本高级命令 (iter-advanced)

本文档覆盖迭代管理、版本变更、hotfix、提测相关的高级 / 写命令。基础查询见 `iterVersionList` / `iterHotfixList` / `iterGetTree`。

## 写命令（必须传 `confirm=true`）

### 版本变更

- `iterVersionAdd`：新增版本。
- `iterVersionEdit`：编辑版本。
- `iterVersionDelete`：删除版本。
- `iterVersionDisable`：禁用版本（封板）。
- `iterVersionMergeHis`：合并历史版本。

### 资源 URL 切换

- `iterVersionSwitchAz2resourceUrl`：AZ 切到资源 URL。
- `iterVersionSwitchGflow2resourceUrl`：Gflow 切到资源 URL。
- `iterVersionSwitchEnvInit2resourceUrl`：环境初始化切到资源 URL。
- `iterVersionSwitchUdf2resourceUrl`：UDF 切到资源 URL。

### Hotfix

- `iterHotfixSave`：保存 hotfix。
- `iterHotfixMerge`：合并 hotfix。

### 提测

- `iterVersionTestVersionSave`：保存提测单。
- `iterVersionTestVersionSubmit`：提交提测单。

### 产品 / 项目

- `iterProdAdd`：新增产品。
- `iterProjectAdd`：新增项目。
- `iterProjectDelete`：删除项目。

## 常见使用模式

### 查版本树与详情

```bash
alpha iterGetTree                                                     # 产品/项目树
alpha iterVersionList --body '{"page":1,"count":20}'                  # 版本分页
alpha iterVersionDetail --body '{"id":1001}'                          # 版本详情
alpha iterVersionTagList                                              # 热门 tag
alpha iterVersionGetTree                                              # 版本树
```

### 新建 / 编辑 / 封板 / 删除版本

```bash
alpha iterVersionAdd --body '{"name":"v1.0.0","productId":153}' --confirm true
alpha iterVersionEdit --body '{"id":1001,"name":"v1.0.1"}' --confirm true
alpha iterVersionDisable --body '{"id":1001}' --confirm true
alpha iterVersionDelete --body '{"id":1001}' --confirm true
```

### 提测

```bash
alpha iterVersionTestVersionSave --body '{"versionId":1001,"title":"smoke"}' --confirm true
alpha iterVersionTestVersionList --body '{"versionId":1001}'           # 列提测单
alpha iterVersionTestVersionDetail --body '{"id":2001}'                # 提测单详情
alpha iterVersionTestVersionSubmit --body '{"id":2001}' --confirm true
alpha iterVersionTestVersionCount --body '{"versionId":1001}'          # 提测单数量
alpha iterVersionGetRecentTestSubmitted                               # 最近提测
```

### Hotfix

```bash
alpha iterHotfixSave --body '{"versionId":1001,"title":"hotfix-1"}' --confirm true
alpha iterHotfixList --body '{"versionId":1001}'                       # 查 hotfix
alpha iterHotfixDetail --body '{"id":3001}'                            # hotfix 详情
alpha iterHotfixMerge --body '{"id":3001}' --confirm true             # 合并 hotfix
```
