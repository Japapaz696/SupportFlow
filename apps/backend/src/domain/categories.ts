import type { Category, TicketPriority } from '@supportflow/shared';

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  default_priority: TicketPriority;
};

export type CreateCategoryInput = {
  name: string;
  description: string | null;
  defaultPriority: TicketPriority;
};

export type UpdateCategoryInput = {
  name?: string;
  description?: string | null;
  defaultPriority?: TicketPriority;
  isActive?: boolean;
};

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    defaultPriority: row.default_priority,
  };
}
