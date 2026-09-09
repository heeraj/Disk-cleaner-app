import { useState } from 'react';
import type { CleanGroup } from '../types';
import { formatBytes } from '../utils';

interface Props {
  groups: CleanGroup[];
  selected: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleGroup: (group: CleanGroup, select: boolean) => void;
}

export function GroupList({ groups, selected, onToggleItem, onToggleGroup }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, true]))
  );

  return (
    <div role="list" aria-label="Scan findings">
      {groups.map((group) => {
        const isOpen = open[group.id] ?? false;
        const ids = group.items.map((i) => i.id);
        const selectedCount = ids.filter((id) => selected.has(id)).length;
        const allSelected = selectedCount === ids.length && ids.length > 0;
        const someSelected = selectedCount > 0 && !allSelected;

        return (
          <div
            key={group.id}
            className={`group ${isOpen ? 'open' : ''}`}
            role="listitem"
          >
            <button
              type="button"
              className="group-header"
              aria-expanded={isOpen}
              aria-controls={`group-body-${group.id}`}
              onClick={() => setOpen((s) => ({ ...s, [group.id]: !isOpen }))}
            >
              <input
                className="check"
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                aria-label={`Select all in ${group.label}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggleGroup(group, e.target.checked)}
              />
              <div className="group-title">
                <strong>{group.label}</strong>
                <span>{group.description}</span>
              </div>
              <span className={`chip ${group.safety}`}>
                {group.safety === 'safe' ? 'Safe' : 'Review'}
              </span>
              <span className="group-size">{formatBytes(group.totalBytes)}</span>
              <span className="chevron" aria-hidden="true">
                ›
              </span>
            </button>
            <div className="group-body" id={`group-body-${group.id}`}>
              <div className="group-body-inner">
                <div className="group-tools">
                  <span>
                    {selectedCount}/{ids.length} selected
                  </span>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => onToggleGroup(group, !allSelected)}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                {group.items.map((item) => (
                  <label key={item.id} className="item">
                    <input
                      className="check"
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => onToggleItem(item.id)}
                      aria-label={`Select ${item.name}`}
                    />
                    <div className="item-text">
                      <strong>{item.name}</strong>
                      <span title={item.path}>{item.description || item.path}</span>
                    </div>
                    <div className="item-size">{formatBytes(item.sizeBytes)}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
