import { useState, useEffect, useRef, useCallback } from 'react';
import { Image, Upload, Grid, List, Copy, Trash2, X, ExternalLink, Check, FileImage, RefreshCw } from 'lucide-react';

// ========== Types ==========
interface MediaItem {
  id: string;
  name: string;
  url: string;
  type: string; // MIME type
  size: number; // bytes
  createdAt: string;
}

type ViewMode = 'grid' | 'list';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const ACCEPTED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

// ========== API (stub if not available) ==========
async function getMediaList(): Promise<MediaItem[]> {
  try {
    const res = await fetch('/api/media');
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch {
    console.log('[Media] 功能开发中：媒体列表接口未实现');
    return [];
  }
}

async function deleteMedia(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API error');
  } catch {
    console.log('[Media] 功能开发中：删除媒体接口未实现');
  }
}

// ========== Format helpers ==========
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getFileTypeLabel(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/svg+xml': 'SVG',
  };
  return map[mime] || mime;
}

// ========== Copy helpers ==========
function copyToClipboard(text: string, setter: (v: string) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setter('copied');
    setTimeout(() => setter(''), 1500);
  });
}

// ========== Main Component ==========
export default function Media() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const [mdCopiedId, setMdCopiedId] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMedia();
  }, []);

  async function loadMedia() {
    setLoading(true);
    try {
      const data = await getMediaList();
      setItems(data);
    } catch (err) {
      console.error('[Media] 加载失败:', err);
    } finally {
      setLoading(false);
    }
  }

  // ========== Upload ==========
  const uploadFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(f => {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        alert(`不支持的文件类型: ${f.name}\n仅支持: ${ACCEPTED_EXT.join(', ')}`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;
    setUploading(true);

    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/media', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');

        const data = await res.json();
        const newItem: MediaItem = {
          id: data.id || Date.now().toString(),
          name: file.name,
          url: data.url || data.fileUrl || '',
          type: file.type,
          size: file.size,
          createdAt: new Date().toISOString(),
        };
        setItems(prev => [newItem, ...prev]);
      } catch {
        // Simulate if API not implemented
        console.log('[Media] 上传功能开发中，模拟添加:', file.name);
        const newItem: MediaItem = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          url: URL.createObjectURL(file),
          type: file.type,
          size: file.size,
          createdAt: new Date().toISOString(),
        };
        setItems(prev => [newItem, ...prev]);
      }
    }

    setUploading(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  const handleDelete = useCallback(async (item: MediaItem) => {
    if (!confirm(`确认删除 "${item.name}"？`)) return;
    setDeletingId(item.id);
    try {
      await deleteMedia(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch {
      // Simulate deletion if API not implemented
      console.log('[Media] 删除功能开发中，模拟删除:', item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  // ========== Render ==========
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">媒体库</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={loadMedia}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>

          {/* View Toggle */}
          <div className="flex bg-white/10 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}
              title="网格视图"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}
              title="列表视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? '上传中...' : '上传文件'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXT.join(',')}
            className="hidden"
            onChange={e => uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-6 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
            : 'border-white/20 hover:border-white/40 hover:bg-white/5'
        }`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-3 ${dragOver ? 'text-[var(--color-primary)]' : 'text-gray-500'}`} />
        <p className={`text-sm font-medium ${dragOver ? 'text-[var(--color-primary)]' : 'text-gray-400'}`}>
          拖拽文件到此处或点击上传
        </p>
        <p className="text-xs text-gray-600 mt-1">
          支持格式：{ACCEPTED_EXT.join(', ')}
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
          <Image className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">暂无媒体文件</p>
          <p className="text-xs text-gray-600 mt-1">上传图片文件即可开始使用</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map(item => (
            <MediaGridCard
              key={item.id}
              item={item}
              onOpenLightbox={() => setLightboxItem(item)}
              onCopyUrl={() => copyToClipboard(item.url, (v) => setCopiedId(v ? item.id : ''))}
              onCopyMd={() => copyToClipboard(`![${item.name}](${item.url})`, (v) => setMdCopiedId(v ? item.id : ''))}
              onDelete={() => handleDelete(item)}
              copiedId={copiedId}
              mdCopiedId={mdCopiedId}
              deletingId={deletingId}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-medium w-16">预览</th>
                <th className="px-4 py-3 font-medium">文件名</th>
                <th className="px-4 py-3 font-medium w-20">类型</th>
                <th className="px-4 py-3 font-medium w-24">大小</th>
                <th className="px-4 py-3 font-medium w-32">日期</th>
                <th className="px-4 py-3 font-medium w-48">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map(item => (
                <MediaListRow
                  key={item.id}
                  item={item}
                  onOpenLightbox={() => setLightboxItem(item)}
                  onCopyUrl={() => copyToClipboard(item.url, (v) => setCopiedId(v ? item.id : ''))}
                  onCopyMd={() => copyToClipboard(`![${item.name}](${item.url})`, (v) => setMdCopiedId(v ? item.id : ''))}
                  onDelete={() => handleDelete(item)}
                  copiedId={copiedId}
                  mdCopiedId={mdCopiedId}
                  deletingId={deletingId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lightbox */}
      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}
    </div>
  );
}

// ========== Grid Card ==========
function MediaGridCard({
  item, onOpenLightbox, onCopyUrl, onCopyMd, onDelete, copiedId, mdCopiedId, deletingId
}: {
  item: MediaItem;
  onOpenLightbox: () => void;
  onCopyUrl: () => void;
  onCopyMd: () => void;
  onDelete: () => void;
  copiedId: string;
  mdCopiedId: string;
  deletingId: string | null;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className="bg-[var(--color-surface)] rounded-lg overflow-hidden border border-white/10 group relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Thumbnail */}
      <div
        className="aspect-square bg-[var(--color-background)] flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={onOpenLightbox}
      >
        {item.type.startsWith('image/') ? (
          <img src={item.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <FileImage className="w-10 h-10 text-gray-600" />
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-xs text-white truncate" title={item.name}>{item.name}</p>
        <p className="text-xs text-gray-500">{formatSize(item.size)}</p>
      </div>

      {/* Hover Actions */}
      {hover && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2">
          <button
            onClick={onOpenLightbox}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors w-full justify-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            查看大图
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopyUrl(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors w-full justify-center"
          >
            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedId === item.id ? '已复制' : '复制 URL'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopyMd(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors w-full justify-center"
          >
            {mdCopiedId === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {mdCopiedId === item.id ? '已复制' : '复制 Markdown'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deletingId === item.id}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded-lg transition-colors w-full justify-center disabled:opacity-50"
          >
            {deletingId === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            删除
          </button>
        </div>
      )}
    </div>
  );
}

// ========== List Row ==========
function MediaListRow({
  item, onOpenLightbox, onCopyUrl, onCopyMd, onDelete, copiedId, mdCopiedId, deletingId
}: {
  item: MediaItem;
  onOpenLightbox: () => void;
  onCopyUrl: () => void;
  onCopyMd: () => void;
  onDelete: () => void;
  copiedId: string;
  mdCopiedId: string;
  deletingId: string | null;
}) {
  return (
    <tr className="text-sm group">
      <td className="px-4 py-2">
        <div
          className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-background)] flex items-center justify-center cursor-pointer"
          onClick={onOpenLightbox}
        >
          {item.type.startsWith('image/') ? (
            <img src={item.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <FileImage className="w-5 h-5 text-gray-600" />
          )}
        </div>
      </td>
      <td className="px-4 py-2">
        <span className="text-white font-medium truncate max-w-xs block">{item.name}</span>
      </td>
      <td className="px-4 py-2 text-gray-500">{getFileTypeLabel(item.type)}</td>
      <td className="px-4 py-2 text-gray-500">{formatSize(item.size)}</td>
      <td className="px-4 py-2 text-gray-500">{formatDate(item.createdAt)}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenLightbox}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="查看大图"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onCopyUrl}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="复制 URL"
          >
            {copiedId === item.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onCopyMd}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="复制 Markdown"
          >
            {mdCopiedId === item.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            disabled={deletingId === item.id}
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
            title="删除"
          >
            {deletingId === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ========== Lightbox ==========
function Lightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Image */}
      <img
        src={item.url}
        alt={item.name}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />

      {/* Info Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 rounded-full px-5 py-2.5">
        <span className="text-white text-sm font-medium truncate max-w-xs">{item.name}</span>
        <span className="text-gray-400 text-xs">{formatSize(item.size)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.url); }}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded-full transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          复制 URL
        </button>
      </div>
    </div>
  );
}