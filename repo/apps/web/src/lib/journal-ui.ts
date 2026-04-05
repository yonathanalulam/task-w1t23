export const fieldTypeRequiresOptions = (fieldType: string): boolean => fieldType === 'SELECT';

export const journalStateLabel = (isDeleted: boolean): 'ACTIVE' | 'DELETED' => (isDeleted ? 'DELETED' : 'ACTIVE');

export const journalStateTone = (isDeleted: boolean): 'active' | 'deleted' => (isDeleted ? 'deleted' : 'active');
