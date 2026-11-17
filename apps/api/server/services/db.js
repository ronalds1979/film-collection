import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, '../../../..');
export const uploadsDir = path.join(projectRoot, 'apps/web/public/uploads');
const uploadsRoot = path.resolve(uploadsDir) + path.sep;

process.env.DATABASE_URL ??= `file:${path.join(projectRoot, 'film_catalog.db')}`;

export const prisma = new PrismaClient();

export const resolveUploadFilePath = (uploadPath) => {
  if (!uploadPath || !uploadPath.startsWith('/uploads/')) {
    return null;
  }
  const filename = uploadPath.slice('/uploads/'.length);
  if (!filename || filename === '.' || filename === '..' || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const resolved = path.resolve(uploadsDir, filename);
  return resolved.startsWith(uploadsRoot) ? resolved : null;
};

export const verifyUploadedCoversExist = async (payload, fields) => {
  const checks = [];
  for (const field of fields) {
    const value = payload[field];
    if (!value || (field === 'posterPath' && !value.startsWith('/uploads/'))) {
      continue;
    }
    const resolved = resolveUploadFilePath(value);
    if (!resolved) {
      return `${field} must reference an uploaded cover image.`;
    }
    checks.push(
      fs.promises.lstat(resolved).then(
        (stat) => (stat.isFile() && !stat.isSymbolicLink() ? null : `${field} references a missing uploaded cover image.`),
        () => `${field} references a missing uploaded cover image.`,
      ),
    );
  }
  if (!checks.length) return null;
  const errors = await Promise.all(checks);
  return errors.find(Boolean) || null;
};

export const cleanupReplacedCoverFiles = async (previousPaths) => {
  const uniquePaths = [...new Set(previousPaths.filter(Boolean))];
  const candidates = uniquePaths
    .map((oldPath) => ({ oldPath, resolved: resolveUploadFilePath(oldPath) }))
    .filter((item) => Boolean(item.resolved));
  if (!candidates.length) return;

  const validPaths = candidates.map((item) => item.oldPath);
  // ⚡ Bolt: Batch all replaced-cover DB reference checks into two queries instead of 2 queries per path
  const [editions, movies] = await Promise.all([
    prisma.edition.findMany({
      where: {
        OR: [
          { frontCoverPath: { in: validPaths } },
          { backCoverPath: { in: validPaths } },
          { spineImagePath: { in: validPaths } },
        ],
      },
      select: { frontCoverPath: true, backCoverPath: true, spineImagePath: true },
    }),
    prisma.movie.findMany({
      where: { posterPath: { in: validPaths } },
      select: { posterPath: true },
    }),
  ]);

  const referencedPaths = new Set();
  for (const edition of editions) {
    if (edition.frontCoverPath) referencedPaths.add(edition.frontCoverPath);
    if (edition.backCoverPath) referencedPaths.add(edition.backCoverPath);
    if (edition.spineImagePath) referencedPaths.add(edition.spineImagePath);
  }
  for (const movie of movies) {
    if (movie.posterPath) referencedPaths.add(movie.posterPath);
  }

  const tasks = [];
  for (const { oldPath, resolved } of candidates) {
    if (referencedPaths.has(oldPath)) continue;
    tasks.push(
      fs.promises.unlink(resolved).catch((error) => {
        if (error?.code !== 'ENOENT') {
          console.error('Failed to remove replaced cover file', error instanceof Error ? error.name : 'Unknown error');
        }
      }),
    );
  }
  if (tasks.length) {
    await Promise.all(tasks);
  }
};

export const cleanupOrphanedUploads = async (maxAgeMs = 24 * 60 * 60 * 1000) => {
  let entries;
  try {
    entries = await fs.promises.readdir(uploadsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('Failed to scan uploads directory for orphans', error instanceof Error ? error.name : 'Unknown error');
    }
    return;
  }

  const cutoffMs = Date.now() - maxAgeMs;
  const jpgEntries = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.jpg'));
  // ⚡ Bolt: Stat candidate upload files concurrently instead of sequentially
  const statResults = await Promise.all(
    jpgEntries.map(async (entry) => {
      const fullPath = path.join(uploadsDir, entry.name);
      try {
        const stat = await fs.promises.lstat(fullPath);
        if (stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs < cutoffMs) {
          return { fullPath, uploadPath: `/uploads/${entry.name}` };
        }
      } catch {
        // Ignore transient stat errors
      }
      return null;
    }),
  );
  const staleFiles = statResults.filter(Boolean);
  if (!staleFiles.length) return;

  const [editions, movies] = await Promise.all([
    prisma.edition.findMany({
      select: { frontCoverPath: true, backCoverPath: true, spineImagePath: true },
    }),
    prisma.movie.findMany({
      where: { posterPath: { startsWith: '/uploads/' } },
      select: { posterPath: true },
    }),
  ]);

  const referencedPaths = new Set();
  for (const edition of editions) {
    if (edition.frontCoverPath) referencedPaths.add(edition.frontCoverPath);
    if (edition.backCoverPath) referencedPaths.add(edition.backCoverPath);
    if (edition.spineImagePath) referencedPaths.add(edition.spineImagePath);
  }
  for (const movie of movies) {
    if (movie.posterPath) referencedPaths.add(movie.posterPath);
  }

  const unlinkTasks = staleFiles
    .filter((file) => !referencedPaths.has(file.uploadPath))
    .map((file) => fs.promises.unlink(file.fullPath).catch(() => {}));
  if (unlinkTasks.length) {
    await Promise.all(unlinkTasks);
  }
};

const genreOptions = [
  { id: 'GEN01', name: 'Action' },
  { id: 'GEN02', name: 'Adventure' },
  { id: 'GEN03', name: 'Animation' },
  { id: 'GEN04', name: 'Comedy' },
  { id: 'GEN05', name: 'Crime' },
  { id: 'GEN06', name: 'Documentary' },
  { id: 'GEN07', name: 'Drama' },
  { id: 'GEN08', name: 'Fantasy' },
  { id: 'GEN09', name: 'Science Fiction' },
  { id: 'GEN10', name: 'Horror' },
  { id: 'GEN11', name: 'Musical' },
  { id: 'GEN12', name: 'Romance' },
  { id: 'GEN13', name: 'Thriller' },
  { id: 'GEN14', name: 'War' },
  { id: 'GEN15', name: 'Western' },
  { id: 'GEN16', name: 'Biography' },
  { id: 'GEN17', name: 'History' },
  { id: 'GEN18', name: 'Family' },
];

let genreSeedPromise;

export const seedGenres = () => {
  if (!genreSeedPromise) {
    genreSeedPromise = prisma.$transaction(
      genreOptions.map(({ id, name }) => prisma.genre.upsert({
        where: { id },
        update: { name },
        create: { id, name },
      })),
    ).catch((error) => {
      genreSeedPromise = undefined;
      throw error;
    });
  }
  return genreSeedPromise;
};
