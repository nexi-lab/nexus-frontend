export type TranslationKey = 
  | 'common.loading'
  | 'common.error'
  | 'common.success'
  | 'common.cancel'
  | 'common.confirm'
  | 'common.save'
  | 'common.delete'
  | 'common.edit'
  | 'common.create'
  | 'common.close'
  | 'common.search'
  | 'common.login'
  | 'common.logout'
  | 'common.export'
  | 'common.settings'
  | 'common.language'
  | 'common.theme'
  | 'common.english'
  | 'common.chinese'
  | 'landing.nexus'
  | 'landing.user'
  | 'landing.tenant'
  | 'landing.workspace'
  | 'landing.memory'
  | 'landing.agent'
  | 'landing.connector'
  | 'landing.skill'
  | 'landing.admin'
  | 'landing.authError'
  | 'landing.updateApiKey'
  | 'landing.showAiPanel'
  | 'landing.hideAiPanel'
  | 'landing.docs'
  | 'landing.api'
  | 'landing.help'
  | 'login.title'
  | 'login.description'
  | 'login.placeholder'
  | 'login.enterApiKey'
  | 'login.invalidKey'
  | 'login.validating'
  | 'login.success'
  | 'skill.title'
  | 'skill.upload'
  | 'skill.description'
  | 'skill.all'
  | 'skill.personal'
  | 'skill.system'
  | 'skill.loadFailed'
  | 'skill.notFound'
  | 'skill.uploadFirst'
  | 'skill.saved'
  | 'skill.saveFailed'
  | 'skill.deleteConfirm'
  | 'skill.deleted'
  | 'skill.deleteFailed'
  | 'skill.exported'
  | 'skill.exportFailed'
  | 'skill.edit'
  | 'skill.loadContentFailed'
  | 'skill.dependencies'
  | 'skill.by'
  | 'agent.title'
  | 'agent.create'
  | 'agent.edit'
  | 'agent.list'
  | 'agent.name'
  | 'agent.descriptionLabel'
  | 'agent.platform'
  | 'agent.endpoint'
  | 'agent.apiKey'
  | 'agent.generateKey'
  | 'agent.inheritPermissions'
  | 'agent.register'
  | 'agent.registering'
  | 'agent.registered'
  | 'agent.registerFailed'
  | 'agent.deleteConfirm'
  | 'agent.deleted'
  | 'agent.deleteFailed'
  | 'agent.loadFailed'
  | 'agent.noAgents'
  | 'agent.createFirst'
  | 'agent.description'
  | 'agent.myAgents'
  | 'agent.useAgent'
  | 'agent.registerNew'
  | 'agent.nameCannotChange'
  | 'agent.endpointDescription'
  | 'agent.agentId'
  | 'agent.agentIdDescription'
  | 'agent.generateApiKey'
  | 'agent.ownApiKey'
  | 'agent.recommendedAuth'
  | 'agent.inheritPermissionsDesc'
  | 'agent.inheritsAll'
  | 'agent.zeroPermissions'
  | 'agent.grantSkills'
  | 'agent.loadingSkills'
  | 'agent.noSkillsAvailable'
  | 'agent.selectSkillsDesc'
  | 'agent.skillsAccess'
  | 'agent.connectorsAccess'
  | 'agent.loadingConnectors'
  | 'agent.noConnectorsAvailable'
  | 'agent.selectConnectorsDesc'
  | 'agent.grantConnectors'
  | 'agent.workspacesAccess'
  | 'agent.grantAllWorkspaces'
  | 'agent.allWorkspacesDesc'
  | 'agent.individualWorkspaces'
  | 'agent.loadingWorkspaces'
  | 'agent.noWorkspacesAvailable'
  | 'agent.allWorkspacesEnabled'
  | 'agent.grantBaseAccess'
  | 'agent.directoryAccess'
  | 'agent.memory'
  | 'agent.memoryDesc'
  | 'agent.resources'
  | 'agent.resourcesDesc'
  | 'agent.grantDirectory'
  | 'agent.grantDirectoryDesc'
  | 'agent.permissionModel'
  | 'agent.fullPermissionsAuto'
  | 'agent.fullPermissionsKey'
  | 'agent.zeroPermissionsRec'
  | 'agent.inheritsOwner'
  | 'agent.inheritsOwnerDesc'
  | 'agent.explicitPermissions'
  | 'agent.explicitPermissionsDesc'
  | 'agent.readOnly'
  | 'agent.readWrite'
  | 'agent.namePlaceholder'
  | 'agent.nameDescription'
  | 'agent.descriptionPlaceholder'
  | 'agent.all'
  | 'agent.resource'
  | 'workspace.title'
  | 'workspace.new'
  | 'workspace.myWorkspaces'
  | 'workspace.description'
  | 'workspace.name'
  | 'workspace.namePlaceholder'
  | 'workspace.nameDescription'
  | 'workspace.descriptionLabel'
  | 'workspace.descriptionPlaceholder'
  | 'workspace.whatAre'
  | 'workspace.whatAreDesc'
  | 'workspace.about'
  | 'workspace.aboutDesc'
  | 'workspace.loading'
  | 'workspace.noWorkspaces'
  | 'workspace.createFirst'
  | 'workspace.loadFailed'
  | 'workspace.nameRequired'
  | 'workspace.createFailed'
  | 'workspace.creating'
  | 'workspace.create'
  | 'workspace.reset'
  | 'workspace.deleteConfirm'
  | 'workspace.deleteFailed'
  | 'workspace.created'
  | 'memory.title'
  | 'memory.register'
  | 'memory.description'
  | 'memory.myMemories'
  | 'memory.storedMemories'
  | 'memory.registerNew'
  | 'memory.path'
  | 'memory.pathPlaceholder'
  | 'memory.pathDescription'
  | 'memory.name'
  | 'memory.nameDescription'
  | 'memory.descriptionLabel'
  | 'memory.descriptionPlaceholder'
  | 'memory.loading'
  | 'memory.noMemories'
  | 'memory.registerFirst'
  | 'memory.loadFailed'
  | 'memory.pathRequired'
  | 'memory.pathNoSlash'
  | 'memory.registerFailed'
  | 'memory.registering'
  | 'memory.deleteConfirm'
  | 'memory.deleteFailed'
  | 'memory.unregisterConfirm'
  | 'memory.unregisterFailed'
  | 'connector.title'
  | 'connector.add'
  | 'connector.description'
  | 'connector.connectors'
  | 'connector.integrations'
  | 'connector.saved'
  | 'connector.configured'
  | 'connector.noConfigured'
  | 'connector.loading'
  | 'connector.noSaved'
  | 'connector.addFirst'
  | 'connector.active'
  | 'connector.notLoaded'
  | 'connector.readOnly'
  | 'connector.load'
  | 'connector.delete'
  | 'connector.deleteConfirm'
  | 'connector.loaded'
  | 'connector.loadFailed'
  | 'connector.deleted'
  | 'connector.deleteFailed';

