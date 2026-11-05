import { render } from 'preact';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import './styles/base.css';
import './ui/ui.css';
import './app/shell.css';
import { App } from './app/App';
import { installAutoDirection } from './ui/bidi';
import { initSession } from './data/session';
import { startApp } from './app/start';
import { buildId, canonicalHost, forwardedHosts } from './config';
import { layout } from './app/layout';

// One origin for the wall: the OAuth client and the browser storage (Firestore
// cache, offline snapshot) are both per origin.
if (forwardedHosts.includes(location.hostname))
  location.replace(`https://${canonicalHost}${location.pathname}${location.search}`);

document.documentElement.dataset.build = buildId;
document.documentElement.dataset.layout = layout;

installAutoDirection();
initSession();
startApp();
render(<App />, document.getElementById('app')!);
