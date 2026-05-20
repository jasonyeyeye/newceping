import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, RefreshCw, Plus, Check, X, ChevronUp, ChevronDown } from 'lucide-react';
import { getNavigation, updateNavigation } from '../lib/api';

interface NavItem {
  id: string;
  label: string;
  type: 'category' | 'page' | 'external';
  url?: string;
  targetId?: string;
  order: number;
  category?: string; // header | footer | sidebar
}

interface SortableRowProps {
  item: NavItem;
  onUpdate: (id: string, field: keyof NavItem, value: string) => void;
  onDelete: (id: string) => void;
  isMobile: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function SortableRow({ item, onUpdate, onDelete, isMobile, onMoveUp, onMoveDown, isFirst, isLast }: SortableRowProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(item.label);
  const [editUrl, setEditUrl] = useState(item.url || '');
  const [editCategory, setEditCategory] = useState(item.category || 'header');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function saveEdit() {
    onUpdate(item.id, 'label', editLabel);
    onUpdate(item.id, 'url', editUrl);
    onUpdate(item.id, 'category', editCategory);
    setEditing(false);
  }

  function cancelEdit() {
    setEditLabel(item.label);
    setEditUrl(item.url || '');
    setEditCategory(item.category || 'header');
    setEditing(false);
  }

  if (editing) {
    return (
      <tr
        ref={setNodeRef}
        style={style}
        className="bg-[var(--color-surface)] border-b border-white/10"
      >
        <td className="px-4 py-3 w-10"></td>
        <td className="px-4 py-3">
          <input
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            className="w-full px-3 py-1.5 bg-[var(--color-background)] border border-white/20 rounded text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
            autoFocus
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            className="w-full px-3 py-1.5 bg-[var(--color-background)] border border-white/20 rounded text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
            placeholder="URL"
          />
        </td>
        <td className="px-4 py-3">
          <select
            value={editCategory}
            onChange={e => setEditCategory(e.target.value)}
            className="px-3 py-1.5 bg-[var(--color-background)] border border-white/20 rounded text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
          >
            <option value="header">Header</option>
            <option value="footer">Footer</option>
            <option value="sidebar">Sidebar</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button onClick={saveEdit} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded transition-colors">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={cancelEdit} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-white/10 text-sm transition-opacity ${isDragging ? 'opacity-50 shadow-xl bg-[var(--color-surface)] z-50' : 'hover:bg-white/5'}`}
    >
      <td className="px-4 py-3 w-10">
        {isMobile ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className={`p-0.5 rounded hover:bg-white/10 ${isFirst ? 'text-gray-700' : 'text-gray-500 hover:text-white'}`}
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className={`p-0.5 rounded hover:bg-white/10 ${isLast ? 'text-gray-700' : 'text-gray-500 hover:text-white'}`}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 block"
          >
            <GripVertical className="w-4 h-4" />
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-white cursor-pointer hover:text-[var(--color-primary)]" onClick={() => setEditing(true)}>
        {item.label}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300 capitalize">
          {item.category || 'header'}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
        {item.url || (item.type === 'category' ? `/vibrators` : '/page')}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

export default function Navigation() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', type: 'external', url: '', category: 'header' });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    loadNavigation();
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function loadNavigation() {
    try {
      const nav = await getNavigation();
      // Add category field if missing
      setItems(nav.map((item: NavItem) => ({ ...item, category: item.category || 'header' })));
    } catch (err) {
      console.error('加载导航失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateNavigation(items);
      alert('导航已保存！');
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems(prev => {
        const oldIndex = prev.findIndex(i => i.id === active.id);
        const newIndex = prev.findIndex(i => i.id === over.id);
        const reordered = arrayMove(prev, oldIndex, newIndex);
        // Update order field
        return reordered.map((item, idx) => ({ ...item, order: idx }));
      });
      // Auto-save after drag
      saveAfterReorder();
    }
  }

  async function saveAfterReorder() {
    try {
      await updateNavigation(items);
    } catch (err) {
      console.error('自动保存顺序失败:', err);
    }
  }

  function addItem() {
    if (!form.label.trim()) {
      alert('请输入标签');
      return;
    }
    const newItem: NavItem = {
      id: `nav-${Date.now()}`,
      label: form.label,
      type: form.type as 'category' | 'page' | 'external',
      url: form.type === 'external' ? form.url : undefined,
      order: items.length + 1,
      category: form.category,
    };
    setItems([...items, newItem]);
    setForm({ label: '', type: 'external', url: '', category: 'header' });
    setShowForm(false);
  }

  function removeItem(id: string) {
    setItems(items.filter(item => item.id !== id));
  }

  function updateItem(id: string, field: keyof NavItem, value: string) {
    setItems(items.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = arrayMove(items, index, newIndex).map((item, idx) => ({ ...item, order: idx }));
    setItems(reordered);
    saveAfterReorder();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">导航管理</h1>
        <div className="flex gap-3">
          <button
            onClick={loadNavigation}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            重置
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加菜单
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存更改'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">添加菜单项</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">标签</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="菜单显示名称"
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">类型</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="external">外部链接</option>
                <option value="category">分类</option>
                <option value="page">页面</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">URL / 目标</label>
              <input
                type="text"
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com 或 /page-slug"
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">显示位置</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="header">Header（顶部导航）</option>
                <option value="footer">Footer（底部导航）</option>
                <option value="sidebar">Sidebar（侧边栏）</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={addItem}
              className="px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors"
            >
              添加
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium w-12">拖拽</th>
              <th className="px-4 py-3 font-medium">标签</th>
              <th className="px-4 py-3 font-medium">位置</th>
              <th className="px-4 py-3 font-medium">目标</th>
              <th className="px-4 py-3 font-medium w-16">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {items.map((item, index) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    onUpdate={updateItem}
                    onDelete={removeItem}
                    isMobile={isMobile}
                    onMoveUp={() => moveItem(index, 'up')}
                    onMoveDown={() => moveItem(index, 'down')}
                    isFirst={index === 0}
                    isLast={index === items.length - 1}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </tbody>
        </table>

        {items.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            暂无导航项，点击"添加菜单"开始
          </div>
        )}
      </div>
    </div>
  );
}