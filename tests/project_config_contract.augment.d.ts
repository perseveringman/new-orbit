import '../src/main/project';

declare module '../src/main/project' {
  interface ProjectConfig {
    setup?: unknown[];
    teardown?: unknown[];
    [key: string]: unknown;
  }
}
