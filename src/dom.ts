import { MAX_TEXT, ageInDays, normalise } from './shared.ts';
export const POSTS = '.feed-shared-update-v2, .occludable-update, [data-view-name="feed-full-update"], article[data-urn], [componentkey^="update-card-focus"]';
export const COMMENTS = '.comments-comment-item, .comments-comment-entity, [data-view-name="comment"], [componentkey^="replaceableComment_"]';
export const COMMENT_SECTIONS = `${COMMENTS}, .comments-comments-list, [componentkey^="commentsSectionContainer"], [componentkey*="replaceableCommentTools"]`;
export const REPLY_TEXT = '.comments-comment-item__main-content, .comments-comment-item-content-body, .comments-comment-item__inline-show-more-text, .comments-comment-entity__content, [data-testid="expandable-text-box"], .update-components-text';
export const EXCLUDED = '[contenteditable="true"], [role="textbox"], textarea, .msg-overlay-list-bubble, #messaging, .qf-host, .qf-reply-host';
const POST_BODY = '.update-components-text, .feed-shared-text, .feed-shared-update-v2__description, [data-view-name="feed-commentary"], [data-testid="expandable-text-box"]';
export function replyText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${COMMENTS}, .qf-host, .qf-reply-host, button, script, style, [aria-hidden="true"]`).forEach(el => el.remove());
  return normalise(clone.textContent || '').slice(0, MAX_TEXT);
}
export function replyNodes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(REPLY_TEXT)].filter(node => {
    // Individual comment bodies only; SDUI often duplicates comment wrappers.
    return Boolean(node.closest(COMMENTS) && node.closest('main') && !node.closest(EXCLUDED)
      && !node.querySelector(REPLY_TEXT) && !node.querySelector(COMMENTS));
  });
}
export function containsPromoted(root: HTMLElement): boolean {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${COMMENT_SECTIONS}, .qf-host, .qf-reply-host, script, style, template`).forEach(el => el.remove());
  return (clone.textContent || '').toLowerCase().includes('promoted');
}
// Days since the card's own date stamp. A repost carries the original's stamp
// too, so the newest wins; dates quoted in post text or on comments never count.
export function postAgeDays(root: HTMLElement, now = new Date()): number | undefined {
  let newest: number | undefined;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const days = ageInDays(node.textContent || '', now);
    if (days === undefined || node.parentElement?.closest(`${COMMENT_SECTIONS}, ${EXCLUDED}, ${POST_BODY}`)) continue;
    if (newest === undefined || days < newest) newest = days;
  }
  return newest;
}
// Why LinkedIn put a card in the feed, read from the label above its author:
// "Suggested", or a line such as "Name celebrates this" or "Name follows this page".
const SUGGESTED = /^(suggested|suggested for you|recommended for you)$/i;
const ACTIVITY = /(?:^| )(?:(?:likes?|loves?|celebrates?|supports?|reacted to|commented on) this|finds? this (?:insightful|funny)|replied to (?:this|.{1,40} comment)|follows? this page)$/i;
export function postSource(root: HTMLElement): 'suggested' | 'activity' | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // The label sits in the first few pieces of text; later matches are link previews, not labels.
  for (let node = walker.nextNode(), seen = 0; node && seen < 8; node = walker.nextNode()) {
    const text = normalise(node.textContent || '');
    if (!text || node.parentElement?.closest('.qf-host, script, style')) continue;
    seen++;
    if (node.parentElement?.closest(`${COMMENT_SECTIONS}, ${EXCLUDED}, ${POST_BODY}`)) continue;
    if (SUGGESTED.test(text)) return 'suggested';
    const line = normalise(node.parentElement?.parentElement?.textContent || '');
    // "Name commented" carries the bare word in its own span after the name.
    if (ACTIVITY.test(text) || /^commented$/i.test(text) || (line.length <= 90 && ACTIVITY.test(line))) return 'activity';
  }
  return undefined;
}
// A card's own words, without its comments: the whole text for mute words, and
// the body's lines (LinkedIn keeps the full text in the page, split by <br>) for format checks.
export function postText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${COMMENT_SECTIONS}, .qf-host, .qf-reply-host, script, style, template`).forEach(el => el.remove());
  return normalise(clone.textContent || '');
}
export function postLines(root: HTMLElement): string[] {
  const body = [...root.querySelectorAll<HTMLElement>(POST_BODY)].find(el => !el.closest(`${COMMENT_SECTIONS}, ${EXCLUDED}`));
  if (!body) return [];
  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  clone.querySelectorAll('p, div, li').forEach(block => block.append('\n'));
  return (clone.textContent || '').split('\n').map(normalise);
}
// Right-rail modules, matched by exact title and bounded so the rest of the rail stays.
const SIDEBAR_TITLES = ['linkedin news', "today's puzzles", 'add to your feed'];
export function sidebarModules(): HTMLElement[] {
  const modules = new Set<HTMLElement>();
  for (const label of document.querySelectorAll<HTMLElement>('aside h2, aside h3, aside [role="heading"], aside p, aside span')) {
    const title = normalise(label.textContent || '').toLowerCase().replace(/’/g, "'");
    if (!SIDEBAR_TITLES.includes(title) || label.closest(EXCLUDED)) continue;
    const rail = label.closest('aside');
    let module: HTMLElement | null = null;
    for (let candidate = label.parentElement; candidate && candidate !== rail; candidate = candidate.parentElement) {
      // Climb past the title row to the block, then through wrappers that hold nothing else.
      if (!module) { if (normalise(candidate.textContent || '').length > title.length + 20) module = candidate; continue; }
      if (candidate.children.length !== 1) break;
      module = candidate;
    }
    if (module && module.parentElement !== rail && ![...modules].some(other => other.contains(module))) modules.add(module);
  }
  return [...modules];
}
// LinkedIn's own Sort by control at the top of the feed; the filter row sits beneath it.
export function feedSortControl(): HTMLElement | null {
  for (const control of document.querySelectorAll<HTMLElement>('main button, main [role="button"]')) {
    if (control.closest(`${POSTS}, ${COMMENT_SECTIONS}, ${EXCLUDED}`)) continue;
    if (/^sort by:/i.test(normalise(control.textContent || ''))) return control;
  }
  return null;
}

export function videoRecommendationSections(): HTMLElement[] {
  return recommendationSections('videos for you');
}
export function jobRecommendationSections(): HTMLElement[] {
  const sections = new Set(recommendationSections('jobs recommended for you'));
  // SDUI also renders this widget in a plain div, including outside <main>.
  // Its title and carousel are siblings; the carousel's <section> is not an
  // ancestor of the title. Use the nearest common wrapper with real job cards.
  const labels = document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,[role="heading"],p,span');
  for (const label of labels) {
    if (label.closest(`${COMMENT_SECTIONS}, ${EXCLUDED}, [data-view-name="job-card"], ${POST_BODY}`)) continue;
    if (normalise(label.textContent || '').toLowerCase() !== 'jobs recommended for you') continue;
    for (let candidate = label.parentElement; candidate; candidate = candidate.parentElement) {
      if (candidate.matches('html,body,main,aside,nav,[role="main"],[role="complementary"],[role="feed"]')) break;
      if (candidate.querySelector(POSTS)) break;
      if (!candidate.querySelector('[data-view-name="job-card"]') || !candidate.querySelector('[data-testid="carousel-container"], [data-view-name="feed-update-carousel"]')) continue;
      if (![...sections].some(section => section.contains(candidate))) sections.add(candidate);
      break;
    }
  }
  return [...sections];
}
function recommendationSections(title: string): HTMLElement[] {
  const sections = new Set<HTMLElement>();
  const labels = document.querySelectorAll<HTMLElement>('main h1, main h2, main h3, main h4, main [role="heading"], main p, main span');
  for (const label of labels) {
    if (normalise(label.textContent || '').toLowerCase() !== title) continue;
    // Match the module title, not somebody quoting it in a post or comment.
    if (label.closest(`${COMMENT_SECTIONS}, ${EXCLUDED}, ${POST_BODY}`)) continue;
    const main = label.closest('main');
    for (let candidate = label.parentElement; candidate && candidate !== main; candidate = candidate.parentElement) {
      if (!candidate.matches(`${POSTS}, section, article, [role="region"], [role="listitem"]`)) continue;
      // Never collapse a feed-wide wrapper containing multiple independent posts.
      if (candidate.querySelectorAll(POSTS).length > 1 || candidate.querySelector('main')) break;
      sections.add(candidate);
      break;
    }
  }
  return [...sections];
}
