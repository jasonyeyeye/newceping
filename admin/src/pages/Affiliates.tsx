import { useState } from 'react';
import { Plus, Copy, Trash2, CheckCircle } from 'lucide-react';

const demoAffiliates = [
  { id: '1', name: 'Womanizer Pro 40', platform: 'amazon', url: 'https://amazon.com/dp/B07Q3R7W5B', status: 'active' },
  { id: '2', name: 'Satisfyer Curvy 1+', platform: 'amazon', url: 'https://amazon.com/dp/B07XKXLV92', status: 'active' },
  { id: '3', name: 'Lovense Lemay', platform: 'senseful', url: 'https://senseful.com/product/lovense-lemay', status: 'active' },
  { id: '4', name: 'We-Vibe Chorus', platform: 'awin', url: 'https://awin.com/product/wevibe-chorus', status: 'inactive' },
];

export default function Affiliates() {
  const [affiliates] = useState(demoAffiliates);
  const [copied, setCopied] = useState<string | null>(null);

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Affiliate Links</h1>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Add Link
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {affiliates.map(aff => (
              <tr key={aff.id} className="text-sm">
                <td className="px-4 py-3 text-white">{aff.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300 capitalize">
                    {aff.platform}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 truncate max-w-xs">{aff.url}</span>
                    <button
                      onClick={() => copyUrl(aff.url)}
                      className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                    >
                      {copied === aff.url ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                    aff.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {aff.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}