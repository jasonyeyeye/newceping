import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getSiteSettings, updateSiteSettings } from '../lib/api';

interface SiteSettings {
  siteName: string;
  siteUrl: string;
  homeTitle: string;
  homeDescription: string;
  footerCopyright: string;
  footerAbout: string;
  contactEmail: string;
  affiliateDisclosure: string;
}

const defaultSettings: SiteSettings = {
  siteName: 'AdultToyReview',
  siteUrl: 'https://adulttoyreview.com',
  homeTitle: 'AdultToyReview — Honest Adult Product Reviews',
  homeDescription: 'Independent, in-depth reviews of adult toys and products. We test what we recommend.',
  footerCopyright: '© 2024 AdultToyReview. All rights reserved. 18+ only.',
  footerAbout: 'Independent, honest reviews of adult toys and products.',
  contactEmail: 'contact@adulttoyreview.com',
  affiliateDisclosure: 'As an affiliate, we may earn a commission from qualifying purchases made through links on this site at no additional cost to you. Our content is not influenced by advertisers or affiliate partnerships.',
};

export default function Settings() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await getSiteSettings();
      if (data && Object.keys(data).length > 0) {
        setSettings({ ...defaultSettings, ...data });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateSiteSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setSettings({ ...settings, [e.target.name]: e.target.value });
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
      <h1 className="text-2xl font-bold text-white mb-6">Site Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6">
          <h2 className="font-semibold text-white mb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Site Name</label>
              <input
                type="text"
                name="siteName"
                value={settings.siteName}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Site URL</label>
              <input
                type="text"
                name="siteUrl"
                value={settings.siteUrl}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6">
          <h2 className="font-semibold text-white mb-4">SEO</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Homepage Title</label>
              <input
                type="text"
                name="homeTitle"
                value={settings.homeTitle}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Homepage Description</label>
              <textarea
                name="homeDescription"
                value={settings.homeDescription}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6">
          <h2 className="font-semibold text-white mb-4">Footer</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Copyright Text</label>
              <input
                type="text"
                name="footerCopyright"
                value={settings.footerCopyright}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">About Text</label>
              <textarea
                name="footerAbout"
                value={settings.footerAbout}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Contact Email</label>
              <input
                type="email"
                name="contactEmail"
                value={settings.contactEmail}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-white/10 p-6">
          <h2 className="font-semibold text-white mb-4">Affiliate Disclosure (FTC Required)</h2>
          <textarea
            name="affiliateDisclosure"
            value={settings.affiliateDisclosure}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-sm text-green-400">Settings saved!</span>
          )}
        </div>
      </form>
    </div>
  );
}