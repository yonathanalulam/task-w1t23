export const roleSurfaces = [
  { role: 'researcher', href: '/researcher', label: 'Researcher Workspace' },
  { role: 'reviewer', href: '/reviewer', label: 'Reviewer Workspace' },
  { role: 'approver', href: '/approver', label: 'Approver Workspace' },
  { role: 'resource_manager', href: '/manager', label: 'Resource Manager Workspace' },
  { role: 'finance_clerk', href: '/finance', label: 'Finance Workspace' },
  { role: 'administrator', href: '/admin', label: 'Administrator Workspace' }
] as const;

export type RoleSurface = (typeof roleSurfaces)[number];
