# Chrome Usage Tracker

基于 Chrome 扩展的浏览器使用统计工具，通过监听标签页事件估算使用时长和页面资源流量。

## 功能

- 按日/周/月统计浏览器使用时长
- 估算页面资源流量（基于 Performance API）
- 按域名排行，查看常用网站和流量消耗
- WebDAV 同步（支持坚果云等）
- 数据存储在本机 IndexedDB，不上传第三方

## 技术栈

- React 19 + ECharts 6
- Vite 6 构建
- Chrome Extension Manifest V3
- IndexedDB 本地存储

## 开发

```bash
npm install
npm run dev      # 启动 Vite 开发服务器
npm run build    # 构建插件
```

## 安装到 Chrome

1. `npm run build`
2. Chrome 打开 `chrome://extensions/`
3. 开启"开发者模式"
4. "加载已解压的扩展程序"，选择 `dist/` 目录
