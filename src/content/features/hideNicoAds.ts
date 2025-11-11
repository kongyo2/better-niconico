/**
 * ニコニ広告セクションを非表示にする機能
 * 動画プレーヤーの下部に表示される「ニコニ広告」のセクション全体を非表示にします
 * （クラシックレイアウト時も同様に非表示）
 */

const NICOAD_MARKER = 'data-bn-nicoad-hidden';

/**
 * ニコニ広告セクションを探す
 * @returns ニコニ広告セクションのコンテナ要素、または null
 */
function findNicoAdSection(): HTMLElement | null {
  // h1で「ニコニ広告」というテキストを持つ見出しを探す
  const headings = document.querySelectorAll('h1');
  for (const heading of headings) {
    const text = heading.textContent || '';
    if (text.includes('ニコニ広告')) {
      // 最も近いsection要素を取得
      const section = heading.closest('section');
      if (section) {
        return section as HTMLElement;
      }
    }
  }
  return null;
}

/**
 * ニコニ広告セクションを非表示にする
 */
function hideNicoAds(): void {
  const section = findNicoAdSection();
  if (!section) {
    return;
  }

  // セーフガード: 意図したセクションであることを確認
  // ニコニ広告セクションには「ニコニ広告」というテキストが含まれているはず
  const textContent = section.textContent || '';
  if (!textContent.includes('ニコニ広告')) {
    // テキストがまだロードされていない可能性があるため、警告は出さずに処理をスキップ
    return;
  }

  // すでに非表示の場合は何もしない（idempotency）
  if (section.style.display === 'none' || section.getAttribute(NICOAD_MARKER) === 'true') {
    return;
  }

  section.style.display = 'none';
  section.setAttribute(NICOAD_MARKER, 'true');
  console.log('[Better Niconico] ニコニ広告セクションを非表示にしました');
}

/**
 * ニコニ広告セクションを表示する
 */
function showNicoAds(): void {
  const section = findNicoAdSection();
  if (!section) {
    return;
  }

  // すでに表示されている場合は何もしない（idempotency）
  if (section.style.display !== 'none' && section.getAttribute(NICOAD_MARKER) !== 'true') {
    return;
  }

  section.style.display = '';
  section.removeAttribute(NICOAD_MARKER);
  console.log('[Better Niconico] ニコニ広告セクションを表示しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 非表示, false: 表示
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    hideNicoAds();
  } else {
    showNicoAds();
  }
}
