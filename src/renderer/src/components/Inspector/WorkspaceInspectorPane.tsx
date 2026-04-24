import { Folder, GitBranch } from 'lucide-react';
import { useWorkspaceInspector } from '../../store/workspaceInspector';
import { INSPECTOR_THEME } from './inspectorTheme';

export function WorkspaceInspectorPane(): JSX.Element {
  const { activeTab, selectTab } = useWorkspaceInspector();

  return (
    <div className={`flex h-full flex-col ${INSPECTOR_THEME.panel}`}>
      {/* Tab bar */}
      <div className={`flex flex-row ${INSPECTOR_THEME.tabBar}`}>
        <button
          className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${
            activeTab === 'files' ? INSPECTOR_THEME.tabActive : INSPECTOR_THEME.tabInactive
          }`}
          onClick={() => selectTab('files')}
        >
          <Folder size={12} />
          Files
        </button>
        <button
          className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${
            activeTab === 'changes' ? INSPECTOR_THEME.tabActive : INSPECTOR_THEME.tabInactive
          }`}
          onClick={() => selectTab('changes')}
        >
          <GitBranch size={12} />
          Changes
        </button>
      </div>

      {/* Body placeholder */}
      <div className={`flex-1 p-3 ${INSPECTOR_THEME.body}`}>
        <p className={INSPECTOR_THEME.textDim}>
          {activeTab === 'files' ? 'Files tree coming soon.' : 'Git changes coming soon.'}
        </p>
      </div>
    </div>
  );
}
