import { useEffect } from 'react';

export interface PageMetaOptions {
  title: string;
  description?: string;
  path: string;
  noindex?: boolean;
}

export const SITE_URL = 'https://origami.techmitten.com';

const INDEX_DIRECTIVE =
  'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
const NOINDEX_DIRECTIVE = 'noindex, nofollow';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function usePageMeta({
  title,
  description,
  path,
  noindex = false,
}: PageMetaOptions): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const url = `${SITE_URL}${path}`;
    const robots = noindex ? NOINDEX_DIRECTIVE : INDEX_DIRECTIVE;

    document.title = title;
    upsertCanonical(url);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'robots', robots);
    upsertMeta('name', 'googlebot', robots);

    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
      upsertMeta('name', 'twitter:description', description);
    }
  }, [title, description, path, noindex]);
}
