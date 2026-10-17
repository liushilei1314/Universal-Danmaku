# 通用弹幕播放器 Universal Danmaku

一个 Tampermonkey / Violentmonkey 用户脚本：在**任意网页视频**上叠加弹幕。可以导入本地弹幕文件，也可以从 Bilibili、弹弹play 弹幕库在线加载。功能参考 [dandanplay](https://www.dandanplay.com/)。

> 状态：早期版本（v0.1.0），欢迎提 Issue 和 PR。

## 功能

- **适用于任意视频**：自动识别页面中最大的 `<video>`，用 Canvas 叠加弹幕层，支持全屏。
- **三种弹幕**：滚动、顶部、底部，带轨道避让，不会重叠。
- **与播放进度严格同步**：弹幕位置由视频当前时间计算，暂停、拖动进度条、倍速播放都正确。
- **多种弹幕来源**
  - 导入文件：Bilibili XML、弹弹play JSON
  - Bilibili 在线加载：BV号 / 视频链接（支持 `?p=2` 分P）/ cid
  - 弹弹play 弹幕库：按作品名搜索，选择剧集加载
- **显示设置**：透明度、字号、速度、显示区域、时间偏移（对轴）、按类型开关、屏蔽词（支持正则）。
- **自动记忆**：每个页面加载过的弹幕会保存在本地，下次打开自动恢复。
- **快捷键**：`Alt + D` 显示/隐藏弹幕。

## 安装

1. 安装用户脚本管理器：[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 安装脚本：打开仓库中的 `universal-danmaku.user.js`，点击 **Raw**，管理器会弹出安装确认。
3. 打开任意有视频的网页，视频右上角会出现一个半透明的「弹」字按钮。

> 如果使用 Chrome / Edge，请确认已在扩展管理页开启「开发者模式」（新版 Tampermonkey 对此有要求）。

## 使用方法

点击视频右上角的「弹」按钮打开面板。

### 导入弹幕文件

在「导入文件」中选择 `.xml` 或 `.json` 文件。

| 格式 | 说明 |
| --- | --- |
| Bilibili XML | `<d p="时间,模式,字号,颜色,...">文本</d>`。B站、弹弹play 导出的 XML，以及大多数弹幕下载工具的输出都是这种格式 |
| 弹弹play JSON | `{"comments":[{"p":"时间,模式,颜色,uid","m":"文本"}]}`，也可以是 `{p, m}` 对象组成的数组 |

爱奇艺、腾讯、优酷等站点的弹幕，只要用其他工具转换成上述任一格式，就可以导入。

### 加载 Bilibili 弹幕

在 Bilibili 输入框中填写 BV号、视频链接或 cid，点击「加载」。分P视频请使用带 `?p=N` 的链接。

注意：该接口返回的是当前弹幕池，数量可能少于视频的全部历史弹幕。

### 使用弹弹play 弹幕库

1. 前往 [弹弹play 开放平台](https://doc.dandanplay.com/) 申请 **AppId** 和 **AppSecret**。
2. 在面板的「弹弹play API 凭证」中填入。凭证只保存在你的浏览器本地，请求签名由脚本在本地完成。
3. 输入作品名并搜索（搜索框会根据页面标题预填），点击结果中的某一集即可加载。

### 对轴

如果弹幕与画面不同步，用「偏移」里的 `-1 / -0.5 / +0.5 / +1` 按钮调整，单位为秒。正数表示弹幕提前出现。

### 屏蔽词

每行一个关键词。用 `/` 包裹表示正则，例如 `/第[一二三]/i`。


## 隐私

脚本只会在你主动操作时向 `api.bilibili.com`、`api.dandanplay.net` 发送请求，不收集也不上传任何使用数据。

## 许可

本项目的源代码采用 [MIT License](https://opensource.org/license/mit) 授权。你可以自由地使用、复制、修改、合并、发布、再许可及销售本项目的源代码或其副本，前提是保留原有的版权声明和许可声明。

本项目按“现状”（`AS IS`）提供，不提供任何明示或默示的保证；作者或版权持有人不对因使用本项目而产生的索赔、损害或其他责任负责。

MIT License 不涵盖以下内容：

- 通过本脚本加载、导入或显示的弹幕、视频及其他第三方内容；相关版权归其原作者或权利人所有。
- Bilibili、弹弹play 等第三方平台的接口、商标、服务条款及其返回的数据；使用时请遵守相应平台的规则。
- 你使用本项目新增的代码、素材或服务；这些内容应遵循其各自适用的许可或条款。

完整许可文本如下：

```text
MIT License

Copyright (c) Universal Danmaku contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 致谢

- [dandanplay](https://www.dandanplay.com/) 及其开放平台
