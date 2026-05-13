import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { memoryAPI } from '../../utils/api';
import {
  playCorrectSound,
  playEncourageSound,
  playWrongSound,
  speakText,
  startSpeechRecognition,
} from '../../utils/audio';
import { useTrainingStore } from '../../stores/trainingStore';
import type { MemoryItem, MemoryRound, MemorySession } from '../../utils/types';
import './memory.css';

const TOTAL_ROUNDS = 8;

const FALLBACK_ITEMS: MemoryItem[] = [
  {
    id: 'fallback-radio',
    name: '收音机',
    answerKeywords: ['收音机', '广播', '半导体'],
    description: '木壳或塑料壳的广播电器，有旋钮和天线，晚饭后全家人围着听评书。',
    era: '1960s',
    category: '电器',
    promptHint: 'vintage wooden radio, analog dial, antenna, 1960s Chinese living room, warm light, photorealistic',
  },
  {
    id: 'fallback-enamel-cup',
    name: '搪瓷杯',
    answerKeywords: ['搪瓷杯', '茶缸', '搪瓷缸'],
    description: '白色铁质杯子外面涂有瓷釉，常印红字或牡丹图案，是很常见的日用品。',
    era: '1970s',
    category: '日用品',
    promptHint: 'vintage Chinese enamel mug, white metal cup with red peony, nostalgic tabletop, photorealistic',
  },
  {
    id: 'fallback-abacus',
    name: '算盘',
    answerKeywords: ['算盘', '珠算'],
    description: '木框里有多串珠子，用手指拨动来计算，声音清脆，是老商店里的常见工具。',
    era: '1950s',
    category: '工具',
    promptHint: 'Chinese abacus, dark wooden beads, vintage calculating tool on wooden desk, warm nostalgic light',
  },
  {
    id: 'fallback-thermos',
    name: '暖水瓶',
    answerKeywords: ['暖水瓶', '热水瓶', '保温瓶'],
    description: '储存热水的容器，铁皮外壳常有花纹，里面是玻璃内胆，瓶口用软木塞。',
    era: '1970s',
    category: '日用品',
    promptHint: 'vintage Chinese thermos bottle, floral metal shell, cork stopper, nostalgic kitchen, photorealistic',
  },
];

function pickFallbackItem(): MemoryItem {
  return FALLBACK_ITEMS[Math.floor(Math.random() * FALLBACK_ITEMS.length)];
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?\s]/g, '')
    .replace(/^一个/, '')
    .replace(/^一台/, '')
    .replace(/^一只/, '')
    .replace(/^老式/, '');
}

