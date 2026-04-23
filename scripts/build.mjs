import { mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

async function build() {
  if (existsSync('dist')) {
    await rm('dist', { recursive: true, force: true });
  }

  await mkdir('dist', { recursive: true });
  await cp('src/index.html', 'dist/index.html');
  await cp('src/styles.css', 'dist/styles.css');
  await cp('src/app.js', 'dist/app.js');

  console.log('Build completed: dist/ folder is ready to deploy.');
}

build();
