export function ShareButton({ hasSelection, hasRoute, onClick }) {
  if (!hasSelection) return null;
  const label = hasRoute ? '동선 공유' : '부스 선택 공유';
  return <button className="text-button share-button" type="button" onClick={onClick}>{label}</button>;
}

function openDialog(dialog) {
  dialog?.showModal();
}

export function ShareDialog({ url, onClose, notice }) {
  async function copyLink(click) {
    const form = click.currentTarget.form;
    const dialog = form.closest('dialog');
    try {
      await navigator.clipboard.writeText(url);
      if (dialog.isConnected) dialog.close();
      notice('동선 링크를 복사했습니다.');
    } catch {
      if (dialog.isConnected) form.elements.shareLink.select();
      notice('선택한 링크를 복사해 공유하세요.');
    }
  }

  return (
    <dialog className="share-dialog" aria-labelledby="share-title" onClose={onClose} ref={openDialog}>
      <form method="dialog">
        <div className="section-heading">
          <h2 id="share-title">동선 공유</h2>
          <button className="text-button" aria-label="공유 창 닫기">닫기</button>
        </div>
        <div className="share-fields">
          <input name="shareLink" type="url" value={url} readOnly aria-label="공유할 동선 링크" />
          <button className="primary" type="button" onClick={copyLink}>링크 복사</button>
        </div>
      </form>
    </dialog>
  );
}
