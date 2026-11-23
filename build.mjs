import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(projectDirectory, 'dist');
const requiredFiles = ['index.html', 'styles.css', 'app.js', 'catalogue.js', 'exhibitions.js', 'engine.js', 'comicworld.js', 'cafe2026.js', 'illustar.js'];

// Validate inputs before replacing an existing build.
for (const filename of requiredFiles) {
  const input = path.join(projectDirectory, filename);
  const file = await stat(input).catch(() => null);
  if (!file?.isFile()) throw new Error(`필수 웹 파일이 없습니다: ${filename}`);
}

const icons = (await readdir(projectDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.svg'))
  .map(entry => entry.name);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
for (const filename of [...requiredFiles, ...icons]) {
  await copyFile(path.join(projectDirectory, filename), path.join(outputDirectory, filename));
}

console.log(`정적 웹 빌드 완료: ${outputDirectory}`);
