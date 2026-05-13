# 远程调用 DeepSeek 与千问 API 密钥复现指南

本文档记录本项目如何把前端请求接到云端 API，再由云端后端安全读取两个模型密钥：

- DeepSeek：用于长期记忆训练的旧物件题目生成。
- 千问 / DashScope：用于长期记忆训练的图片生成。

云端 API 地址建议通过环境变量配置，不要把真实服务器地址写进公开仓库。示例：

```text
https://your-domain.example/api
```

## 1. 总体架构

推荐架构如下：

```text
浏览器前端
  -> https://your-domain.example/api/...
  -> 云端 Node/Express 后端
  -> 从云端环境变量读取密钥
  -> 调用 DeepSeek / 千问
```

关键原则：

- API 密钥只放在后端环境变量里。
- 前端永远不要直接保存或打包密钥。
- 前端只调用你自己的云端 API。
- 云端后端负责代理模型调用、超时控制、降级兜底和日志脱敏。

## 2. 本项目已接入的位置

前端统一请求入口：

```text
client/src/utils/api.ts
```

默认请求地址：

```ts
const DEFAULT_API_BASE = '/api';
```

部署到独立 API 域名时，可以用环境变量覆盖：

```text
VITE_API_BASE_URL=https://your-domain.example/api
```

后端模型调用入口：

```text
server/src/routes/memory.js
```

其中：

- `getDeepSeekApiKey()` 读取 `DEEPSEEK_API_KEY`
- `getQwenApiKey()` 读取 `DASHSCOPE_API_KEY` / `QWEN_API_KEY`
- `/api/memory/generate-item` 调 DeepSeek
- `/api/memory/generate-image` 调千问 / DashScope

## 3. 本地环境变量准备

在本机或 CI 中准备两个密钥：

```powershell
$env:DEEPSEEK_API_KEY = "你的 DeepSeek Key"
$env:DASHSCOPE_API_KEY = "你的 DashScope / 千问 Key"
```

如果你的千问密钥变量名习惯用 `QWEN_API_KEY`，后端也支持：

```powershell
$env:QWEN_API_KEY = "你的千问 Key"
```

本项目读取顺序：

```text
DeepSeek:
  DEEPSEEK_API_KEY

千问 / DashScope:
  DASHSCOPE_API_KEY
  QWEN_API_KEY
  DASH_API_KEY
```

## 4. 云端环境变量文件

云端使用 systemd 的 `EnvironmentFile`：

```text
/etc/silvermind.env
```

示例内容，不要把真实密钥提交到 Git：

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
SILVERMIND_DATA_DIR=/var/lib/silvermind

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TEXT_MODEL=deepseek-v4-flash
DEEPSEEK_TEXT_TIMEOUT_MS=12000

DASHSCOPE_API_KEY=
DASHSCOPE_REGION_BASE_URL=https://dashscope.aliyuncs.com
QWEN_IMAGE_MODEL=wan2.6-t2i
QWEN_IMAGE_SIZE=1280*1280
```

权限建议：

```bash
sudo chown www-data:www-data /etc/silvermind.env
sudo chmod 600 /etc/silvermind.env
```

## 5. systemd 服务

本项目云端服务文件：

```text
/etc/systemd/system/silvermind.service
```

参考配置：

```ini
[Unit]
Description=SilverMind API
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/silvermind/current/server
EnvironmentFile=/etc/silvermind.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启用和重启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable silvermind.service
sudo systemctl restart silvermind.service
sudo systemctl status silvermind.service
```

## 6. nginx 反向代理

本项目把公网 `/api/` 转发到本机后端：

```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
```

检查并 reload：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 验证命令

健康检查：

```bash
curl -i https://your-domain.example/api/health
```

DeepSeek 文本生成：

```bash
curl -sS https://your-domain.example/api/memory/generate-item
```

成功时响应里应看到：

```json
{
  "source": "deepseek"
}
```

千问图片生成：

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -d '{"prompt":"vintage Chinese enamel mug, single object, photorealistic, no text, no watermark"}' \
  https://your-domain.example/api/memory/generate-image
```

成功时响应里应看到：

```json
{
  "source": "qwen-wan-sync",
  "imageUrl": "https://..."
}
```

如果图片接口失败，后端会返回本地占位图，`source` 会类似：

```text
local-placeholder-after-qwen-error
```

此时查看日志：

```bash
sudo journalctl -u silvermind.service -n 100 --no-pager
```

## 8. 其它项目复现步骤

1. 在其它项目中新增一个后端代理服务，不要让前端直接调 DeepSeek 或千问。
2. 后端从环境变量读取密钥，例如 `process.env.DEEPSEEK_API_KEY`。
3. 前端只配置自己的后端地址，例如 `VITE_API_BASE_URL=https://your-domain/api`。
4. 后端实现两个接口：
   - `/api/ai/text`：调用 DeepSeek。
   - `/api/ai/image`：调用千问 / DashScope。
5. 云端用 systemd 或容器注入环境变量。
6. nginx 把公网 `/api/` 反代到后端服务端口。
7. 用 `curl` 验证健康检查、文本接口、图片接口。
8. 确认日志中不输出完整密钥。

## 9. 安全注意事项

- 不要把 `.env`、真实密钥、临时上传密钥文件提交到 Git。
- 临时传输密钥后，删除 `/tmp/*.env`。
- `EnvironmentFile` 使用 `600` 权限。
- 后端日志只记录错误摘要，不打印 `Authorization` header。
- 生产环境建议限制 CORS 来源，不要长期使用完全开放的 `Access-Control-Allow-Origin: *`。
- 如果前端部署在 HTTPS 域名下，API 也建议使用 HTTPS，避免浏览器 mixed content。
