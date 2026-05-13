import MemoryTraining from './modules/memory/MemoryTraining';
import MazeTraining from './modules/maze/Maze3D';
import StepTraining from './modules/step/StepTraining';
import { useTrainingStore } from './stores/trainingStore';
import type { TrainingModule } from './utils/types';
import './styles/global.css';

const MODULES: { key: TrainingModule; label: string; icon: string }[] = [
  { key: 'memory', label: '长期记忆训练', icon: '识' },
  { key: 'maze', label: '实体立体迷宫', icon: '宫' },
  { key: 'step', label: '方步训练', icon: '步' },
];

export default function App() {
  const { currentModule, setModule } = useTrainingStore();
  const today = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  const ModuleComponent = {
    memory: MemoryTraining,
    maze: MazeTraining,
    step: StepTraining,
  }[currentModule];

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark">脑</div>
          <div>
            <span className="brand-title">SilverMind</span>
            <span className="brand-subtitle">认知训练互动系统</span>
          </div>
        </div>

        <nav className="module-tabs" aria-label="训练模块">
          {MODULES.map((mod) => (
            <button
              key={mod.key}
              className={`module-tab ${currentModule === mod.key ? 'active' : ''}`}
              onClick={() => setModule(mod.key)}
              type="button"
            >
              <span className="module-tab-icon">{mod.icon}</span>
              <span>{mod.label}</span>
            </button>
          ))}
        </nav>

        <div className="operator-strip">
          <span>{today}</span>
          <span className="user-badge">训练用户</span>
        </div>
      </header>

      <main className="main-content">
        <ModuleComponent />
      </main>
    </div>
  );
}
