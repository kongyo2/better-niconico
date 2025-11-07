/**
 * プレミアム会員セクションを非表示にする機能
 * "プレミアム会員なら動画が見放題！" のセクションを非表示にします
 */

const PREMIUM_SELECTOR = '.TagPushVideosContainer';
const PREMIUM_MARKER = 'data-bn-premium-hidden';

/**
 * プレミアム会員セクションを非表示にする
 */
function hidePremiumSection(): void {
  const container = document.querySelector(PREMIUM_SELECTOR);
  if (!container) {
    return;
  }

  const parentBlock = container.closest('.BaseLayout-block') as HTMLElement;
  if (!parentBlock) {
    return;
  }

  // セーフガード: 意図したセクションであることを確認
  // プレミアムセクションには特定のテキストが含まれているはず
  const textContent = parentBlock.textContent || '';
  if (!textContent.includes('プレミアム') && !textContent.includes('見放題')) {
    console.warn('[Better Niconico] プレミアムセクションの検証に失敗しました');
    return;
  }

  // すでに非表示の場合は何もしない
  if (parentBlock.style.display === 'none' || parentBlock.getAttribute(PREMIUM_MARKER) === 'true') {
    return;
  }

  parentBlock.style.display = 'none';
  parentBlock.setAttribute(PREMIUM_MARKER, 'true');
  console.log('[Better Niconico] プレミアム会員セクションを非表示にしました');
}

/**
 * プレミアム会員セクションを表示する
 */
function showPremiumSection(): void {
  const container = document.querySelector(PREMIUM_SELECTOR);
  if (!container) {
    return;
  }

  const parentBlock = container.closest('.BaseLayout-block') as HTMLElement;
  if (!parentBlock) {
    return;
  }

  // すでに表示されている場合は何もしない
  if (parentBlock.style.display !== 'none' && parentBlock.getAttribute(PREMIUM_MARKER) !== 'true') {
    return;
  }

  parentBlock.style.display = '';
  parentBlock.removeAttribute(PREMIUM_MARKER);
  console.log('[Better Niconico] プレミアム会員セクションを表示しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 非表示, false: 表示
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    hidePremiumSection();
  } else {
    showPremiumSection();
  }
}
