import { Folder, GitBranch } from 'lucide-react';
import { useWorkspaceInspector } from '../../store/workspaceInspector';
import { INSPECTOR_THEME } from './inspectorTheme';
import { FilesPanel } from './files/FilesPanel';
import { ChangesPanel } from './changes/ChangesPanel';

export function WorkspaceInspectorPane(): JSX.Element {
  const { activeTab, selectTab } = useWorkspaceInspector();

  return (
    <div className={`flex h-full flex-col ${INSPECTOR_THEME.panel}`}>
      <div className={`flex flex-row ${INSPECTOR_THEME.tabBar}`}>
        <button
          className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${
            activeTab === 'files' ? INSPECTOR_THEME.tabActive : INSPECTOR_THEME.tabInactive
          }`}
          onClick={() => selectTab('files')}
        >
          <Folder size={12} />
          文件
        </button>
        <button
          className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${
            activeTab === 'changes' ? INSPECTOR_THEME.tabActive : INSPECTOR_THEME.tabInactive
          }`}
          onClick={() => selectTab('changes')}
        >
          <GitBranch size={12} />
          变更
        </button>
      </div>

      <div className={`flex-1 overflow-hidden ${INSPECTOR_THEME.body}`}>
        {activeTab === 'files' ? <FilesPanel /> : <ChangesPanel />}
      </div>
    </div>
  );
}