export const translations: Record<'en' | 'ch', Record<TranslationKey, string>> = {
  en: {
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.login': 'Login',
    'common.logout': 'Logout',
    'common.export': 'Export',
    'common.settings': 'Settings',
    'common.language': 'Language',
    'common.theme': 'Theme',
    'common.english': 'English',
    'common.chinese': '中文',
    'landing.nexus': 'Nexus',
    'landing.user': 'User',
    'landing.tenant': 'Tenant',
    'landing.workspace': 'Workspace',
    'landing.memory': 'Memory',
    'landing.agent': 'Agent',
    'landing.connector': 'Connector',
    'landing.skill': 'Skill',
    'landing.admin': 'Admin',
    'landing.authError': 'Authentication Error',
    'landing.updateApiKey': 'Update API Key',
    'landing.showAiPanel': 'Show AI panel',
    'landing.hideAiPanel': 'Hide AI panel',
    'landing.docs': 'Docs',
    'landing.api': 'API',
    'landing.help': 'Help',
    'login.title': 'Login to NexusFS',
    'login.description': 'Enter your API key to access the file system',
    'login.placeholder': 'Enter API Key',
    'login.enterApiKey': 'Please enter an API key',
    'login.invalidKey': 'Invalid API key',
    'login.validating': 'Validating...',
    'login.success': 'Login successful',
    'skill.title': 'Skills',
    'skill.upload': 'Upload Skill',
    'skill.description': 'Manage and upload skills for your Nexus instance. Skills can be personal or system-wide.',
    'skill.all': 'All Skills',
    'skill.personal': 'Personal',
    'skill.system': 'System',
    'skill.loadFailed': 'Failed to load skills',
    'skill.notFound': 'No skills found',
    'skill.uploadFirst': 'Upload your first skill to get started',
    'skill.saved': 'Skill saved successfully',
    'skill.saveFailed': 'Failed to save skill',
    'skill.deleteConfirm': 'Are you sure you want to delete the skill "{name}"?',
    'skill.deleted': 'Skill "{name}" deleted successfully',
    'skill.deleteFailed': 'Failed to delete skill',
    'skill.exported': 'Skill "{name}" exported successfully',
    'skill.exportFailed': 'Failed to export skill',
    'skill.edit': 'Edit Skill',
    'skill.loadContentFailed': 'Failed to load skill content',
    'skill.dependencies': 'Dependencies',
    'skill.by': 'By',
    'agent.title': 'Agents',
    'agent.create': 'Create Agent',
    'agent.edit': 'Edit Agent',
    'agent.list': 'Agent List',
    'agent.name': 'Name',
    'agent.descriptionLabel': 'Description',
    'agent.platform': 'Platform',
    'agent.endpoint': 'Endpoint',
    'agent.apiKey': 'API Key',
    'agent.generateKey': 'Generate API Key',
    'agent.inheritPermissions': 'Inherit Permissions',
    'agent.register': 'Register',
    'agent.registering': 'Registering...',
    'agent.registered': 'Agent registered successfully',
    'agent.registerFailed': 'Failed to register agent',
    'agent.deleteConfirm': 'Are you sure you want to delete the agent "{name}"?',
    'agent.deleted': 'Agent deleted successfully',
    'agent.deleteFailed': 'Failed to delete agent',
    'agent.loadFailed': 'Failed to load agents',
    'agent.noAgents': 'No agents found',
    'agent.createFirst': 'Create your first agent to get started',
    'agent.description': 'Manage your AI agents for delegation and multi-agent workflows. Agents inherit all your permissions.',
    'agent.myAgents': 'My Agents',
    'agent.useAgent': 'Use Agent',
    'agent.registerNew': 'Register New Agent',
    'agent.nameCannotChange': 'Agent name cannot be changed',
    'agent.endpointDescription': 'Agent service endpoint URL',
    'agent.agentId': 'Agent ID',
    'agent.agentIdDescription': 'Agent identifier for routing (default: agent)',
    'agent.generateApiKey': 'Generate API key for agent',
    'agent.ownApiKey': 'Agent will have its own API key (for independent authentication)',
    'agent.recommendedAuth': 'Recommended: Agent will use owner\'s credentials + X-Agent-ID header',
    'agent.inheritPermissionsDesc': 'Inherit owner\'s permissions',
    'agent.inheritsAll': '✓ Agent inherits all your permissions',
    'agent.zeroPermissions': '⚠️ Agent starts with 0 permissions (grant via ReBAC)',
    'agent.grantSkills': 'Grant Skills Access (Optional)',
    'agent.loadingSkills': 'Loading skills...',
    'agent.noSkillsAvailable': 'No skills available',
    'agent.selectSkillsDesc': 'Select skills to grant READ-ONLY access. The agent will be able to use these skills.',
    'agent.skillsAccess': 'Skills Access',
    'agent.connectorsAccess': 'Connectors Access',
    'agent.loadingConnectors': 'Loading connectors...',
    'agent.noConnectorsAvailable': 'No connectors available',
    'agent.selectConnectorsDesc': 'Select connectors and choose permission level (Read-Only or Read-Write).',
    'agent.grantConnectors': 'Grant Connectors Access (Optional)',
    'agent.workspacesAccess': 'Workspaces Access',
    'agent.grantAllWorkspaces': 'Grant access to ALL workspaces',
    'agent.allWorkspacesDesc': 'Base permission for all current and future workspaces',
    'agent.individualWorkspaces': 'Individual Workspace Permissions (Optional)',
    'agent.loadingWorkspaces': 'Loading workspaces...',
    'agent.noWorkspacesAvailable': 'No workspaces available',
    'agent.allWorkspacesEnabled': '✓ All workspaces access enabled. Individual permissions can override or enhance the base permission (e.g., read-only for all, read-write for specific workspaces).',
    'agent.grantBaseAccess': 'Grant base access to all workspaces, or select individual workspaces for granular control.',
    'agent.directoryAccess': 'Directory Access',
    'agent.memory': 'Memory (/memory)',
    'agent.memoryDesc': 'Agent can access memory storage',
    'agent.resources': 'Resources (/resource)',
    'agent.resourcesDesc': 'Agent can access resource files',
    'agent.grantDirectory': 'Grant Directory Access (Optional)',
    'agent.grantDirectoryDesc': 'Grant READ-ONLY access to entire directories.',
    'agent.permissionModel': 'Permission Model:',
    'agent.fullPermissionsAuto': 'Full Permissions: Agent uses your credentials and inherits all your permissions automatically.',
    'agent.fullPermissionsKey': 'Full Permissions: Agent has its own API key but inherits all your permissions.',
    'agent.zeroPermissionsRec': 'Zero Permissions (Recommended): Agent starts with no permissions. Grant specific permissions via ReBAC for principle of least privilege.',
    'agent.inheritsOwner': 'This agent inherits all owner permissions',
    'agent.inheritsOwnerDesc': 'This agent currently uses your credentials and has full access to all your resources. To restrict access, grant specific permissions below using the principle of least privilege.',
    'agent.explicitPermissions': 'Explicit permissions configured',
    'agent.explicitPermissionsDesc': 'This agent has specific permissions granted below. It can only access the resources you\'ve explicitly allowed.',
    'agent.readOnly': 'Read-Only',
    'agent.readWrite': 'Read-Write',
    'agent.namePlaceholder': 'data_analyst',
    'agent.nameDescription': 'Unique name for your agent (lowercase, alphanumeric, underscores, hyphens only)',
    'agent.descriptionPlaceholder': 'A general assistant that helps with various tasks...',
    'agent.all': 'All',
    'agent.resource': 'Resource',
    'workspace.title': 'Workspace',
    'workspace.new': 'New Workspace',
    'workspace.myWorkspaces': 'My Workspaces',
    'workspace.description': 'Manage your workspaces for organizing files and projects. Workspaces support version control through snapshots.',
    'workspace.name': 'Workspace Name',
    'workspace.namePlaceholder': 'my-project',
    'workspace.nameDescription': 'Workspace name (will be automatically placed in tenant/user namespace with UUID suffix)',
    'workspace.descriptionLabel': 'Description',
    'workspace.descriptionPlaceholder': 'Project description...',
    'workspace.whatAre': 'What are workspaces?',
    'workspace.whatAreDesc': 'Workspaces are registered directories that support version control through snapshots. You can create snapshots, restore to previous versions, and compare changes.',
    'workspace.about': 'About workspaces:',
    'workspace.aboutDesc': 'Workspaces organize your files and enable snapshots for version control. Workspaces are created using the multi-tenant namespace convention with automatic ReBAC ownership.',
    'workspace.loading': 'Loading workspaces...',
    'workspace.noWorkspaces': 'No workspaces created yet',
    'workspace.createFirst': 'Create Your First Workspace',
    'workspace.loadFailed': 'Failed to load workspaces',
    'workspace.nameRequired': 'Workspace name is required',
    'workspace.createFailed': 'Failed to create workspace',
    'workspace.creating': 'Creating...',
    'workspace.create': 'Create Workspace',
    'workspace.reset': 'Reset',
    'workspace.deleteConfirm': 'Are you sure you want to unregister workspace "{name}"?\n\nNote: Files will NOT be deleted, only the workspace registration.',
    'workspace.deleteFailed': 'Failed to unregister workspace',
    'workspace.created': 'Created',
    'memory.title': 'Memory',
    'memory.register': 'Register Memory',
    'memory.description': 'Manage memory namespaces for AI agent learning and knowledge storage. Memory records are stored in the database with identity-based access control.',
    'memory.myMemories': 'My Memories',
    'memory.storedMemories': 'Stored Memories',
    'memory.registerNew': 'Register New Memory',
    'memory.path': 'Memory Path Suffix',
    'memory.pathPlaceholder': 'my-memory',
    'memory.pathDescription': 'Path suffix (prefix /memory/{user_id}/ is auto-added)',
    'memory.name': 'Name',
    'memory.nameDescription': 'Display name for the memory namespace',
    'memory.descriptionLabel': 'Description',
    'memory.descriptionPlaceholder': 'Memory namespace description...',
    'memory.loading': 'Loading memories...',
    'memory.noMemories': 'No memories registered yet',
    'memory.registerFirst': 'Register Your First Memory',
    'memory.loadFailed': 'Failed to load memories',
    'memory.pathRequired': 'Memory path suffix is required',
    'memory.pathNoSlash': 'Path should not start with "/" (prefix is auto-added)',
    'memory.registerFailed': 'Failed to register memory',
    'memory.registering': 'Registering...',
    'memory.deleteConfirm': 'Are you sure you want to delete this memory?\n\n"{preview}"\n\nThis action cannot be undone.',
    'memory.deleteFailed': 'Failed to delete memory',
    'memory.unregisterConfirm': 'Are you sure you want to unregister memory "{name}"?\n\nNote: Files will NOT be deleted, only the memory registration.',
    'memory.unregisterFailed': 'Failed to unregister memory',
    'connector.title': 'Connector',
    'connector.add': 'Add Connector',
    'connector.description': 'Manage your connectors to connect external backends with Nexus. Saved connectors persist across server restarts.',
    'connector.connectors': 'Connectors',
    'connector.integrations': 'Integrations',
    'connector.saved': 'Saved Connectors',
    'connector.configured': '{count} connector{plural} configured',
    'connector.noConfigured': 'No connectors configured yet',
    'connector.loading': 'Loading connectors...',
    'connector.noSaved': 'No saved connectors found',
    'connector.addFirst': 'Add Your First Connector',
    'connector.active': 'Active',
    'connector.notLoaded': 'Not Loaded',
    'connector.readOnly': 'Read-only',
    'connector.load': 'Load',
    'connector.delete': 'Delete',
    'connector.deleteConfirm': 'Are you sure you want to delete the connector "{mount}"? This will:\n- Remove the saved connector configuration\n- Delete the connector directory and all its contents\n- Deactivate the connector if it\'s currently active\n\nThis action cannot be undone.',
    'connector.loaded': 'Connector loaded successfully: {mount}',
    'connector.loadFailed': 'Failed to load connector {mount}',
    'connector.deleted': 'Connector deleted successfully: {mount}',
    'connector.deleteFailed': 'Failed to delete connector {mount}',
  },
  ch: {
    'common.loading': '加载中...',
    'common.error': '错误',
    'common.success': '成功',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.save': '保存',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.create': '创建',
    'common.close': '关闭',
    'common.search': '搜索',
    'common.login': '登录',
    'common.logout': '退出',
    'common.export': '导出',
    'common.settings': '设置',
    'common.language': '语言',
    'common.theme': '主题',
    'common.english': 'English',
    'common.chinese': '中文',
    'landing.nexus': 'Nexus',
    'landing.user': '用户',
    'landing.tenant': '租户',
    'landing.workspace': '工作区',
    'landing.memory': '记忆',
    'landing.agent': '智能体',
    'landing.connector': '连接器',
    'landing.skill': '技能包',
    'landing.admin': '管理',
    'landing.authError': '认证错误',
    'landing.updateApiKey': '更新 API 密钥',
    'landing.showAiPanel': '显示 AI 面板',
    'landing.hideAiPanel': '隐藏 AI 面板',
    'landing.docs': '文档',
    'landing.api': 'API',
    'landing.help': '帮助',
    'login.title': '登录 NexusFS',
    'login.description': '输入您的 API 密钥以访问文件系统',
    'login.placeholder': '输入 API 密钥',
    'login.enterApiKey': '请输入 API 密钥',
    'login.invalidKey': '无效的 API 密钥',
    'login.validating': '验证中...',
    'login.success': '登录成功',
    'skill.title': '技能包',
    'skill.upload': '上传技能包',
    'skill.description': '管理和上传您的 Nexus 实例的技能包。技能包可以是个人或系统级的。',
    'skill.all': '全部技能包',
    'skill.personal': '个人',
    'skill.system': '系统',
    'skill.loadFailed': '加载技能包失败',
    'skill.notFound': '未找到技能包',
    'skill.uploadFirst': '上传您的第一个技能包开始使用',
    'skill.saved': '技能包保存成功',
    'skill.saveFailed': '保存技能包失败',
    'skill.deleteConfirm': '您确定要删除技能包 "{name}" 吗？',
    'skill.deleted': '技能包 "{name}" 删除成功',
    'skill.deleteFailed': '删除技能包失败',
    'skill.exported': '技能包 "{name}" 导出成功',
    'skill.exportFailed': '导出技能包失败',
    'skill.edit': '编辑技能包',
    'skill.loadContentFailed': '加载技能包内容失败',
    'skill.dependencies': '依赖项',
    'skill.by': '作者',
    'agent.title': '智能体',
    'agent.create': '创建智能体',
    'agent.edit': '编辑智能体',
    'agent.list': '智能体列表',
    'agent.name': '名称',
    'agent.descriptionLabel': '描述',
    'agent.platform': '平台',
    'agent.endpoint': '端点',
    'agent.apiKey': 'API 密钥',
    'agent.generateKey': '生成 API 密钥',
    'agent.inheritPermissions': '继承权限',
    'agent.register': '注册',
    'agent.registering': '注册中...',
    'agent.registered': '智能体注册成功',
    'agent.registerFailed': '注册智能体失败',
    'agent.deleteConfirm': '您确定要删除智能体 "{name}" 吗？',
    'agent.deleted': '智能体删除成功',
    'agent.deleteFailed': '删除智能体失败',
    'agent.loadFailed': '加载智能体失败',
    'agent.noAgents': '未找到智能体',
    'agent.createFirst': '创建您的第一个智能体开始使用',
    'agent.description': '管理您的 AI 智能体以进行委托和多智能体工作流。智能体继承您的所有权限。',
    'agent.myAgents': '我的智能体',
    'agent.useAgent': '使用智能体',
    'agent.registerNew': '注册新智能体',
    'agent.nameCannotChange': '智能体名称无法更改',
    'agent.endpointDescription': '智能体服务端点 URL',
    'agent.agentId': '智能体 ID',
    'agent.agentIdDescription': '用于路由的智能体标识符（默认：agent）',
    'agent.generateApiKey': '为智能体生成 API 密钥',
    'agent.ownApiKey': '智能体将拥有自己的 API 密钥（用于独立身份验证）',
    'agent.recommendedAuth': '推荐：智能体将使用所有者的凭据 + X-Agent-ID 标头',
    'agent.inheritPermissionsDesc': '继承所有者的权限',
    'agent.inheritsAll': '✓ 智能体继承您的所有权限',
    'agent.zeroPermissions': '⚠️ 智能体从 0 权限开始（通过 ReBAC 授予）',
    'agent.grantSkills': '授予技能包访问权限（可选）',
    'agent.loadingSkills': '加载技能包中...',
    'agent.noSkillsAvailable': '没有可用的技能包',
    'agent.selectSkillsDesc': '选择技能包以授予只读访问权限。智能体将能够使用这些技能包。',
    'agent.skillsAccess': '技能包访问',
    'agent.connectorsAccess': '连接器访问',
    'agent.loadingConnectors': '加载连接器中...',
    'agent.noConnectorsAvailable': '没有可用的连接器',
    'agent.selectConnectorsDesc': '选择连接器并选择权限级别（只读或读写）。',
    'agent.grantConnectors': '授予连接器访问权限（可选）',
    'agent.workspacesAccess': '工作区访问',
    'agent.grantAllWorkspaces': '授予所有工作区的访问权限',
    'agent.allWorkspacesDesc': '所有当前和未来工作区的基础权限',
    'agent.individualWorkspaces': '单个工作区权限（可选）',
    'agent.loadingWorkspaces': '加载工作区中...',
    'agent.noWorkspacesAvailable': '没有可用的工作区',
    'agent.allWorkspacesEnabled': '✓ 已启用所有工作区访问。单个权限可以覆盖或增强基础权限（例如，所有工作区只读，特定工作区读写）。',
    'agent.grantBaseAccess': '授予所有工作区的基础访问权限，或选择单个工作区进行精细控制。',
    'agent.directoryAccess': '目录访问',
    'agent.memory': '记忆 (/memory)',
    'agent.memoryDesc': '智能体可以访问记忆存储',
    'agent.resources': '资源 (/resource)',
    'agent.resourcesDesc': '智能体可以访问资源文件',
    'agent.grantDirectory': '授予目录访问权限（可选）',
    'agent.grantDirectoryDesc': '授予整个目录的只读访问权限。',
    'agent.permissionModel': '权限模型：',
    'agent.fullPermissionsAuto': '完全权限：智能体使用您的凭据并自动继承您的所有权限。',
    'agent.fullPermissionsKey': '完全权限：智能体拥有自己的 API 密钥但继承您的所有权限。',
    'agent.zeroPermissionsRec': '零权限（推荐）：智能体从无权限开始。通过 ReBAC 授予特定权限以实现最小权限原则。',
    'agent.inheritsOwner': '此智能体继承所有所有者权限',
    'agent.inheritsOwnerDesc': '此智能体当前使用您的凭据，可以完全访问您的所有资源。要限制访问，请使用最小权限原则在下面授予特定权限。',
    'agent.explicitPermissions': '已配置显式权限',
    'agent.explicitPermissionsDesc': '此智能体具有下面授予的特定权限。它只能访问您明确允许的资源。',
    'agent.readOnly': '只读',
    'agent.readWrite': '读写',
    'agent.namePlaceholder': 'data_analyst',
    'agent.nameDescription': '智能体的唯一名称（仅小写字母、数字、下划线、连字符）',
    'agent.descriptionPlaceholder': '一个帮助处理各种任务的通用助手...',
    'agent.all': '全部',
    'agent.resource': '资源',
    'workspace.title': '工作区',
    'workspace.new': '新建工作区',
    'workspace.myWorkspaces': '我的工作区',
    'workspace.description': '管理工作区以组织文件和项目。工作区支持通过快照进行版本控制。',
    'workspace.name': '工作区名称',
    'workspace.namePlaceholder': 'my-project',
    'workspace.nameDescription': '工作区名称（将自动放置在租户/用户命名空间中，并带有 UUID 后缀）',
    'workspace.descriptionLabel': '描述',
    'workspace.descriptionPlaceholder': '项目描述...',
    'workspace.whatAre': '什么是工作区？',
    'workspace.whatAreDesc': '工作区是支持通过快照进行版本控制的注册目录。您可以创建快照、恢复到以前的版本并比较更改。',
    'workspace.about': '关于工作区：',
    'workspace.aboutDesc': '工作区组织您的文件并支持快照进行版本控制。工作区使用多租户命名空间约定创建，并自动拥有 ReBAC 所有权。',
    'workspace.loading': '加载工作区中...',
    'workspace.noWorkspaces': '尚未创建工作区',
    'workspace.createFirst': '创建您的第一个工作区',
    'workspace.loadFailed': '加载工作区失败',
    'workspace.nameRequired': '工作区名称是必需的',
    'workspace.createFailed': '创建工作区失败',
    'workspace.creating': '创建中...',
    'workspace.create': '创建工作区',
    'workspace.reset': '重置',
    'workspace.deleteConfirm': '您确定要注销工作区 "{name}" 吗？\n\n注意：文件不会被删除，只会注销工作区注册。',
    'workspace.deleteFailed': '注销工作区失败',
    'workspace.created': '创建于',
    'memory.title': '记忆',
    'memory.register': '注册记忆',
    'memory.description': '管理 AI 智能体学习和知识存储的记忆命名空间。记忆记录存储在数据库中，具有基于身份的访问控制。',
    'memory.myMemories': '我的记忆',
    'memory.storedMemories': '已存储的记忆',
    'memory.registerNew': '注册新记忆',
    'memory.path': '记忆路径后缀',
    'memory.pathPlaceholder': 'my-memory',
    'memory.pathDescription': '路径后缀（前缀 /memory/{user_id}/ 会自动添加）',
    'memory.name': '名称',
    'memory.nameDescription': '记忆命名空间的显示名称',
    'memory.descriptionLabel': '描述',
    'memory.descriptionPlaceholder': '记忆命名空间描述...',
    'memory.loading': '加载记忆中...',
    'memory.noMemories': '尚未注册记忆',
    'memory.registerFirst': '注册您的第一个记忆',
    'memory.loadFailed': '加载记忆失败',
    'memory.pathRequired': '记忆路径后缀是必需的',
    'memory.pathNoSlash': '路径不应以 "/" 开头（前缀会自动添加）',
    'memory.registerFailed': '注册记忆失败',
    'memory.registering': '注册中...',
    'memory.deleteConfirm': '您确定要删除此记忆吗？\n\n"{preview}"\n\n此操作无法撤销。',
    'memory.deleteFailed': '删除记忆失败',
    'memory.unregisterConfirm': '您确定要注销记忆 "{name}" 吗？\n\n注意：文件不会被删除，只会注销记忆注册。',
    'memory.unregisterFailed': '注销记忆失败',
    'connector.title': '连接器',
    'connector.add': '添加连接器',
    'connector.description': '管理您的连接器以将外部后端与 Nexus 连接。保存的连接器在服务器重启后仍然存在。',
    'connector.connectors': '连接器',
    'connector.integrations': '集成',
    'connector.saved': '已保存的连接器',
    'connector.configured': '已配置 {count} 个连接器',
    'connector.noConfigured': '尚未配置连接器',
    'connector.loading': '加载连接器中...',
    'connector.noSaved': '未找到已保存的连接器',
    'connector.addFirst': '添加您的第一个连接器',
    'connector.active': '已激活',
    'connector.notLoaded': '未加载',
    'connector.readOnly': '只读',
    'connector.load': '加载',
    'connector.delete': '删除',
    'connector.deleteConfirm': '您确定要删除连接器 "{mount}" 吗？这将：\n- 删除保存的连接器配置\n- 删除连接器目录及其所有内容\n- 如果连接器当前处于活动状态，则停用它\n\n此操作无法撤销。',
    'connector.loaded': '连接器加载成功：{mount}',
    'connector.loadFailed': '加载连接器失败 {mount}',
    'connector.deleted': '连接器删除成功：{mount}',
    'connector.deleteFailed': '删除连接器失败 {mount}',
  },
};





