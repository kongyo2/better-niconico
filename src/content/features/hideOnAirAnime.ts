/**
 * TV放送中のアニメセクションを非表示にする機能
 * "TV放送中のアニメ" のセクションを非表示にします
 */

const ANIME_SELECTOR = '.OnTvAnimeVideosContainer';
const ANIME_MARKER = 'data-bn-anime-hidden';

/**
 * TV放送中のアニメセクションを非表示にする
 * Separatorも一緒に非表示にして下線が残らないようにする
 */
function hideOnAirAnime(): void {
  const container = document.querySelector(ANIME_SELECTOR);
  if (!container) {
    return;
  }

  const parentBlock = container.closest('.BaseLayout-block') as HTMLElement;
  if (!parentBlock) {
    return;
  }

  // セーフガード: 意図したセクションであることを確認
  // アニメセクションには特定のテキストが含まれているはず
  const textContent = parentBlock.textContent || '';
  if (!textContent.includes('TV放送中') && !textContent.includes('アニメ')) {
    console.warn('[Better Niconico] アニメセクションの検証に失敗しました');
    return;
  }

  // すでに非表示の場合は何もしない
  if (parentBlock.style.display === 'none' || parentBlock.getAttribute(ANIME_MARKER) === 'true') {
    return;
  }

  parentBlock.style.display = 'none';
  parentBlock.setAttribute(ANIME_MARKER, 'true');
  console.log('[Better Niconico] TV放送中のアニメセクションを非表示にしました');
}

/**
 * TV放送中のアニメセクションを表示する
 */
function showOnAirAnime(): void {
  const container = document.querySelector(ANIME_SELECTOR);
  if (!container) {
    return;
  }

  const parentBlock = container.closest('.BaseLayout-block') as HTMLElement;
  if (!parentBlock) {
    return;
  }

  // すでに表示されている場合は何もしない
  if (parentBlock.style.display !== 'none' && parentBlock.getAttribute(ANIME_MARKER) !== 'true') {
    return;
  }

  parentBlock.style.display = '';
  parentBlock.removeAttribute(ANIME_MARKER);
  console.log('[Better Niconico] TV放送中のアニメセクションを表示しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 非表示, false: 表示
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    hideOnAirAnime();
  } else {
    showOnAirAnime();
  }
}
