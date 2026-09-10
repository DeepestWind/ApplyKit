# 投简助手 ApplyKit

一个 Chrome Manifest V3 扩展：维护一份本地履历，在招聘网页上批量填写表单，回读校验结果，修正不认识的字段并记住规则，同时管理投递记录。

**这个扩展不会替你提交申请。** 附件、声明、验证码和最终提交按钮一律交给你自己操作；只有在你确认「已手动提交并看到网站成功提示」之后，记录才会变成「已投递」。

运行时不调用任何模型、不连接服务器、没有账号。履历、规则和投递记录都保存在 `chrome.storage.local` 里。

---

## 1. 环境

- Node.js（开发时实测版本：**v24.9.0**）与随附的 npm 11.6.0
- Chrome（支持 Manifest V3 的版本即可）
- 自动化测试使用 Playwright 自带的 Chromium（实测 Playwright 1.63.0 / Chromium 153），不会修改你日常使用的 Chrome 配置

## 2. 复现步骤

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm run verify
```

```bash
npm run demo
```

`npm run verify` 依次执行类型检查、单元测试、生产构建、测试构建与真实扩展端到端测试。
`npm run demo` 在 `http://127.0.0.1:4173` 启动本地演示服务器，只提供 `demo/` 目录与两个明确虚构的样例文件。

## 3. 在 Chrome 中安装

1. 运行 `npm run build`，生成 `dist/`。
2. 打开 `chrome://extensions`，右上角开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目的 `dist/` 目录。
4. 点击工具栏上的「投简助手」图标即可打开弹窗。

生产包只申请三个权限：`activeTab`、`scripting`、`storage`。它没有 `<all_urls>`、`tabs`、`cookies`、`downloads` 等权限，因此**必须由你点击工具栏图标**来临时授权当前页面；跨站点跳转后需要重新点击。

## 4. 五分钟演示

先执行 `npm run demo`，然后：

1. 打开扩展工作台（弹窗里的「履历管理」），导入 `fixtures/profile.demo.json`。导入预览会明确标出这是**虚构资料**。
2. 打开 `http://127.0.0.1:4173/basic.html`，点击扩展图标 → 「一键填写」。观察页面右下角「页面实际接收到的数据」面板：数值来自演示页自己的事件监听器。
3. 打开 `http://127.0.0.1:4173/experience.html` 填写：两段教育各就各位，年月分开填写，第二段项目由扩展点击页面自己的「新增项目经历」按钮后填入。
4. 打开 `http://127.0.0.1:4173/edge-cases.html` 填写：「联系信箱入口」第一次是待处理；在结果页把它对应到「邮箱」并勾选记住；清空表单再次填写就会自动命中。
   打开 `http://127.0.0.1:4173/ats-style.html` 可以看到国内 ATS 的通用形态；`moka-style.html`、`beisen-style.html` 和 `feishu-style.html` 分别复刻 Moka、北森 Phoenix 与飞书招聘 ATSX 的重复经历和选择控件。
5. 同一页面上还能看到：日期精度不足、声明勾选、附件、iframe 等都停在待处理。
6. 在「投递记录」里核对公司与岗位后保存记录；在演示页点击「提交演示申请」，看到页面自己的成功提示后，再回到扩展点击「我已手动提交并看到成功提示」。
7. 在记录页筛选状态、修改下一步、导出 CSV；在「备份」页导出完整备份。

## 5. 修改代码后如何重新加载

```bash
npm run build
```

然后在 `chrome://extensions` 点击该扩展的「重新加载」，并**刷新目标招聘页面**（内容脚本需要重新注入）。开发时也可以用 `npm run dev` 持续构建，但它不会自动刷新 Chrome。

不要反复卸载重装：保持同一个安装目录和扩展身份，本地数据才不会丢。

## 6. 数据与备份

- 全部数据保存在扩展的本地存储里，**卸载扩展会一并删除**。
- 工作台「备份」页可以导出完整备份（明文 JSON，保存在你自己的电脑上，不上传任何地方），也可以整库恢复。
- 投递记录还支持 CSV 导出/导入（UTF-8 BOM、CRLF，以 `= + - @` 开头的单元格会加保护前缀，防止表格软件当公式执行）。
- 数据接近 7 MiB 时扩展会拒绝继续写入并提示导出整理，而不是悄悄丢数据。
- 导入文件分「履历文件」「投递 CSV」「完整备份」三个入口；任何校验失败都不会改动已有数据。

