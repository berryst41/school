// 홈 화면에 앱처럼 두기 위한 최소한의 서비스 워커예요. 데이터는 늘 인터넷에서 새로 받아요.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
