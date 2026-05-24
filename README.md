# 漂流瓶 uTools 插件

一个不依赖服务器的简洁漂流瓶插件，数据直接落在 GitHub Issues。

## 已实现功能

- 丢出漂流瓶
- 打捞漂流瓶
- 评论
- 回复评论
- 规则限制：必须先丢过至少 1 个瓶子，才允许打捞

## 数据设计

- `Issue` 表示一个漂流瓶
- `Issue Comment` 表示评论或回复
- 瓶子正文用 `<!-- drift-bottle -->` 做标记，避免和仓库里的其他 Issue 混在一起
- 回复用 `<!-- drift-reply-to:评论ID -->` 做轻量关联

## 使用方式

1. 新建一个 GitHub 仓库，公开或私有都可以。
2. 创建一个 GitHub Personal Access Token。
3. Token 至少给这个仓库的 `Issues` 读写权限。
4. 打开 uTools 开发者工具，导入本目录里的 `plugin.json`。
5. 进入插件后，填写：
   - 仓库拥有者
   - 仓库名
   - GitHub Token

## 开发说明

- 插件入口：[plugin.json](D:/java/sub2ap/plugin.json)
- 页面入口：[index.html](D:/java/sub2ap/index.html)
- 样式文件：[style.css](D:/java/sub2ap/style.css)
- 逻辑文件：[script.js](D:/java/sub2ap/script.js)

## 注意

- 因为底层是 GitHub API，发言会携带 GitHub 用户名。
- 当前实现为了简单，打捞时优先捞别人的瓶子；如果海里只有你自己的瓶子，会允许捞自己的内容做测试。
- 本地配置优先使用 `utools.dbStorage` 保存；如果你直接在浏览器里打开页面，则回退到 `localStorage`。
