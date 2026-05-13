import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { mazeAPI } from '../../utils/api';
import { playCorrectSound, playWrongSound, speakText } from '../../utils/audio';
import { useTrainingStore } from '../../stores/trainingStore';
import type { MazeCell, MazeSession } from '../../utils/types';
import './maze.css';

const ROWS = 4;
const COLS = 5;
const CELL_SIZE = 1.08;

type BlockType = MazeCell['blockType'];
type Direction = 'N' | 'E' | 'S' | 'W';
type MazePathNode = { row: number; col: number };

const DIRECTIONS: Record<Direction, [number, number]> = {
  N: [-1, 0],
  E: [0, 1],
  S: [1, 0],
  W: [0, -1],
};

const OPPOSITE: Record<Direction, Direction> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
};

const BLOCK_PALETTE: { type: BlockType; label: string; color: string; hint: string }[] = [
  { type: 'straight', label: '直线块', color: '#f2c15c', hint: '上下或左右连接' },
  { type: 'turn', label: '弯道块', color: '#f7d783', hint: '连接两个相邻方向' },
  { type: 'cross', label: '十字块', color: '#e8b14f', hint: '四向都可通过' },
  { type: 'empty', label: '清空', color: '#ddd3c6', hint: '移除格内积木' },
];

function createEmptyCells(): MazeCell[][] {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => ({
      row,
      col,
      hasBlock: false,
      blockType: 'empty' as BlockType,
      blockRotation: 0,
    }))
  );
}

function getConnections(blockType: BlockType, rotation: number): Direction[] {
  const normalized = ((rotation % 360) + 360) % 360;
  if (blockType === 'empty') return [];
  if (blockType === 'cross') return ['N', 'E', 'S', 'W'];
  if (blockType === 'straight') return normalized % 180 === 0 ? ['N', 'S'] : ['E', 'W'];

  const turnMap: Record<number, Direction[]> = {
    0: ['N', 'E'],
    90: ['E', 'S'],
    180: ['S', 'W'],
    270: ['W', 'N'],
  };
  return turnMap[normalized] ?? ['N', 'E'];
}

function findPath(cells: MazeCell[][], startLED: number, endLED: number): MazePathNode[] | null {
  const startCell = cells[0]?.[startLED];
  if (!startCell || !getConnections(startCell.blockType, startCell.blockRotation).includes('N')) return null;

  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const queue: { row: number; col: number; path: MazePathNode[] }[] = [
    { row: 0, col: startLED, path: [{ row: 0, col: startLED }] },
  ];
  visited[0][startLED] = true;

  while (queue.length > 0) {
    const { row, col, path } = queue.shift()!;
    const cell = cells[row][col];
    const connections = getConnections(cell.blockType, cell.blockRotation);

    if (row === ROWS - 1 && col === endLED && connections.includes('S')) {
      return path;
    }

    for (const direction of connections) {
      const [dr, dc] = DIRECTIONS[direction];
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) continue;
      if (visited[nextRow][nextCol]) continue;

      const nextCell = cells[nextRow][nextCol];
      const nextConnections = getConnections(nextCell.blockType, nextCell.blockRotation);
      if (nextConnections.includes(OPPOSITE[direction])) {
        visited[nextRow][nextCol] = true;
        queue.push({ row: nextRow, col: nextCol, path: [...path, { row: nextRow, col: nextCol }] });
      }
    }
  }

  return null;
}

function LEDLight({ position, active, color }: { position: [number, number, number]; active: boolean; color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = active ? 1 + Math.sin(clock.elapsedTime * 4) * 0.09 : 1;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.13, 24, 24]} />
      <meshStandardMaterial color={active ? color : '#bcd8d7'} emissive={color} emissiveIntensity={active ? 1.2 : 0.08} />
      {active && <pointLight intensity={1.35} color={color} distance={2.4} />}
    </mesh>
  );
}

function BlockModel({ cell, position }: { cell: MazeCell; position: [number, number, number] }) {
  if (cell.blockType === 'empty') return null;
  const color = BLOCK_PALETTE.find((block) => block.type === cell.blockType)?.color ?? '#f2c15c';
  const connections = getConnections(cell.blockType, cell.blockRotation);

  return (
    <group position={position}>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[CELL_SIZE * 0.86, 0.28, CELL_SIZE * 0.86]} />
        <meshStandardMaterial color="#fff0c7" roughness={0.62} />
      </mesh>

      <mesh position={[0, 0.41, 0]} castShadow>
        <cylinderGeometry args={[CELL_SIZE * 0.19, CELL_SIZE * 0.19, 0.14, 32]} />
        <meshStandardMaterial color={color} roughness={0.32} />
      </mesh>

      {connections.map((direction) => {
        const isVertical = direction === 'N' || direction === 'S';
        const positionOffset: [number, number, number] = [
          direction === 'E' ? CELL_SIZE * 0.25 : direction === 'W' ? -CELL_SIZE * 0.25 : 0,
          0.41,
          direction === 'S' ? CELL_SIZE * 0.25 : direction === 'N' ? -CELL_SIZE * 0.25 : 0,
        ];

        return (
          <mesh key={direction} position={positionOffset} castShadow>
            <boxGeometry
              args={[
                isVertical ? CELL_SIZE * 0.26 : CELL_SIZE * 0.58,
                0.14,
                isVertical ? CELL_SIZE * 0.58 : CELL_SIZE * 0.26,
              ]}
            />
            <meshStandardMaterial color={color} roughness={0.34} />
          </mesh>
        );
      })}
    </group>
  );
}

