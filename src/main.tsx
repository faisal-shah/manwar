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
import { initSession } from './data/session';
import { startApp } from './app/start';

initSession();
startApp();
render(<App />, document.getElementById('app')!);
