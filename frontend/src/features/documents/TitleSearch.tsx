import { useRef, useState } from 'react';

// Keep IME composition local. URL navigation only happens on an explicit submit.
export function TitleSearch({ value, onSearch }: { value: string; onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  return <form className="title-search" onSubmit={e => { e.preventDefault(); if (!composing.current) onSearch(draft.trim()); }}>
    <label>수집 자료 제목 검색<input type="search" maxLength={200} value={draft} onChange={e => setDraft(e.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={e => { composing.current = false; setDraft(e.currentTarget.value); }} onKeyDown={e => { if (e.key === 'Enter' && (composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault(); }} placeholder="제목 입력 후 Enter 또는 검색 버튼" /></label>
    <button className="button-secondary" type="submit">제목 검색</button>
  </form>;
}
