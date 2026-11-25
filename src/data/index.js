import config from './config.json';

const files = import.meta.glob('./exhibitions/*.json', { query: '?url', eager: true, import: 'default' });

export async function loadExhibitions() {
  const snapshots = await Promise.all(Object.values(files).map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('행사 자료를 불러올 수 없습니다.');
    return response.json();
  }));
  const exhibitions = snapshots.sort((a, b) => a.order - b.order).flatMap(snapshot => snapshot.exhibitions);
  if (!exhibitions.length) throw new Error('등록된 행사가 없습니다.');
  return exhibitions;
}

export const eventAliases = config.eventAliases;
