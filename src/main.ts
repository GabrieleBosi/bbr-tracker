import './styles.css';
import { initStore } from './storage/db';
import { renderApp } from './ui/render';

async function boot(): Promise<void> {
  await initStore();
  renderApp();
}

void boot();
