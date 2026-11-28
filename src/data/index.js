import config from './config.json';

const eventFiles = import.meta.glob('./exhibitions/*.json', { query: '?url', eager: true, import: 'default' });

async function readEventFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('행사 자료를 불러올 수 없습니다.');
  return response.json();
}

export async function loadExhibitions() {
  const snapshots = await Promise.all(Object.values(eventFiles).map(readEventFile));
  snapshots.sort((first, second) => first.order - second.order);

  const exhibitions = snapshots.flatMap(snapshot => [...snapshot.exhibitions]);
  if (!exhibitions.length) throw new Error('등록된 행사가 없습니다.');
  return exhibitions;
}

export function venueLabel(event) {
  if (!event.hall || event.venue.endsWith(event.hall)) return event.venue;
  return [event.venue, event.hall].filter(Boolean).join(' · ');
}

export const eventAliases = config.eventAliases;