## 7. 运行测试

| 命令 | 作用 |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest 单元测试（110 个） |
| `npm run build` | 生产构建，并校验 manifest 引用与权限 |
| `npm run build:e2e` | 生成 `.test-dist/`（仅测试用，额外带 loopback host 权限） |
| `npx playwright install chromium` | 首次安装或升级 Playwright 后下载匹配的测试浏览器 |
| `npm run test:e2e` | Playwright 真实扩展端到端测试（44 个） |
| `npm run diagnose` | 构建并提供只读兼容性诊断包，用于分析真实招聘页面（不进入 `dist/`） |
| `npm run verify` | 以上全部按顺序执行 |

测试结果与性能数据见 [docs/DEMO-ACCEPTANCE.md](docs/DEMO-ACCEPTANCE.md)。

## 8. 已知限制

- 真实网站已核验 Moka、北森和飞书招聘的页面结构与实际写入，并分别建立专用适配器与本地回归。详见 [docs/SITE-COMPATIBILITY.md](docs/SITE-COMPATIBILITY.md)。
- 只处理当前标签页的顶层文档。iframe 内的表单、Shadow DOM、虚拟滚动下拉、未专门验证的多级联动、富文本编辑器都只会被列为待处理。
- 自定义下拉：支持有 ARIA 关系的 combobox，也支持没有任何 ARIA、点开后在自己容器里渲染选项的那种（国内 ATS 常见）。做法都是「点开 → 精确唯一匹配 → 点击 → 回读确认」，匹配不上就恢复原样并报告，不会硬填。
- Moka、北森与飞书招聘的已验证日期选择器可自动点选；北森省市弹窗和飞书树形地区下拉可按区县到城市的安全粒度搜索并回读。飞书还支持候选城市列表与岗位选项取唯一精确交集、动态经历和自我评价展开。其它未知日历、多级联动和虚拟滚动长列表仍保持待处理。
- 「新增经历」只点击站点适配器明确提供的按钮；通用模式不会自己去找任何「添加」按钮。
- 身份证号、精确住址、健康状况、政治面貌、家庭联系人等字段不在履历模型里，网页上出现时一律进入待处理。出生日期虽然可以保存，但默认需要你逐项确认，不会自动填写。
- 标记为虚构（`source.status = fictional`）的履历只能在 `127.0.0.1` / `localhost` 的演示页面上填写。
- 端到端测试用 Playwright 的独立 Chromium 运行；**通过工具栏点击触发 activeTab 的路径没有自动化测试**，需要人工按第 3 节步骤验证。
- 本地存储不是加密保险箱，完整备份是明文文件。

## 9. 目录

```text
public/       manifest 与扩展页面（HTML/CSS）
src/shared/   数据模型、Zod 校验、匹配、日期、URL、CSV
src/background/  唯一持久化写入口、计划生成、运行协调
src/content/  页面扫描、控件操作、回读校验、站点适配器
src/ui/       弹窗与工作台
demo/         本地演示招聘页面（含通用、Moka、北森与飞书结构；状态由页面自己的事件维护）
fixtures/     虚构履历与投递记录样例，以及无效输入测试集
tests/        单元测试与真实扩展端到端测试
docs/         计划、实现状态、验收记录、站点兼容性
```

## 10. 隐私、安全与贡献

- [PRIVACY.md](PRIVACY.md)：本地数据、页面访问和浏览器权限说明。
- [SECURITY.md](SECURITY.md)：安全边界与私密漏洞报告方式。
- [CONTRIBUTING.md](CONTRIBUTING.md)：开发流程、测试要求和站点适配规范。
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)：社区协作行为准则。
- [CHANGELOG.md](CHANGELOG.md)：版本变更记录。

## 11. 许可与来源

本项目采用 [MIT License](LICENSE)。项目从零实现，没有复制其他项目的代码。唯一的运行时依赖是 [zod](https://github.com/colinhacks/zod)（MIT），其许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，并随生产构建一起分发。

Moka、北森、飞书招聘、蔚来、科大讯飞及其他文档中出现的产品和公司名称归各自权利人所有，仅用于描述兼容性测试。ApplyKit 与这些公司或产品没有隶属、授权或背书关系。
