import { getNxProjects, getNxTrueAffectedProjects } from './nx';
import * as globby from 'globby';
import * as fs from 'fs';
import {
  projectCwd,
  workspaceCwd,
  workspaceMixedCwd,
  workspaceWithPathsCwd,
} from './mocks';

jest.mock('globby', () => ({
  globby: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

describe('nx', () => {
  describe('getNxProjects', () => {
    describe('nx workspace with workspace.json', () => {
      it('should return all found nx projects', async () => {
        const projects = await getNxProjects(workspaceCwd);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              project: {},
            }),
            expect.objectContaining({
              name: 'proj2',
              project: {},
            }),
          ])
        );
      });
    });

    describe('nx workspace with a path to projects instead of configuration', () => {
      it('should return return projects configuration using nested `project.json` files', async () => {
        jest
          .spyOn(globby, 'globby')
          .mockResolvedValue(['./proj1/project.json', './proj2/project.json']);

        const projects = await getNxProjects(workspaceWithPathsCwd);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              project: {
                name: 'proj1',
              },
            }),
            expect.objectContaining({
              name: 'proj2',
              project: {
                name: 'proj2',
              },
            }),
          ])
        );
      });
    });

    describe('nx workspace with mixed configuration and paths', () => {
      it('should return both `project.json` and `workspace.json` projects when there are no duplicates', async () => {
        jest
          .spyOn(globby, 'globby')
          .mockResolvedValue(['./proj1/project.json']);

        const projects = await getNxProjects(workspaceMixedCwd.noDuplicates);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              project: {
                name: 'proj1',
              },
            }),
            expect.objectContaining({
              name: 'proj2',
              project: {
                name: 'proj2',
              },
            }),
          ])
        );
      });

      it('should return configuration from `project.json` file when there is a duplicated configuration in `workspace.json` file', async () => {
        jest
          .spyOn(globby, 'globby')
          .mockResolvedValue(['./proj1/project.json']);

        const projects = await getNxProjects(
          workspaceMixedCwd.duplicatedConfig
        );

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              project: {
                name: 'proj1',
                sourceRoot: 'projectSourceRoot',
              },
            }),
            expect.objectContaining({
              name: 'proj2',
              project: {
                name: 'proj2',
              },
            }),
          ])
        );
      });
    });

    describe('nx workspace with nested project.json', () => {
      beforeEach(() => {
        jest
          .spyOn(globby, 'globby')
          .mockResolvedValue(['./proj1/project.json', './proj2/project.json', './proj3/project.json', './proj4/project.json']);
      });

      it('should return all found nx projects', async () => {
        const projects = await getNxProjects(projectCwd);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              project: {
                name: 'proj1',
              },
            }),
            expect.objectContaining({
              name: 'proj2',
              project: {
                name: 'proj2',
                targets: { build: {} }
              },
            }),
            expect.objectContaining({
              name: 'proj3',
              project: {
                name: 'proj3',
                targets: {
                  build: {
                    options: {}
                  }
                }
              },
            }),
            expect.objectContaining({
              name: 'proj4',
              project: {
                name: 'proj4',
                targets: {
                  build: {
                    options: {
                      tsConfig: 'proj4/tsconfig.json'
                    }
                  }
                }
              },
            }),
          ])
        );
      });
    });

    describe('no nx workspace and no nested project.json', () => {
      it('should return an empty array', async () => {
        const projects = await getNxProjects('.');

        expect(projects).toEqual([]);
      });
    });
  });

  describe('getNxTrueAffectedProjects', () => {
    beforeAll(() => {
      jest.spyOn(globby, 'globby').mockResolvedValue(['./proj1/project.json']);
    });

    describe('tsConfig is set in build options', () => {
      it('should return build script tsConfig if exists', async () => {
        jest.spyOn(fs.promises, 'readFile').mockImplementation((pathLike) => {
          const path = pathLike.toString();

          if (path.endsWith('proj1/project.json')) {
            return Promise.resolve(
              JSON.stringify({
                name: 'proj1',
                sourceRoot: 'proj1/src',
                targets: {
                  build: {
                    options: {
                      tsConfig: 'proj1/tsconfig.custom.json',
                    },
                  },
                },
              })
            );
          }

          return Promise.reject('File not found');
        });

        const cwd = 'libs/nx/src/__fixtures__/nx-project';
        const projects = await getNxTrueAffectedProjects(cwd);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              tsConfig: 'proj1/tsconfig.custom.json',
            }),
          ])
        );
      });
    });

    describe('tsConfig is not set in build options', () => {
      describe('fallback tsconfig is not found', () => {
        beforeEach(() => {
          jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        });

        it('should eventually return tsconfig.json', async () => {
          jest.spyOn(fs.promises, 'readFile').mockImplementation((pathLike) => {
            const path = pathLike.toString();

            if (path.endsWith('proj1/project.json')) {
              return Promise.resolve(
                JSON.stringify({
                  name: 'proj1',
                  sourceRoot: 'proj1/src',
                })
              );
            }

            return Promise.reject('File not found');
          });

          const cwd = 'libs/nx/src/__fixtures__/nx-project';
          const projects = await getNxTrueAffectedProjects(cwd);

          expect(projects).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'proj1',
                tsConfig: expect.stringContaining('proj1/tsconfig.json'),
              }),
            ])
          );
        });
      });

      describe('fallback tsconfig is found', () => {
        beforeEach(() => {
          jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        });

        describe('projectType is library', () => {
          it('should return tsconfig.lib.json', async () => {
            jest
              .spyOn(fs.promises, 'readFile')
              .mockImplementation((pathLike) => {
                const path = pathLike.toString();

                if (path.endsWith('proj1/project.json')) {
                  return Promise.resolve(
                    JSON.stringify({
                      name: 'proj1',
                      sourceRoot: 'proj1/src',
                      projectType: 'library',
                    })
                  );
                }

                return Promise.reject('File not found');
              });

            const cwd = 'libs/nx/src/__fixtures__/nx-project';
            const projects = await getNxTrueAffectedProjects(cwd);

            expect(projects).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'proj1',
                  tsConfig: expect.stringContaining('proj1/tsconfig.lib.json'),
                }),
              ])
            );
          });

          it('should return tsconfig.json if tsconfig.lib.json was not found', async () => {
            jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
            jest
              .spyOn(fs.promises, 'readFile')
              .mockImplementation((pathLike) => {
                const path = pathLike.toString();

                if (path.endsWith('proj1/project.json')) {
                  return Promise.resolve(
                    JSON.stringify({
                      name: 'proj1',
                      sourceRoot: 'proj1/src',
                      projectType: 'library',
                    })
                  );
                }

                return Promise.reject('File not found');
              });

            const cwd = 'libs/nx/src/__fixtures__/nx-project';
            const projects = await getNxTrueAffectedProjects(cwd);

            expect(projects).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'proj1',
                  tsConfig: expect.stringContaining('proj1/tsconfig.json'),
                }),
              ])
            );
          });
        });

        describe('projectType is application', () => {
          it('should return tsconfig.app.json if projectType is application', async () => {
            jest
              .spyOn(fs.promises, 'readFile')
              .mockImplementation((pathLike) => {
                const path = pathLike.toString();

                if (path.endsWith('proj1/project.json')) {
                  return Promise.resolve(
                    JSON.stringify({
                      name: 'proj1',
                      sourceRoot: 'proj1/src',
                      projectType: 'application',
                    })
                  );
                }

                return Promise.reject('File not found');
              });

            const cwd = 'libs/nx/src/__fixtures__/nx-project';
            const projects = await getNxTrueAffectedProjects(cwd);

            expect(projects).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'proj1',
                  tsConfig: expect.stringContaining('proj1/tsconfig.app.json'),
                }),
              ])
            );
          });

          it('should return tsconfig.json if tsconfig.app.json was not found', async () => {
            jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
            jest
              .spyOn(fs.promises, 'readFile')
              .mockImplementation((pathLike) => {
                const path = pathLike.toString();

                if (path.endsWith('proj1/project.json')) {
                  return Promise.resolve(
                    JSON.stringify({
                      name: 'proj1',
                      sourceRoot: 'proj1/src',
                      projectType: 'application',
                    })
                  );
                }

                return Promise.reject('File not found');
              });

            const cwd = 'libs/nx/src/__fixtures__/nx-project';
            const projects = await getNxTrueAffectedProjects(cwd);

            expect(projects).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'proj1',
                  tsConfig: expect.stringContaining('proj1/tsconfig.json'),
                }),
              ])
            );
          });
        });
      });
    });

    describe('implicit dependencies', () => {
      it('should return implicit dependencies from project config', async () => {
        jest.spyOn(fs.promises, 'readFile').mockImplementation((pathLike) => {
          const path = pathLike.toString();

          if (path.endsWith('proj1/project.json')) {
            return Promise.resolve(
              JSON.stringify({
                name: 'proj1',
                sourceRoot: 'proj1/src',
                implicitDependencies: ['proj2'],
              })
            );
          }

          if (path.endsWith('proj2/project.json')) {
            return Promise.resolve(
              JSON.stringify({
                name: 'proj2',
                sourceRoot: 'proj2/src',
              })
            );
          }

          return Promise.reject('File not found');
        });

        const cwd = 'libs/nx/src/__fixtures__/nx-project';
        const projects = await getNxTrueAffectedProjects(cwd);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              implicitDependencies: ['proj2'],
            }),
          ])
        );
      });

      it('should fallback to empty array if implicit dependencies are not set', async () => {
        jest.spyOn(fs.promises, 'readFile').mockImplementation((pathLike) => {
          const path = pathLike.toString();

          if (path.endsWith('proj1/project.json')) {
            return Promise.resolve(
              JSON.stringify({
                name: 'proj1',
                sourceRoot: 'proj1/src',
              })
            );
          }

          return Promise.reject('File not found');
        });

        const cwd = 'libs/nx/src/__fixtures__/nx-project';
        const projects = await getNxTrueAffectedProjects(cwd);

        expect(projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'proj1',
              implicitDependencies: [],
            }),
          ])
        );
      });
    });
  });
});
