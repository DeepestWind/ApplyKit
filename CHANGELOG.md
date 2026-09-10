# 变更记录

本项目的重要变更记录在此文件中。版本号遵循语义化版本格式。

## [Unreleased]

### Added

- Chrome Manifest V3 本地履历、字段规则和投递记录管理。
- 通用表单以及 Moka、北森 Phoenix、飞书招聘 ATSX 专用适配器。
- 字段扫描、保守匹配、网页控件操作、回读校验和待处理清单。
- 虚构演示页面、110 个单元测试和 44 个 Playwright 扩展端到端测试。
- MIT 许可证、隐私说明、安全策略、贡献指南和 GitHub 项目模板。

### Changed

- 开发工具升级到 Vitest 5、Vite 8、esbuild 0.28、Playwright 1.63 和 TypeScript 7。
- 手动字段重试和整组经历绑定会等待最终异步校验完成后再返回。

### Security

- 生产构建仅使用 `activeTab`、`scripting` 和 `storage` 权限。
- 开发依赖审计结果为 0 个已知漏洞。
