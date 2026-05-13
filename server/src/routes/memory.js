import { Router } from 'express';
import db from '../db/database.js';

const router = Router();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 旧物件描述
const ITEMS = [
  { name: '缝纫机', answerKeywords: ['缝纫机', '脚踏缝纫机'], description: '一种用来缝合布料的机器，通常有脚踏板，铁制机身上有针和线轴，母亲在灯下一踩就是大半夜。', era: '1950s', category: '家庭用品', prompt: 'old foot-pedal sewing machine, black and gold metal body, wooden base, warm nostalgic Chinese home, photorealistic' },
  { name: '粮票', answerKeywords: ['粮票', '粮食票', '粮食券'], description: '计划经济时期购买粮食的凭证，小纸片上印着面额和使用说明，用一斤粮票换一斤米。', era: '1960s', category: '票据', prompt: 'Chinese vintage food ration coupons, printed paper, red stamps, 1960s China, warm tabletop, photorealistic' },
  { name: '搪瓷杯', answerKeywords: ['搪瓷杯', '茶缸', '搪瓷缸'], description: '白色铁质杯子外面涂有瓷釉，常印红字或牡丹图案，磕掉一块瓷就露出里面的铁。', era: '1970s', category: '日用品', prompt: 'vintage Chinese enamel mug, white porcelain coated metal, red peony pattern, slightly chipped, photorealistic' },
  { name: '二八大杠自行车', answerKeywords: ['自行车', '二八大杠', '老式自行车'], description: '车轮直径 28 英寸的老式自行车，车身重、有横梁，后座能载人载货。', era: '1970s', category: '交通工具', prompt: 'vintage Chinese black bicycle, heavy 28 inch frame, leather seat, nostalgic street scene, photorealistic' },
  { name: '收音机', answerKeywords: ['收音机', '半导体', '广播'], description: '用来收听广播的电器，有旋钮和天线，晚饭后全家人围着听评书。', era: '1960s', category: '电器', prompt: 'vintage wooden radio, analog dial, antenna, 1960s Chinese living room, warm light, photorealistic' },
  { name: '煤油灯', answerKeywords: ['煤油灯', '油灯'], description: '使用煤油照明的工具，有玻璃灯罩和金属底座，火苗在灯罩里跳动。', era: '1950s', category: '照明', prompt: 'vintage kerosene lamp, glass chimney, metal base, warm flame glow, rustic Chinese room, photorealistic' },
  { name: '算盘', answerKeywords: ['算盘', '珠算'], description: '传统计算工具，木框中有多串珠子，手指上下拨动时会发出噼里啪啦的声音。', era: '1950s', category: '工具', prompt: 'Chinese abacus, dark wooden frame and beads, vintage calculating tool on desk, warm light, photorealistic' },
  { name: '暖水瓶', answerKeywords: ['暖水瓶', '热水瓶', '保温瓶'], description: '储存热水的容器，铁皮外壳常印红双喜或牡丹花，里面是玻璃内胆。', era: '1970s', category: '日用品', prompt: 'vintage Chinese thermos bottle, red flower metal exterior, cork stopper, nostalgic kitchen, photorealistic' },
  { name: '黑白电视机', answerKeywords: ['电视机', '黑白电视', '黑白电视机'], description: '只能显示黑白画面的小电视，有旋钮换台和室外天线，雪花点多了就拍一拍。', era: '1980s', category: '电器', prompt: 'small black and white CRT television, dial knobs, antenna, 1980s Chinese home, nostalgic, photorealistic' },
  { name: '手摇电话机', answerKeywords: ['电话机', '手摇电话', '老式电话'], description: '需要手摇发电才能通话的电话机，黑色胶木外壳，侧面有旋转手柄。', era: '1960s', category: '通讯', prompt: 'black bakelite hand crank telephone, vintage 1960s office desk, warm nostalgic lighting, photorealistic' },
  { name: '铁皮玩具', answerKeywords: ['铁皮玩具', '发条玩具'], description: '用薄铁皮做的小玩具，上发条后会走会跳，是很多人童年里珍贵的玩具。', era: '1960s', category: '玩具', prompt: 'vintage Chinese tin wind-up toys, colorful printed tinplate, on wooden floor, nostalgic, photorealistic' },
  { name: '小人书', answerKeywords: ['小人书', '连环画'], description: '巴掌大小的连环画册，每页一幅图配几行字，小伙伴们常常互相借着看。', era: '1960s', category: '书籍', prompt: 'vintage Chinese palm-sized comic books, illustrated booklets stacked on table, nostalgic, photorealistic' },
];

