import { basename, dirname, join, relative, resolve } from 'path';
import { GetChangedFiles } from './git';
import { FastFindInFiles, fastFindInFiles } from 'fast-find-in-files';
import { existsSync } from 'fs';
import { ts, SyntaxKind, Node } from 'ts-morph';
import { TrueAffectedProject } from './types';

export const findRootNode = (
  node?: Node<ts.Node>
): Node<ts.Node> | undefined => {
  if (node == null) return;
  /* istanbul ignore next */
  if (node.getParent()?.getKind() === SyntaxKind.SourceFile) return node;
  return findRootNode(node.getParent());
};

export const getPackageNameByPath = (
  path: string,
  projects: TrueAffectedProject[],
  // Search files in the project root as well
  includesRoot = false,
): string | undefined => {
  return projects.map(({ name, sourceRoot }) => ({
     name,
     root: includesRoot ? sourceRoot.substring(0, sourceRoot.lastIndexOf("/")) : sourceRoot
   }))
   // In case of nested project paths (for example when there's a root project.json):
   // sort the paths from the longest to the shortest so the sub-directories come before their parent directories
   .sort((a, b) => b.root.length - a.root.length)
   .find(
    ({ root }) => path.includes(root)
  )?.name;
};

export function findNonSourceAffectedFiles(
  cwd: string,
  changedFilePath: string,
  excludeFolderPaths: string[]
): GetChangedFiles[] {
  const fileName = basename(changedFilePath);

  const files = fastFindInFiles({
    directory: cwd,
    needle: fileName,
    excludeFolderPaths: excludeFolderPaths.map((path) => join(cwd, path)),
  });

  const relevantFiles = filterRelevantFiles(cwd, files, changedFilePath);

  return relevantFiles;
}

function filterRelevantFiles(
  cwd: string,
  files: FastFindInFiles[],
  changedFilePath: string
): GetChangedFiles[] {
  const fileName = basename(changedFilePath);
  const regExp = new RegExp(`['"\`](?<relFilePath>.*${fileName})['"\`]`);

  return files
    .map(({ filePath: foundFilePath, queryHits }) => ({
      filePath: relative(cwd, foundFilePath),
      changedLines: queryHits
        .filter(({ line }) =>
          isRelevantLine(line, regExp, cwd, foundFilePath, changedFilePath)
        )
        .map(({ lineNumber }) => lineNumber),
    }))
    .filter(({ changedLines }) => changedLines.length > 0);
}

function isRelevantLine(
  line: string,
  regExp: RegExp,
  cwd: string,
  foundFilePath: string,
  changedFilePath: string
): boolean {
  const match = regExp.exec(line);
  const { relFilePath } = match?.groups ?? {};

  if (relFilePath == null) return false;

  const foundFileDir = resolve(dirname(foundFilePath));
  const changedFileDir = resolve(cwd, dirname(changedFilePath));

  const relatedFilePath = resolve(
    cwd,
    relative(cwd, join(dirname(foundFilePath), relFilePath))
  );

  return foundFileDir === changedFileDir && existsSync(relatedFilePath);
}