function isAnswerCorrect(answer: string, item: MemoryItem) {
  const cleaned = normalizeAnswer(answer);
  if (!cleaned) return false;
  const keywords = new Set([item.name, ...(item.answerKeywords ?? [])].filter(Boolean));
  return Array.from(keywords).some((keyword) => {
    const normalizedKeyword = normalizeAnswer(keyword);
    return cleaned.includes(normalizedKeyword) || normalizedKeyword.includes(cleaned);
  });
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clientPlaceholder() {
  const title = escapeSvgText('图片暂时不可用');
  const rawDescription = '请等待图片重新生成后再继续识别。';
  const descriptionLines = [rawDescription.slice(0, 18), rawDescription.slice(18, 36)].filter(Boolean).map(escapeSvgText);
  const descriptionSvg = descriptionLines
    .map((line, index) => `<tspan x="640" dy="${index === 0 ? 0 : 42}">${line}</tspan>`)
    .join('');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900" viewBox="0 0 1280 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#fff1d5"/>
          <stop offset="1" stop-color="#c88754"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="900" fill="url(#bg)"/>
      <rect x="116" y="98" width="1048" height="704" rx="40" fill="#fffaf0" opacity="0.86"/>
      <circle cx="640" cy="352" r="122" fill="#8c5d35" opacity="0.15"/>
      <path d="M474 438h332v58H474zM520 316h240c32 0 58 26 58 58v64H462v-64c0-32 26-58 58-58z" fill="#8c5d35" opacity="0.58"/>
      <text x="640" y="586" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="44" fill="#5e3b22" font-weight="700">${title}</text>
      <text x="640" y="652" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="28" fill="#6f4b2c">${descriptionSvg}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getTrainingHint(item: MemoryItem) {
  return `这是一件${item.era}常见的${item.category}。请先观察外形、材质和使用场景，再说出名称。`;
}

export default function MemoryTraining() {
  const [currentItem, setCurrentItem] = useState<MemoryItem | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageSource, setImageSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [attemptLog, setAttemptLog] = useState<MemoryRound[]>([]);
  const [listening, setListening] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [lastResult, setLastResult] = useState<{ answer: string; correct: boolean; attemptNo: number } | null>(null);
  const [attemptsForCurrent, setAttemptsForCurrent] = useState(0);
  const [completed, setCompleted] = useState(false);
  const timerRef = useRef(Date.now());
  const introSpokenRef = useRef(false);
  const addMemorySession = useTrainingStore((s) => s.addMemorySession);
  const answeredCorrectly = Boolean(lastResult?.correct);
  const activeHint = currentItem ? (answeredCorrectly ? currentItem.description : getTrainingHint(currentItem)) : '';

  const answeredQuestions = completed ? TOTAL_ROUNDS : Math.min(TOTAL_ROUNDS, questionIndex + (lastResult ? 1 : 0));
  const accuracy = answeredQuestions > 0 ? Math.round((totalCorrect / answeredQuestions) * 100) : 0;
  const averageTime = useMemo(() => {
    if (attemptLog.length === 0) return 0;
    const total = attemptLog.reduce((sum, round) => sum + round.timeSpent, 0);
    return Math.round(total / attemptLog.length);
  }, [attemptLog]);

  const loadNewItem = useCallback(async () => {
    setLoading(true);
    setImageLoading(false);
    setFeedback(null);
    setUserAnswer('');
    setShowHint(false);
    setLastResult(null);
    setAttemptsForCurrent(0);
    setImageUrl('');
    setImageSource('');

    try {
      const data = await memoryAPI.generateItem();
      setCurrentItem(data);
    } catch {
      const fallback = pickFallbackItem();
      setCurrentItem(fallback);
    } finally {
      timerRef.current = Date.now();
      setLoading(false);
    }
  }, []);

  const saveSession = useCallback((rounds: MemoryRound[], correctCount: number) => {
    const session: MemorySession = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      rounds,
      totalCorrect: correctCount,
      totalTime: rounds.reduce((sum, round) => sum + round.timeSpent, 0),
    };
    addMemorySession(session);
    memoryAPI.saveSession(session).catch(() => undefined);
  }, [addMemorySession]);

  useEffect(() => {
    void loadNewItem();
  }, [loadNewItem]);

  useEffect(() => {
    if (introSpokenRef.current) return;
    introSpokenRef.current = true;
    speakText('欢迎进入长期记忆训练。请观察图片，说出物品名称。需要帮助时，可以点击提示线索。');
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeoutId = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!currentItem?.promptHint) return;
    let cancelled = false;

    async function generateImage() {
      setImageLoading(true);
      try {
        const result = await memoryAPI.generateImage(currentItem!.promptHint!);
        if (!cancelled) {
          setImageUrl(result.imageUrl);
          setImageSource(result.source ?? '');
        }
      } catch {
        if (!cancelled) {
          setImageUrl(currentItem!.imageUrl ?? clientPlaceholder());
          setImageSource('local-empty');
        }
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    }

    void generateImage();
    return () => {
      cancelled = true;
    };
  }, [currentItem]);

  const recordAttempt = useCallback((answer: string, correct: boolean) => {
    if (!currentItem) return { nextLog: attemptLog, nextCorrect: totalCorrect };

    const nextAttemptNo = attemptsForCurrent + 1;
    const roundData: MemoryRound = {
      item: currentItem,
      userAnswer: answer.trim(),
      correct,
      timeSpent: (Date.now() - timerRef.current) / 1000,
      attemptNo: nextAttemptNo,
      imageUrl,
    };

    const shouldCountCorrect = correct && !lastResult?.correct;
    const nextCorrect = shouldCountCorrect ? totalCorrect + 1 : totalCorrect;
    const nextLog = [...attemptLog, roundData];

    setAttemptLog(nextLog);
    setAttemptsForCurrent(nextAttemptNo);
    setLastResult({ answer: answer.trim(), correct, attemptNo: nextAttemptNo });
    if (shouldCountCorrect) setTotalCorrect(nextCorrect);

    return { nextLog, nextCorrect };
  }, [attemptLog, attemptsForCurrent, currentItem, imageUrl, lastResult?.correct, totalCorrect]);

  const checkAnswer = useCallback((answer: string) => {
    if (!currentItem || !answer.trim() || lastResult?.correct) return;

    const correct = isAnswerCorrect(answer, currentItem);
    recordAttempt(answer, correct);

    if (correct) {
      setFeedback('correct');
      playCorrectSound();
      speakText('答对啦，真棒！');
    } else {
      setFeedback('wrong');
      playWrongSound();
      speakText('没关系，再想一想。可以看看提示。');
    }
  }, [currentItem, lastResult?.correct, recordAttempt]);

  const handleSpeechInput = async () => {
    if (listening || lastResult?.correct) return;
    setListening(true);
    try {
      const text = await startSpeechRecognition('zh-CN');
      setUserAnswer(text);
      checkAnswer(text);
    } catch {
      playEncourageSound();
      speakText('当前浏览器不支持语音识别，可以使用文字输入。');
    } finally {
      setListening(false);
    }
  };

  const handleTextSubmit = () => {
    checkAnswer(userAnswer);
  };

  const goNext = () => {
    if (!currentItem) return;

    let nextLog = attemptLog;
    let nextCorrect = totalCorrect;
    if (!lastResult) {
      const recorded = recordAttempt('跳过', false);
      nextLog = recorded.nextLog;
      nextCorrect = recorded.nextCorrect;
    }

    const nextQuestion = questionIndex + 1;
    if (nextQuestion >= TOTAL_ROUNDS) {
      saveSession(nextLog, nextCorrect);
      setCompleted(true);
      speakText(`训练结束。本次答对${nextCorrect}题。`);
      return;
    }

    setQuestionIndex(nextQuestion);
    void loadNewItem();
  };

  const resetSession = () => {
    setQuestionIndex(0);
    setTotalCorrect(0);
    setAttemptLog([]);
    setCompleted(false);
    void loadNewItem();
  };

  if (completed) {
    const missed = Math.max(TOTAL_ROUNDS - totalCorrect, 0);
    return (
      <section className="memory-result panel">
        <p className="result-kicker">长期记忆训练完成</p>
        <h1>本轮答对 {totalCorrect} 题</h1>
        <div className="result-stats">
          <div>
            <span>{accuracy}%</span>
            <small>识别正确率</small>
          </div>
          <div>
            <span>{missed}</span>
            <small>需复习物品</small>
          </div>
          <div>
            <span>{averageTime || 0}s</span>
            <small>平均反应</small>
          </div>
        </div>
        <button className="btn btn-primary btn-large" onClick={resetSession} type="button">
          再来一轮
        </button>
      </section>
    );
  }

  return (
    <section className="memory-screen">
      {feedback && (
        <div
          className="feedback-overlay"
          role="button"
          tabIndex={0}
          aria-label="关闭反馈提示"
          onClick={() => setFeedback(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') setFeedback(null);
          }}
        >
          <div className={`feedback-badge ${feedback}`}>
            {feedback === 'correct' ? '答对啦' : '再试一次'}
          </div>
        </div>
      )}

      <div className="memory-workspace">
        <div className="memory-title-row">
          <div>
            <h1>请识别图中的物品</h1>
            <p>回忆并说出它的名称，系统会记录答案与反应时间。</p>
          </div>
          <span className="round-pill">第 {questionIndex + 1} / {TOTAL_ROUNDS} 题</span>
        </div>

        <div className="memory-stage panel">
          {loading ? (
            <div className="memory-loading">
              <span className="spinner" />
              <p>正在准备怀旧物件...</p>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={answeredCorrectly ? currentItem?.name ?? '旧物件' : '待识别旧物件'}
              className="stage-image"
              onError={() => {
                setImageUrl(clientPlaceholder());
                setImageSource('client-placeholder-after-image-error');
              }}
            />
          ) : (
            <div className="stage-placeholder">
              <span className="image-waiting-orbit" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <strong>{imageLoading ? '正在生成图片' : '图片准备中'}</strong>
              <span>请稍候，图片出现后再开始识别。</span>
            </div>
          )}
          {imageLoading && imageUrl && <div className="image-busy">正在生成高清图...</div>}
        </div>

        <div className="memory-answer-panel panel">
          <button
            className={`voice-button ${listening ? 'listening' : ''}`}
            onClick={handleSpeechInput}
            disabled={loading || listening || lastResult?.correct}
            type="button"
          >
            <span>{listening ? '听' : '说'}</span>
          </button>

          <div className="answer-input-wrap">
            <input
              className="answer-input"
              value={userAnswer}
              onChange={(event) => setUserAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleTextSubmit();
              }}
              placeholder="请说出或输入识别的物品名称"
              disabled={loading || lastResult?.correct}
            />
            <small>可以点击左侧语音按钮，或在此输入文字。</small>
          </div>

          <div className="answer-status">
            <div>
              <span>你的回答</span>
              <strong>{lastResult?.answer || '待回答'}</strong>
            </div>
            <div>
              <span>正确答案</span>
              <strong>{answeredCorrectly ? currentItem?.name : '答对后显示'}</strong>
            </div>
            <div>
              <span>训练结果</span>
              <strong className={lastResult?.correct ? 'ok' : lastResult ? 'bad' : ''}>
                {lastResult ? (lastResult.correct ? '正确' : '鼓励重试') : '待开始'}
              </strong>
            </div>
          </div>
        </div>

        <div className="metric-row">
          <div className="metric">
            <span className="metric-icon">题</span>
            <span>
              <span className="metric-value">{questionIndex + 1}</span>
              <span className="metric-label">本次题数</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">对</span>
            <span>
              <span className="metric-value">{totalCorrect}</span>
              <span className="metric-label">正确数</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">率</span>
            <span>
              <span className="metric-value">{accuracy}%</span>
              <span className="metric-label">正确率</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">时</span>
            <span>
              <span className="metric-value">{averageTime || '-'}</span>
              <span className="metric-label">平均用时/秒</span>
            </span>
          </div>
        </div>
      </div>

      <aside className="memory-side">
        <div className="panel side-panel">
          <h2 className="panel-title">训练说明</h2>
          <p className="panel-note">观察屏幕中的旧物件，回忆它的名称。答对后进入下一题，答错时系统会给出温和反馈。</p>
        </div>

        <div className="panel side-panel">
          <h2 className="panel-title">随机题目</h2>
          <p className="panel-note">
            {answeredCorrectly && currentItem ? `${currentItem.era} · ${currentItem.category}` : '图片生成后请先识别物品'}
          </p>
          <button className="btn btn-outline side-button" onClick={goNext} disabled={loading} type="button">
            下一题
          </button>
          <button
            className="btn btn-outline side-button"
            onClick={() => {
              setShowHint((value) => !value);
              if (!showHint && currentItem) speakText(activeHint);
            }}
            disabled={!currentItem}
            type="button"
          >
            {answeredCorrectly ? '答案说明' : '提示线索'}
          </button>
          <button className="btn btn-primary side-button" onClick={handleTextSubmit} disabled={loading || lastResult?.correct} type="button">
            开始识别
          </button>

          {showHint && currentItem && (
            <div className="inline-hint">
              <strong>{answeredCorrectly ? '答案说明' : '提示线索'}</strong>
              <span>{activeHint}</span>
            </div>
          )}
        </div>

        <div className="panel encouragement-panel">
          <strong>{lastResult?.correct ? '继续加油，真棒！' : '你的记忆力正在稳步提升'}</strong>
          <div className="wave-bars" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <span key={index} style={{ height: `${18 + ((index * 7) % 30)}px` }} />
            ))}
          </div>
          {answeredCorrectly && imageSource && <small>图像来源：{imageSource}</small>}
        </div>
      </aside>
    </section>
  );
}
