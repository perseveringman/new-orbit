import { describe, expect, it } from 'vitest';
import {
  deriveTopBarContext,
  WORKSPACE_DESTINATIONS
} from '../src/renderer/src/components/topbarModel';

describe('top bar model', () => {
  it('keeps workspace destinations in the sidebar navigation model', () => {
    expect(WORKSPACE_DESTINATIONS.map((item) => item.label)).toEqual([
      '仪表盘',
      '随处问',
      '愿景',
      'AI 控制台',
      '工具',
      '角色模板',
      '开发者控制台',
      'GitHub',
      '收件箱',
      '笔记',
      '资料库',
      '搜索',
      '记忆',
      '复盘',
      '信息流',
      '连接器',
      '资源',
      '时间线',
      '计划任务',
      '网关',
      '日志',
      '看板'
    ]);
  });

  it('describes the dashboard as workspace context', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'dashboard' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: '工作台',
      title: '仪表盘',
      detail: 'Orbit Vault · 查看愿景、PARA 健康度和项目动态。',
      stateLabel: null
    });
  });

  it('describes 随处问 as a first-class workspace surface', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'askAnywhere' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: '工作台',
      title: '随处问',
      detail: 'Orbit Vault · 围绕 vault 上下文持续进行 AI 对话。',
      stateLabel: null
    });
  });

  it('uses the active project for project-room context', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'project', projectUid: 'p-1' },
        projects: [
          {
            uid: 'p-1',
            name: 'Moonshot',
            description: 'Launch the next release train',
            relPath: '01_Projects/Moonshot'
          }
        ],
        activeProjectUid: 'p-1',
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: '项目空间',
      title: 'Moonshot',
      detail: 'Launch the next release train',
      stateLabel: '活跃项目'
    });
  });

  it('surfaces the open file and dirty state inside the editor', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'editor' },
        projects: [],
        activeProjectUid: null,
        activeFile: {
          relPath: '01_Projects/Moonshot/README.md',
          dirty: true
        },
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: '编辑器',
      title: 'README.md',
      detail: '01_Projects/Moonshot/README.md',
      stateLabel: '有未保存更改'
    });
  });

  it('describes the workspace github control plane', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'github' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: '工作台',
      title: 'GitHub',
      detail: 'Orbit Vault · 连接账号、导入仓库并监控 GitHub 交付状态。',
      stateLabel: null
    });
  });

  it('describes the workspace runtime control plane', () => {
    expect(
      deriveTopBarContext({
        view: { kind: 'runtimes' },
        projects: [],
        activeProjectUid: null,
        activeFile: null,
        vaultPath: '/Users/ryan/Orbit Vault'
      })
    ).toEqual({
      eyebrow: '工作台',
      title: 'AI 控制台',
      detail: 'Orbit Vault · 管理 CLI runtime、SDK 端点、角色路由和编排健康度。',
      stateLabel: null
    });
  });
});
