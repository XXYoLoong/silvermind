# SilverMind

SilverMind 是一个面向适老化认知训练场景的互动训练系统，包含长期记忆训练、实体立体迷宫训练和方步训练三个模块。前端使用 React + Vite，后端使用 Node.js + Express，并通过后端代理安全调用 DeepSeek 与千问 / DashScope。

## 功能

- 长期记忆训练：生成旧物件题目、图片、提示线索与语音播报。
- 实体立体迷宫：检测路径并播放小球执行效果。
- 方步训练：生成训练路径、记录计时和正确率。
- 训练记录：本地 JSON 数据存储，便于演示和轻量部署。

## 本地运行

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

前端默认通过 `/api` 访问后端；本地 Vite 代理默认转发到 `http://localhost:3001`。如需连接自己的云端服务，请在私有环境变量中设置：

```text
VITE_API_BASE_URL=https://your-domain.example/api
```

## API 密钥

模型密钥只允许放在后端运行环境中，不要提交到 Git。可参考 `.env.example` 配置：

```text
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
```

更详细的远程调用复现步骤见 `REMOTE_API_KEYS.md`。

## 开源协议

本项目使用木兰宽松许可证第 2 版（Mulan PSL v2），SPDX 标识为 `MulanPSL-2.0`。完整协议见 `LICENSE`。