function getDeepSeekApiKey() {
  return process.env.DEEPSEEK_API_KEY || '';
}

function getQwenApiKey() {
  return process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || process.env.DASH_API_KEY || '';
}

function getRegionBase() {
  return (process.env.DASHSCOPE_REGION_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/$/, '');
}

function getDeepSeekBaseUrl() {
  return (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
}

function pickFallbackItem(source = 'fallback') {
  const idx = Math.floor(Math.random() * ITEMS.length);
  const item = ITEMS[idx];
  return {
    id: `item-${idx}-${Date.now()}`,
    name: item.name,
    answerKeywords: item.answerKeywords,
    description: item.description,
    era: item.era,
    category: item.category,
    promptHint: item.prompt,
    source,
  };
}

function parseJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeGeneratedItem(raw, source = 'deepseek') {
  if (!raw?.name || !raw?.description || !raw?.promptHint) return null;
  const answerKeywords = Array.isArray(raw.answerKeywords)
    ? raw.answerKeywords.filter(Boolean).map(String).slice(0, 6)
    : [raw.name];

  return {
    id: `${source}-${Date.now()}`,
    name: String(raw.name).trim(),
    answerKeywords,
    description: String(raw.description).trim(),
    era: String(raw.era || '1950-1990 年代').trim(),
    category: String(raw.category || '旧物件').trim(),
    promptHint: String(raw.promptHint).trim(),
    source,
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function generateItemWithDeepSeek(apiKey) {
  const chatUrl = process.env.DEEPSEEK_CHAT_COMPLETIONS_URL || `${getDeepSeekBaseUrl()}/chat/completions`;
  const model = process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-v4-flash';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.DEEPSEEK_TEXT_TIMEOUT_MS || 8000));
  let response;
  try {
    response = await fetch(chatUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        stream: false,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 800,
        messages: [
          {
            role: 'system',
            content: '你是适老化认知训练内容设计师，只输出严格 JSON，不要输出 Markdown。',
          },
          {
            role: 'user',
            content:
              '随机生成一个 2000 年以前，尤其是上世纪 50-90 年代中国老人熟悉的旧物件。JSON 字段必须为 name、answerKeywords、description、era、category、promptHint。description 用 45-70 个中文字符，promptHint 用英文图像生成提示词，强调怀旧、真实摄影、暖光、无文字水印。',
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await readJsonResponse(response);
  if (!response.ok || data.error || data.code) {
    throw new Error(data?.message || data?.error?.message || `DeepSeek text API error ${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content || data.output?.choices?.[0]?.message?.content;
  return normalizeGeneratedItem(parseJsonObject(content), 'deepseek');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function placeholderImage() {
  const rawText = '图片生成暂不可用，请稍后重试';
  const lines = [rawText.slice(0, 28), rawText.slice(28, 56)].filter(Boolean).map(escapeXml);
  const text = lines
    .map((line, index) => `<tspan x="640" dy="${index === 0 ? 0 : 42}">${line}</tspan>`)
    .join('');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900" viewBox="0 0 1280 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#f7e5c6" offset="0"/>
          <stop stop-color="#b87b4d" offset="1"/>
        </linearGradient>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
          <feBlend mode="soft-light" in2="SourceGraphic"/>
        </filter>
      </defs>
      <rect width="1280" height="900" fill="url(#bg)"/>
      <rect x="118" y="96" width="1044" height="708" rx="46" fill="#fff8ec" opacity="0.82"/>
      <circle cx="640" cy="360" r="132" fill="#8b5a2b" opacity="0.16"/>
      <path d="M480 430h320v62H480zM514 310h252c27 0 50 22 50 50v70H464v-70c0-28 22-50 50-50z" fill="#8b5a2b" opacity="0.62"/>
      <text x="640" y="584" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="42" fill="#5d3b20" font-weight="700">等待图片生成</text>
      <text x="640" y="652" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="28" fill="#6f4b2c">${text}</text>
      <rect width="1280" height="900" filter="url(#grain)" opacity="0.14"/>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function extractImageUrl(data) {
  const direct = data.output?.results?.[0]?.url || data.output?.results?.[0]?.image || data.output?.url;
  if (direct) return direct;

  const content = data.output?.choices?.[0]?.message?.content || data.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const imagePart = content.find((part) => part?.image || part?.url);
    if (imagePart) return imagePart.image || imagePart.url;
  }

  return '';
}

async function canLoadImage(url) {
  if (!url || url.startsWith('data:')) return Boolean(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    });
    await response.body?.cancel?.();
    return response.ok || response.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function callWanImageSync(apiKey, prompt) {
  const regionBase = getRegionBase();
  const imageUrl = process.env.QWEN_IMAGE_SYNC_URL || `${regionBase}/api/v1/services/aigc/multimodal-generation/generation`;
  const model = process.env.QWEN_IMAGE_MODEL || 'wan2.6-t2i';
  const response = await fetch(imageUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
      },
      parameters: {
        prompt_extend: true,
        watermark: false,
        n: 1,
        size: process.env.QWEN_IMAGE_SIZE || '1280*1280',
        negative_prompt: 'low quality, blurry, distorted object, extra text, watermark, modern smartphone, cartoon',
      },
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error || data.code) {
    throw new Error(data?.message || data?.error?.message || `Wan image API error ${response.status}`);
  }

  const generatedUrl = extractImageUrl(data);
  if (!generatedUrl) throw new Error('Wan image API returned no image URL');
  return generatedUrl;
}

async function callWanImageAsync(apiKey, prompt) {
  const regionBase = getRegionBase();
  const createTaskUrl = process.env.QWEN_IMAGE_ASYNC_URL || `${regionBase}/api/v1/services/aigc/image-generation/generation`;
  const taskBaseUrl = process.env.QWEN_TASK_BASE_URL || `${regionBase}/api/v1/tasks`;
  const model = process.env.QWEN_IMAGE_MODEL || 'wan2.6-t2i';
  const response = await fetch(createTaskUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
      },
      parameters: {
        prompt_extend: true,
        watermark: false,
        n: 1,
        size: process.env.QWEN_IMAGE_SIZE || '1280*1280',
        negative_prompt: 'low quality, blurry, distorted object, extra text, watermark, modern smartphone, cartoon',
      },
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error || data.code) {
    throw new Error(data?.message || data?.error?.message || `Wan async task error ${response.status}`);
  }

  const taskId = data.output?.task_id;
  if (!taskId) throw new Error('Wan async task ID missing');

  for (let i = 0; i < 12; i += 1) {
    await sleep(4000);
    const taskRes = await fetch(`${taskBaseUrl}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const taskData = await taskRes.json();
    const status = taskData.output?.task_status;
    if (status === 'SUCCEEDED') {
      const generatedUrl = extractImageUrl(taskData);
      if (generatedUrl) return generatedUrl;
      throw new Error('Wan async result returned no image URL');
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(taskData.message || `Wan image task ${status}`);
    }
  }

  throw new Error('Wan image task timed out');
}

// 生成物件描述
router.get('/generate-item', async (_req, res) => {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) return res.json(pickFallbackItem());

  try {
    const generated = await generateItemWithDeepSeek(apiKey);
    if (generated) return res.json(generated);
  } catch (error) {
    console.warn('DeepSeek item generation fallback:', error.message);
  }

  return res.json(pickFallbackItem('fallback-after-deepseek-error'));
});

// 生成图片 (Qwen API 代理)
router.post('/generate-image', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = getQwenApiKey();
  const fullPrompt = `${prompt}, single recognizable object, photorealistic, warm nostalgic atmosphere, soft lighting, museum quality, detailed texture, no text, no watermark`;

  if (!apiKey) {
    return res.json({
      imageUrl: placeholderImage(),
      source: 'local-placeholder',
    });
  }

  try {
    const imageUrl = await callWanImageSync(apiKey, fullPrompt);
    if (!(await canLoadImage(imageUrl))) {
      throw new Error('Wan sync image URL is not reachable');
    }
    return res.json({ imageUrl, source: 'qwen-wan-sync' });
  } catch (syncError) {
    console.warn('Wan sync image generation fallback:', syncError.message);
    try {
      const imageUrl = await callWanImageAsync(apiKey, fullPrompt);
      if (!(await canLoadImage(imageUrl))) {
        throw new Error('Wan async image URL is not reachable');
      }
      return res.json({ imageUrl, source: 'qwen-wan-async' });
    } catch (asyncError) {
      console.warn('Wan async image generation fallback:', asyncError.message);
      return res.json({
        imageUrl: placeholderImage(),
        source: 'local-placeholder-after-qwen-error',
      });
    }
  }
});

// 保存训练记录
router.post('/save-session', (req, res) => {
  const { id, date, rounds, totalCorrect, totalTime } = req.body;
  db.prepare(
    'INSERT OR REPLACE INTO memory_sessions (id, date, rounds, total_correct, total_time) VALUES (?, ?, ?, ?, ?)'
  ).run(id, date, JSON.stringify(rounds), totalCorrect, totalTime);
  res.json({ id });
});

export default router;
