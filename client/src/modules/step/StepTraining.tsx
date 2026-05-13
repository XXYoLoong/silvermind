import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { stepAPI } from '../../utils/api';
import { playCorrectSound, playStepSound, playWrongSound, speakText } from '../../utils/audio';
import { useTrainingStore } from '../../stores/trainingStore';
import type { StepCell, StepMode, StepSession } from '../../utils/types';
import './step.css';

const ROWS = 8;
const COLS = 6;
const CELL_SIZE = 0.92;

const MODES: { key: StepMode; label: string; description: string }[] = [
  { key: 'straight', label: '直线', description: '适合热身与低难度训练' },
  { key: 'diagonal', label: '斜线', description: '训练左右转移与步态控制' },
  { key: 'cross', label: '交叉', description: '训练方向切换与注意力' },
  { key: 'random', label: '随机', description: '保持训练新鲜感' },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function generateLocalPath(mode: StepMode): { row: number; col: number; order: number }[] {
  const path: { row: number; col: number; order: number }[] = [];
  let col = Math.floor(COLS / 2);

  if (mode === 'straight') {
    for (let row = 0; row < ROWS; row += 1) path.push({ row, col, order: row + 1 });
    return path;
  }

  if (mode === 'diagonal') {
    col = 1;
    for (let row = 0; row < ROWS; row += 1) {
      path.push({ row, col: clamp(col, 0, COLS - 1), order: row + 1 });
      if (row % 2 === 0) col += 1;
    }
    return path;
  }

  if (mode === 'cross') {
    for (let row = 0; row < ROWS; row += 1) {
      const offset = row % 4 === 1 ? -1 : row % 4 === 3 ? 1 : 0;
      path.push({ row, col: clamp(col + offset, 0, COLS - 1), order: row + 1 });
    }
    return path;
  }

  col = Math.floor(Math.random() * COLS);
  for (let row = 0; row < ROWS; row += 1) {
    path.push({ row, col, order: row + 1 });
    if (row < ROWS - 1 && Math.random() > 0.4) {
      col = clamp(col + (Math.random() > 0.5 ? 1 : -1), 0, COLS - 1);
    }
  }
  return path;
}

function createCells(path: { row: number; col: number; order: number }[]): StepCell[][] {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => {
      const step = path.find((item) => item.row === row && item.col === col);
      return {
        row,
        col,
        lit: step?.order === 1,
        stepped: false,
        isTarget: Boolean(step),
        order: step?.order ?? 0,
      };
    })
  );
}

function CharacterMarker({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = position[1] + Math.sin(clock.elapsedTime * 3.2) * 0.035;
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.42, 8, 16]} />
        <meshStandardMaterial color="#8d6a4b" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.16, 18, 18]} />
        <meshStandardMaterial color="#f0c49a" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.23, 0.28, 32]} />
        <meshBasicMaterial color="#2f7dd1" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <pointLight intensity={0.55} color="#2f7dd1" distance={1.6} position={[0, 0.45, 0]} />
    </group>
  );
}

function StepBoard({
  cells,
  characterPos,
  currentStep,
  targetSteps,
  mistakeCell,
  onCellClick,
}: {
  cells: StepCell[][];
  characterPos: { row: number; col: number };
  currentStep: number;
  targetSteps: { row: number; col: number; order: number }[];
  mistakeCell: { row: number; col: number } | null;
  onCellClick: (row: number, col: number) => void;
}) {
  const totalWidth = COLS * CELL_SIZE;
  const totalHeight = ROWS * CELL_SIZE;
  const offsetX = -totalWidth / 2 + CELL_SIZE / 2;
  const offsetZ = -totalHeight / 2 + CELL_SIZE / 2;
  const currentTarget = targetSteps[currentStep];

  return (
    <group>
      <mesh position={[0, -0.13, 0]} receiveShadow>
        <boxGeometry args={[totalWidth + 0.72, 0.12, totalHeight + 0.72]} />
        <meshStandardMaterial color="#d9c2a4" roughness={0.88} />
      </mesh>

      {cells.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const isCurrent = currentTarget?.row === rowIndex && currentTarget?.col === colIndex;
          const isMistake = mistakeCell?.row === rowIndex && mistakeCell?.col === colIndex;
          const isCharacter = characterPos.row === rowIndex && characterPos.col === colIndex;
          let color = '#f8f3eb';
          let emissive = '#000000';
          let emissiveIntensity = 0;

          if (cell.isTarget) color = '#f6dc73';
          if (cell.stepped) color = '#7bc96f';
          if (isCurrent && cell.lit) {
            color = '#f2c94c';
            emissive = '#f2c94c';
            emissiveIntensity = 0.4;
          }
          if (isMistake) {
            color = '#d64234';
            emissive = '#d64234';
            emissiveIntensity = 0.38;
          }
          if (isCharacter) color = '#88c77a';

          return (
            <mesh
              key={`${rowIndex}-${colIndex}`}
              position={[offsetX + colIndex * CELL_SIZE, 0, offsetZ + rowIndex * CELL_SIZE]}
              onClick={(event) => {
                event.stopPropagation();
                onCellClick(rowIndex, colIndex);
              }}
              receiveShadow
            >
              <boxGeometry args={[CELL_SIZE * 0.88, 0.055, CELL_SIZE * 0.88]} />
              <meshStandardMaterial color={color} roughness={0.55} emissive={emissive} emissiveIntensity={emissiveIntensity} />
            </mesh>
          );
        })
      )}

      <CharacterMarker position={[offsetX + characterPos.col * CELL_SIZE, 0.1, offsetZ + characterPos.row * CELL_SIZE]} />
    </group>
  );
}

