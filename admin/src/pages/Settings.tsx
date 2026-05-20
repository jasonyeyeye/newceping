import { useState } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState({
    siteName: 'AdultToyReview',
    siteUrl: 'https://adulttoyreview.com',
    homeTitle: 'AdultToyReview — Honest Adult Product Reviews',
    homeDescription: 'Independent, in-depth reviews of adult toys and products. We test what we recommend.',
    footerCopyright: '© 2024 AdultToyReview. All rights reserved. 18+ only.',
    footerAbout: 'Independent, honest reviews of adult toys and products.',
    contactEmail: 'contact@adulttoyreview.com',
    affiliateDisclosure: 'As an affiliate, we may earn a commission from qualifying purchases made through links on this site at no additional cost to you. Our content is not influenced by advertisers or affiliate partnerships.',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert('Settings saved! (In production, this saves to Cloudflare KV)');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Site Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
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
          <h2 className="font-semibold text-white mb-4">Affiliate Disclosure</h2>
          <textarea
            name="affiliateDisclosure"
            value={settings.affiliateDisclosure}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-2.5 bg-[var(--color-background)] border border-white/10 rounded-lg text-white focus:border-[var(--color-primary)] focus:outline-none resize-none"
          />
          <p className="text-xs text-gray-500 mt-2">
            Required by FTC guidelines. Displayed on all pages with affiliate links.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white font-medium rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}