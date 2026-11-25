import { useEffect, useRef } from 'react';

export function ShareDialog({ url, onClose, notice }) {
  const dialog = useRef(null);
  const field = useRef(null);

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      dialog.current?.close();
      notice('동선 링크를 복사했습니다.');
    } catch {
      field.current?.select();
      notice('선택한 링크를 복사해 공유하세요.');
    }
  }

  return (
    <dialog className="share-dialog" aria-labelledby="share-title" onClose={onClose} ref={dialog}>
      <form method="dialog">
        <div className="section-heading">
          <h2 id="share-title">동선 공유</h2>
          <button className="text-button" aria-label="공유 창 닫기">닫기</button>
        </div>
        <div className="share-fields">
          <input ref={field} type="url" value={url} readOnly aria-label="공유할 동선 링크" />
          <button className="primary" type="button" onClick={copyLink}>링크 복사</button>
        </div>
      </form>
    </dialog>
  );
}