function StepScene(props: {
  cells: StepCell[][];
  characterPos: { row: number; col: number };
  currentStep: number;
  targetSteps: { row: number; col: number; order: number }[];
  mistakeCell: { row: number; col: number } | null;
  onCellClick: (row: number, col: number) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 8, 6]} intensity={1.25} castShadow />
      <StepBoard {...props} />
      <OrbitControls enableDamping dampingFactor={0.1} minDistance={5.2} maxDistance={13} maxPolarAngle={Math.PI / 2.45} target={[0, 0.8, 0]} />
    </>
  );
}

export default function StepTraining() {
  const [mode, setMode] = useState<StepMode>('straight');
  const [cells, setCells] = useState<StepCell[][]>(() => createCells(generateLocalPath('straight')));
  const [targetSteps, setTargetSteps] = useState<{ row: number; col: number; order: number }[]>(() => generateLocalPath('straight'));
  const [currentStep, setCurrentStep] = useState(0);
  const [characterPos, setCharacterPos] = useState({ row: 0, col: Math.floor(COLS / 2) });
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [completed, setCompleted] = useState(false);
  const [totalSteps, setTotalSteps] = useState(0);
  const [correctSteps, setCorrectSteps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [mistakeCell, setMistakeCell] = useState<{ row: number; col: number } | null>(null);
  const timerRef = useRef(Date.now());
  const addStepSession = useTrainingStore((s) => s.addStepSession);

  const accuracy = totalSteps > 0 ? Math.round((correctSteps / totalSteps) * 100) : 0;
  const averageReaction = correctSteps > 0 ? (elapsed / correctSteps).toFixed(1) : '-';

  const startNewGame = useCallback(async (nextMode: StepMode) => {
    setMode(nextMode);
    setFeedback(null);
    setCompleted(false);
    setTotalSteps(0);
    setCorrectSteps(0);
    setCurrentStep(0);
    setMistakeCell(null);
    setElapsed(0);

    let path = generateLocalPath(nextMode);
    try {
      const generated = await stepAPI.generatePath(ROWS, COLS, nextMode);
      path = generated.cells;
    } catch {
      path = generateLocalPath(nextMode);
    }

    setTargetSteps(path);
    setCells(createCells(path));
    setCharacterPos({ row: path[0].row, col: path[0].col });
    timerRef.current = Date.now();
    speakText(`请按照${MODES.find((item) => item.key === nextMode)?.label ?? '随机'}路线开始训练。`);
  }, []);

  useEffect(() => {
    void startNewGame('straight');
  }, [startNewGame]);

  useEffect(() => {
    if (completed) return undefined;

    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [completed]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeoutId = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const completeTraining = useCallback((nextTotal: number, nextCorrect: number, finishedAt = Date.now()) => {
    const finalTime = (finishedAt - timerRef.current) / 1000;
    const session: StepSession = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      path: { cells: targetSteps.map(({ row, col }) => ({ row, col })), mode },
      accuracy: nextCorrect / nextTotal,
      timeSpent: finalTime,
      totalSteps: nextTotal,
      correctSteps: nextCorrect,
    };
    addStepSession(session);
    stepAPI.saveSession(session).catch(() => undefined);
    playCorrectSound();
    speakText('太棒了，方步训练完成。');
    setElapsed(Math.floor(finalTime));
    setCompleted(true);
  }, [addStepSession, mode, targetSteps]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (completed || feedback) return;
    const target = targetSteps[currentStep];
    if (!target) return;

    const nextTotal = totalSteps + 1;
    setTotalSteps(nextTotal);

    if (target.row === row && target.col === col) {
      const nextCorrect = correctSteps + 1;
      setCorrectSteps(nextCorrect);
      setCharacterPos({ row, col });
      setFeedback('correct');
      setMistakeCell(null);
      playStepSound();

      setCells((prev) => {
        const next = prev.map((line) => line.map((cell) => ({ ...cell })));
        next[row][col].stepped = true;
        next[row][col].lit = false;
        const nextTarget = targetSteps[currentStep + 1];
        if (nextTarget) next[nextTarget.row][nextTarget.col].lit = true;
        return next;
      });

      if (currentStep + 1 >= targetSteps.length) {
        const finishedAt = Date.now();
        window.setTimeout(() => completeTraining(nextTotal, nextCorrect, finishedAt), 520);
      } else {
        const nextTarget = targetSteps[currentStep + 1];
        setCurrentStep((value) => value + 1);
        window.setTimeout(() => speakText(`下一步，第${nextTarget.row + 1}行第${nextTarget.col + 1}列。`), 540);
      }
    } else {
      setFeedback('wrong');
      setMistakeCell({ row, col });
      playWrongSound();
      speakText('这一步没有踩中，请回到当前亮灯格。');
      window.setTimeout(() => {
        setMistakeCell(null);
      }, 1200);
    }
  }, [completed, completeTraining, correctSteps, currentStep, feedback, targetSteps, totalSteps]);

  const currentTarget = targetSteps[currentStep];

  if (completed) {
    return (
      <section className="step-result panel">
        <p className="result-kicker">方步训练完成</p>
        <h1>{accuracy}% 准确率</h1>
        <div className="result-stats">
          <div>
            <span>{correctSteps}</span>
            <small>正确步数</small>
          </div>
          <div>
            <span>{totalSteps - correctSteps}</span>
            <small>错误步数</small>
          </div>
          <div>
            <span>{elapsed}s</span>
            <small>完成时间</small>
          </div>
        </div>
        <button className="btn btn-primary btn-large" onClick={() => void startNewGame(mode)} type="button">
          再来一轮
        </button>
      </section>
    );
  }

  return (
    <section className="step-screen">
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
            {feedback === 'correct' ? '踩踏准确' : '请调整步点'}
          </div>
        </div>
      )}

      <aside className="step-left">
        <div className="panel side-panel">
          <h2 className="panel-title">训练说明</h2>
          <p className="panel-note">跟随黄色亮灯路线向前行走。点击棋盘格模拟 AI 视觉识别到的踩踏位置。</p>
        </div>

        <div className="panel side-panel step-action-stack">
          <button className="btn btn-primary side-button" onClick={() => void startNewGame(mode)} type="button">
            开始训练
          </button>
          <button className="btn btn-outline side-button" onClick={() => void startNewGame('random')} type="button">
            随机路线
          </button>
          <button
            className="btn btn-outline side-button"
            onClick={() => {
              if (currentTarget) speakText(`下一步，第${currentTarget.row + 1}行第${currentTarget.col + 1}列。`);
            }}
            type="button"
          >
            语音提示
          </button>
        </div>

        <div className="panel step-feedback-panel">
          <strong>结果反馈</strong>
          <span>准确踩中会亮绿灯，错误或未踩中会亮红灯。</span>
          <div className="wave-bars" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => (
              <span key={index} style={{ height: `${16 + ((index * 9) % 30)}px` }} />
            ))}
          </div>
        </div>
      </aside>

      <div className="step-workspace">
        <div className="step-title-row">
          <div>
            <h1>方步训练</h1>
            <p>0.5m × 0.5m 纵向棋盘路径训练，强化步态控制与认知反馈。</p>
          </div>
          <span className="round-pill">步骤 {Math.min(currentStep + 1, targetSteps.length)} / {targetSteps.length}</span>
        </div>

        <div className="step-canvas-container panel">
          <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.75]}>
            <PerspectiveCamera makeDefault position={[5.6, 7.2, 8.8]} fov={43} />
            <StepScene
              cells={cells}
              characterPos={characterPos}
              currentStep={currentStep}
              targetSteps={targetSteps}
              mistakeCell={mistakeCell}
              onCellClick={handleCellClick}
            />
          </Canvas>
        </div>

        <div className="metric-row">
          <div className="metric">
            <span className="metric-icon">步</span>
            <span>
              <span className="metric-value">{totalSteps}</span>
              <span className="metric-label">本次步数</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">对</span>
            <span>
              <span className="metric-value">{correctSteps}</span>
              <span className="metric-label">正确步数</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">率</span>
            <span>
              <span className="metric-value">{accuracy}%</span>
              <span className="metric-label">准确率</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">应</span>
            <span>
              <span className="metric-value">{averageReaction}</span>
              <span className="metric-label">平均反应/秒</span>
            </span>
          </div>
        </div>
      </div>

      <aside className="step-right">
        <div className="panel side-panel">
          <h2 className="panel-title">当前模式</h2>
          <div className="mode-list">
            {MODES.map((item) => (
              <button
                key={item.key}
                className={`mode-option ${mode === item.key ? 'active' : ''}`}
                onClick={() => void startNewGame(item.key)}
                type="button"
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel side-panel">
          <h2 className="panel-title">训练目标</h2>
          <p className="panel-note">
            {currentTarget ? `下一步：第 ${currentTarget.row + 1} 行，第 ${currentTarget.col + 1} 列。` : '路线已完成。'}
          </p>
          <div className="step-legend">
            <span><i className="legend-yellow" /> 路线预览</span>
            <span><i className="legend-green" /> 正确步骤</span>
            <span><i className="legend-red" /> 错误步骤</span>
            <span><i className="legend-person" /> 当前所在</span>
          </div>
        </div>

        <div className="panel side-panel ai-panel">
          <h2 className="panel-title">AI 视觉识别</h2>
          <strong>{feedback === 'wrong' ? '发现偏离' : '识别正常'}</strong>
          <p className="panel-note">训练数据会用于动态调整路线难度，并可结合 MMSE、MoCA 做长期跟踪。</p>
        </div>
      </aside>
    </section>
  );
}