function RollingBall({
  points,
  onComplete,
}: {
  points: [number, number, number][];
  onComplete: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTimeRef = useRef(0);
  const completedRef = useRef(false);
  const segmentLengths = useMemo(() => {
    const lengths: number[] = [];
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = new THREE.Vector3(...points[index]);
      const to = new THREE.Vector3(...points[index + 1]);
      total += from.distanceTo(to);
      lengths.push(total);
    }
    return { lengths, total };
  }, [points]);

  useEffect(() => {
    startTimeRef.current = 0;
    completedRef.current = false;
  }, [points]);

  useFrame(({ clock }) => {
    if (!meshRef.current || points.length < 2 || segmentLengths.total === 0) return;
    if (startTimeRef.current === 0) startTimeRef.current = clock.elapsedTime;

    const speed = 1.75;
    const travelled = Math.min((clock.elapsedTime - startTimeRef.current) * speed, segmentLengths.total);
    const isComplete = travelled >= segmentLengths.total;
    const segmentIndex = segmentLengths.lengths.findIndex((length) => travelled <= length);
    const activeIndex = segmentIndex === -1 ? segmentLengths.lengths.length - 1 : segmentIndex;
    const previousLength = activeIndex === 0 ? 0 : segmentLengths.lengths[activeIndex - 1];
    const segmentLength = segmentLengths.lengths[activeIndex] - previousLength || 1;
    const progress = (travelled - previousLength) / segmentLength;
    const from = new THREE.Vector3(...points[activeIndex]);
    const to = new THREE.Vector3(...points[activeIndex + 1]);

    meshRef.current.position.lerpVectors(from, to, progress);
    meshRef.current.rotation.x += 0.08;
    meshRef.current.rotation.z += 0.045;

    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  return (
    <mesh ref={meshRef} position={points[0]} castShadow>
      <sphereGeometry args={[0.16, 32, 32]} />
      <meshStandardMaterial color="#2f7dd1" roughness={0.26} metalness={0.08} emissive="#1b5ea7" emissiveIntensity={0.18} />
      <pointLight color="#61a8ff" intensity={0.7} distance={1.8} />
    </mesh>
  );
}

function GridBoard({
  cells,
  startLED,
  endLED,
  selectedBlock,
  solutionPath,
  solutionRunId,
  onCellClick,
  onBallComplete,
}: {
  cells: MazeCell[][];
  startLED: number;
  endLED: number;
  selectedBlock: BlockType | null;
  solutionPath: MazePathNode[] | null;
  solutionRunId: number;
  onCellClick: (row: number, col: number) => void;
  onBallComplete: () => void;
}) {
  const totalWidth = COLS * CELL_SIZE;
  const totalHeight = ROWS * CELL_SIZE;
  const offsetX = -(totalWidth / 2) + CELL_SIZE / 2;
  const offsetZ = -(totalHeight / 2) + CELL_SIZE / 2;
  const ballPoints = useMemo(() => {
    if (!solutionPath) return [];

    const y = 0.64;
    return [
      [offsetX + startLED * CELL_SIZE, y, -totalHeight / 2 - 0.48] as [number, number, number],
      ...solutionPath.map(
        (node) => [offsetX + node.col * CELL_SIZE, y, offsetZ + node.row * CELL_SIZE] as [number, number, number]
      ),
      [offsetX + endLED * CELL_SIZE, y, totalHeight / 2 + 0.48] as [number, number, number],
    ];
  }, [endLED, offsetX, offsetZ, solutionPath, startLED, totalHeight]);

  return (
    <group>
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[totalWidth + 0.8, 0.24, totalHeight + 0.9]} />
        <meshStandardMaterial color="#8a5a32" roughness={0.76} />
      </mesh>

      {cells.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const position: [number, number, number] = [offsetX + colIndex * CELL_SIZE, 0, offsetZ + rowIndex * CELL_SIZE];
          const hasPreview = selectedBlock && cell.blockType === 'empty';

          return (
            <group key={`${rowIndex}-${colIndex}`}>
              <mesh
                position={[position[0], 0.02, position[2]]}
                onClick={(event) => {
                  event.stopPropagation();
                  onCellClick(rowIndex, colIndex);
                }}
                receiveShadow
              >
                <boxGeometry args={[CELL_SIZE * 0.9, 0.04, CELL_SIZE * 0.9]} />
                <meshStandardMaterial
                  color={hasPreview ? '#fff8d9' : '#5b371e'}
                  roughness={0.66}
                  emissive={hasPreview ? '#c99a3a' : '#000000'}
                  emissiveIntensity={hasPreview ? 0.12 : 0}
                />
              </mesh>
              <BlockModel cell={cell} position={position} />
            </group>
          );
        })
      )}

      {Array.from({ length: COLS }, (_, index) => (
        <LEDLight
          key={`top-${index}`}
          position={[offsetX + index * CELL_SIZE, 0.48, -totalHeight / 2 - 0.45]}
          active={startLED === index}
          color="#60d84d"
        />
      ))}

      {Array.from({ length: COLS }, (_, index) => (
        <LEDLight
          key={`bottom-${index}`}
          position={[offsetX + index * CELL_SIZE, 0.48, totalHeight / 2 + 0.45]}
          active={endLED === index}
          color="#ec4f3f"
        />
      ))}

      {ballPoints.length > 1 && (
        <RollingBall
          key={`${solutionRunId}-${ballPoints.map((point) => point.join(',')).join('|')}`}
          points={ballPoints}
          onComplete={onBallComplete}
        />
      )}
    </group>
  );
}

