export default function getTimeFormat(): 'h12' | 'h23' {
  if(typeof document === 'undefined' || !document.body) {
    // Worker / service worker / SSR: fall back to 24‑hour format
    return 'h23';
  }

  // https://stackoverflow.com/a/61676104
  const t = document.createElement('input');
  t.type = 'time';
  t.value = '15:00';
  t.style.visibility = 'hidden';
  document.body.append(t);
  const offsetWidth = t.offsetWidth;
  t.remove();
  const timeFormat = offsetWidth > 110 ? 'h12' : 'h23';
  // console.log('timeFormat', timeFormat, offsetWidth);
  return timeFormat;
}
