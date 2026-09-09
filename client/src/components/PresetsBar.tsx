import type { PresetDef, PresetId } from '../types';

export const PRESETS: PresetDef[] = [
  {
    id: 'browser-caches',
    label: 'Browser caches',
    description: 'Select browser-related cache findings',
  },
  {
    id: 'package-caches',
    label: 'Package manager caches',
    description: 'Select npm/pip and similar caches',
  },
  {
    id: 'temp',
    label: 'Temp files',
    description: 'Select temporary leftovers',
  },
  {
    id: 'trash',
    label: 'Empty Trash',
    description: 'Select trash contents',
  },
  {
    id: 'safe-all',
    label: 'Safe all',
    description: 'Select every Safe item',
  },
];

interface Props {
  disabled?: boolean;
  onPreset: (id: PresetId) => void;
  active?: PresetId | null;
}

export function PresetsBar({ disabled, onPreset, active }: Props) {
  return (
    <div className="presets" role="group" aria-label="Quick clean presets">
      <div className="presets-label">Quick clean</div>
      <div className="presets-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`preset-chip ${active === p.id ? 'active' : ''}`}
            title={p.description}
            disabled={disabled}
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="presets-hint">
        Presets only select items — you still confirm before anything is deleted.
      </p>
    </div>
  );
}