function MazeScene(props: {
  cells: MazeCell[][];
  startLED: number;
  endLED: number;
  selectedBlock: BlockType | null;
  solutionPath: MazePathNode[] | null;
  solutionRunId: number;
  onCellClick: (row: number, col: number) => void;
  onBallComplete: () => void;
}) {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 8, 7]} intensity={1.45} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <GridBoard {...props} />
      <OrbitControls enableDamping dampingFactor={0.1} minDistance={4.8} maxDistance={11} maxPolarAngle={Math.PI / 2.25} target={[0, 0, 0]} />
    </>
  );
}

export default function MazeTraining() {
  const [cells, setCells] = useState<MazeCell[][]>(() => createEmptyCells());
  const [startLED, setStartLED] = useState(0);
  const [endLED, setEndLED] = useState(4);
  const [selectedBlock, setSelectedBlock] = useState<BlockType | null>('straight');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [level, setLevel] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [solutionPath, setSolutionPath] = useState<MazePathNode[] | null>(null);
  const [solutionRunId, setSolutionRunId] = useState(0);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef(Date.now());
  const addMazeSession = useTrainingStore((s) => s.addMazeSession);

  const correctRate = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;
  const placedCount = useMemo(() => cells.flat().filter((cell) => cell.blockType !== 'empty').length, [cells]);

  const generateNewPath = useCallback(async () => {
    let start = Math.floor(Math.random() * COLS);
    let end = Math.floor(Math.random() * COLS);

    try {
      const path = await mazeAPI.generatePath(ROWS, COLS);
      start = path.startLED;
      end = path.endLED;
    } catch {
      while (end === start) end = Math.floor(Math.random() * COLS);
    }

    setStartLED(start);
    setEndLED(end);
    setCells(createEmptyCells());
    setSolutionPath(null);
    setSolutionRunId(0);
    setChecking(false);
    setFeedback(null);
    setAttempts(0);
    setSuccesses(0);
    setElapsed(0);
    timerRef.current = Date.now();
    speakText(`请从上边第${start + 1}个灯连接到下边第${end + 1}个灯。`);
  }, []);

  useEffect(() => {
    void generateNewPath();
  }, [generateNewPath]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeoutId = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!selectedBlock || feedback === 'correct' || checking) return;
    setSolutionPath(null);
    setChecking(false);

    setCells((prev) => {
      const next = prev.map((line) => line.map((cell) => ({ ...cell })));
      const current = next[row][col];

      if (selectedBlock === 'empty') {
        next[row][col] = { ...current, hasBlock: false, blockType: 'empty', blockRotation: 0 };
      } else if (current.blockType === selectedBlock) {
        next[row][col] = { ...current, blockRotation: (current.blockRotation + 90) % 360 };
      } else {
        next[row][col] = { ...current, hasBlock: true, blockType: selectedBlock, blockRotation: selectedBlock === 'straight' ? 0 : 0 };
      }

      return next;
    });
  }, [checking, feedback, selectedBlock]);

  const handleBallComplete = useCallback(() => {
    if (!checking) return;
    setChecking(false);
    playCorrectSound();
    speakText('路径正确。');
    setFeedback('correct');
  }, [checking]);

  const handleCheck = () => {
    if (checking) return;
    const nextSolutionPath = findPath(cells, startLED, endLED);
    const correct = Boolean(nextSolutionPath);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (correct) {
      const nextSuccesses = successes + 1;
      setSuccesses(nextSuccesses);
      setSolutionPath(nextSolutionPath);
      setSolutionRunId((value) => value + 1);
      setFeedback(null);
      setChecking(true);
      speakText('开始检测，正在演示小球通路。');

      const session: MazeSession = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        attempts: nextAttempts,
        timeSpent: (Date.now() - timerRef.current) / 1000,
        correct: true,
        path: { startLED, endLED },
      };
      addMazeSession(session);
      mazeAPI.saveSession(session).catch(() => undefined);
      setLevel((value) => Math.min(10, value + 1));
    } else {
      setChecking(false);
      setFeedback('wrong');
      setSolutionPath(null);
      playWrongSound();
      speakText('路径还没有连通，请调整积木方向。');
    }
  };

  const clearBoard = () => {
    setCells(createEmptyCells());
    setSolutionPath(null);
    setChecking(false);
    setFeedback(null);
  };

  return (
    <section className="maze-screen">
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
            {feedback === 'correct' ? '路径正确' : '继续调整'}
          </div>
        </div>
      )}

      <div className="maze-workspace">
        <div className="maze-title-row">
          <div>
            <h1>实体立体迷宫</h1>
            <p>选择右侧积木，在 4×5 棋盘上搭建从起点到终点的通路。</p>
          </div>
          <div className="maze-led-summary">
            <span className="start">上边第 {startLED + 1} 个</span>
            <span className="end">下边第 {endLED + 1} 个</span>
          </div>
        </div>

        <div className="maze-canvas-container panel">
          <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.75]}>
            <PerspectiveCamera makeDefault position={[6.6, 6.8, 7.2]} fov={44} />
            <MazeScene
              cells={cells}
              startLED={startLED}
              endLED={endLED}
              selectedBlock={selectedBlock}
              solutionPath={solutionPath}
              solutionRunId={solutionRunId}
              onCellClick={handleCellClick}
              onBallComplete={handleBallComplete}
            />
          </Canvas>
        </div>

        <div className="metric-row">
          <div className="metric">
            <span className="metric-icon">试</span>
            <span>
              <span className="metric-value">{attempts}</span>
              <span className="metric-label">尝试次数</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">时</span>
            <span>
              <span className="metric-value">{elapsed}s</span>
              <span className="metric-label">完成时间</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">率</span>
            <span>
              <span className="metric-value">{correctRate}%</span>
              <span className="metric-label">路径正确率</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-icon">关</span>
            <span>
              <span className="metric-value">{level}</span>
              <span className="metric-label">当前难度</span>
            </span>
          </div>
        </div>
      </div>

      <aside className="maze-side">
        <div className="panel maze-control-panel">
          <div className="maze-side-heading">
            <h2 className="panel-title">路径搭建</h2>
            <p className="panel-note">选模块放入棋盘；再次点击同格旋转方向，检测成功后小球会沿通路滚动。</p>
          </div>

          <div className="led-card-grid">
            <div className="led-card start">
              <span>当前起点</span>
              <strong>上边第 {startLED + 1} 个</strong>
            </div>
            <div className="led-card end">
              <span>当前终点</span>
              <strong>下边第 {endLED + 1} 个</strong>
            </div>
          </div>

          <div className="block-palette">
            {BLOCK_PALETTE.map((block) => (
              <button
                key={block.type}
                className={`block-option ${selectedBlock === block.type ? 'selected' : ''}`}
                onClick={() => setSelectedBlock(block.type)}
                style={{ '--block-color': block.color } as CSSProperties}
                type="button"
              >
                <span className={`block-preview ${block.type}`} />
                <strong>{block.label}</strong>
                <small>{block.hint}</small>
              </button>
            ))}
          </div>

          <div className="maze-actions">
            <button className="btn btn-primary side-button" onClick={handleCheck} disabled={checking} type="button">
              {checking ? '检测中' : '检测路径'}
            </button>
            <button className="btn btn-outline side-button" onClick={() => void generateNewPath()} type="button">
              重新摆放
            </button>
            <button className="btn btn-outline side-button" onClick={clearBoard} type="button">
              清空棋盘
            </button>
          </div>
        </div>

        <div className="panel maze-status-panel">
          <div className="maze-feedback success">
            <strong>成功</strong>
            <span>绿灯亮起，小球执行通路。</span>
          </div>
          <div className="maze-feedback danger">
            <strong>未通</strong>
            <span>红灯提示，继续调整方向。</span>
          </div>
          <div className="placed-card">
            <span>已放置</span>
            <strong>{placedCount}</strong>
          </div>
        </div>
      </aside>
    </section>
  );
}
